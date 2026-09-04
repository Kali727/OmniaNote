import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { RedisService } from "../common/redis/redis.service";
import { StorageService } from "../storage/storage.service";
import { EnvConfig } from "../config/env.validation";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StorageService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async getOverview() {
    const now = Date.now();
    const [
      accountsByTier,
      totalUsers,
      onlineNow,
      activeLast24h,
      activeLast7d,
      newUsersLast30d,
      totalItems,
      storageAgg,
      countryBreakdown,
      errorsLast24h,
      subscriptionsByStatus,
    ] = await Promise.all([
      this.prisma.account.groupBy({ by: ["tier"], _count: true }),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { lastSeenAt: { gte: new Date(now - ONLINE_WINDOW_MS) } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: new Date(now - DAY_MS) } } }),
      this.prisma.user.count({ where: { lastSeenAt: { gte: new Date(now - WEEK_MS) } } }),
      this.prisma.user.count({ where: { createdAt: { gte: new Date(now - MONTH_MS) } } }),
      this.prisma.item.count(),
      this.prisma.account.aggregate({ _sum: { storageUsedBytes: true } }),
      this.prisma.user.groupBy({
        by: ["lastKnownCountry"],
        _count: true,
        where: { lastKnownCountry: { not: null } },
        orderBy: { _count: { lastKnownCountry: "desc" } },
      }),
      this.prisma.errorLog.count({ where: { createdAt: { gte: new Date(now - DAY_MS) } } }),
      this.prisma.subscription.groupBy({ by: ["status"], _count: true }),
    ]);

    return {
      totalAccounts: accountsByTier.reduce((sum, row) => sum + row._count, 0),
      accountsByTier: Object.fromEntries(accountsByTier.map((row) => [row.tier, row._count])),
      totalUsers,
      onlineNow,
      activeLast24h,
      activeLast7d,
      newUsersLast30d,
      totalItems,
      totalStorageBytes: Number(storageAgg._sum.storageUsedBytes ?? 0),
      countryBreakdown: countryBreakdown.map((row) => ({ country: row.lastKnownCountry as string, count: row._count })),
      errorsLast24h,
      subscriptionsByStatus: Object.fromEntries(subscriptionsByStatus.map((row) => [row.status, row._count])),
    };
  }

  async listErrors(limit: number, cursor?: string) {
    const errors = await this.prisma.errorLog.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
    });
    return { errors, nextCursor: errors.length === limit ? errors[errors.length - 1].id : null };
  }

  async listAccounts(limit: number, cursor?: string, search?: string) {
    const accounts = await this.prisma.account.findMany({
      take: limit,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: "desc" },
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { users: { some: { OR: [{ email: { contains: search, mode: "insensitive" } }, { username: { contains: search, mode: "insensitive" } }] } } },
            ],
          }
        : undefined,
      include: { _count: { select: { users: true, items: true, locations: true } } },
    });
    return {
      accounts: accounts.map((account) => ({
        id: account.id,
        name: account.name,
        tier: account.tier,
        storageUsedBytes: Number(account.storageUsedBytes),
        memberCount: account._count.users,
        itemCount: account._count.items,
        locationCount: account._count.locations,
        createdAt: account.createdAt,
      })),
      nextCursor: accounts.length === limit ? accounts[accounts.length - 1].id : null,
    };
  }

  async getHealth() {
    const [database, redis, meilisearch, storage] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`
        .then(() => true)
        .catch(() => false),
      this.redis.client
        .ping()
        .then(() => true)
        .catch(() => false),
      fetch(`${this.config.get("MEILI_HOST", { infer: true })}/health`)
        .then((res) => res.ok)
        .catch(() => false),
      this.storage.checkConnection(),
    ]);
    return { uptimeSeconds: Math.round(process.uptime()), checks: { database, redis, meilisearch, storage } };
  }
}
