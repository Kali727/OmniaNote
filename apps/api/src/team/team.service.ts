import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as argon2 from "argon2";
import { randomBytes } from "crypto";
import {
  AcceptInviteInput,
  AccountRole,
  InviteTeammateInput,
  TIER_LIMITS,
  UpdateAccountNameInput,
  isWithinTeamMemberLimit,
} from "@omnianote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EnvConfig } from "../config/env.validation";
import { NotificationService } from "../notifications/notification.service";
import { AuthService, AuthTokens } from "../auth/auth.service";

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly auth: AuthService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  async listMembers(accountId: string) {
    const [account, members, invites] = await Promise.all([
      this.prisma.account.findUniqueOrThrow({ where: { id: accountId } }),
      this.prisma.user.findMany({
        where: { accountId },
        select: { id: true, username: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.invite.findMany({
        where: { accountId, acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      accountName: await this.accountDisplayName(account),
      tier: account.tier,
      maxTeamMembers: TIER_LIMITS[account.tier].maxTeamMembers,
      members,
      invites,
    };
  }

  async updateAccountName(accountId: string, callerUserId: string, input: UpdateAccountNameInput) {
    const caller = await this.prisma.user.findUniqueOrThrow({ where: { id: callerUserId } });
    if (caller.role !== AccountRole.OWNER) {
      throw new ForbiddenException("Only an owner can rename the team");
    }
    const updated = await this.prisma.account.update({ where: { id: accountId }, data: { name: input.name } });
    return { name: updated.name };
  }

  async inviteTeammate(accountId: string, inviterUserId: string, input: InviteTeammateInput) {
    const inviter = await this.prisma.user.findUniqueOrThrow({ where: { id: inviterUserId } });
    this.assertCanManageTeam(inviter.role);

    const existingUser = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw new ConflictException(
        existingUser.accountId === accountId
          ? "That person is already on this team"
          : "That email already belongs to an account elsewhere",
      );
    }

    const account = await this.prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const [memberCount, pendingInviteCount, existingInvite] = await Promise.all([
      this.prisma.user.count({ where: { accountId } }),
      this.prisma.invite.count({ where: { accountId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      this.prisma.invite.findFirst({ where: { accountId, email: input.email, acceptedAt: null, expiresAt: { gt: new Date() } } }),
    ]);
    if (!existingInvite && !isWithinTeamMemberLimit(account.tier, memberCount + pendingInviteCount)) {
      throw new ForbiddenException(`Your ${account.tier} plan allows a limited number of team members — upgrade to add another.`);
    }

    const token = randomBytes(INVITE_TOKEN_BYTES).toString("base64url");
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    // Resending to an email that already has a live pending invite just refreshes it in
    // place, rather than piling up duplicate invite rows for the same address.
    const invite = existingInvite
      ? await this.prisma.invite.update({
          where: { id: existingInvite.id },
          data: { role: input.role, token, expiresAt, invitedByUserId: inviterUserId },
        })
      : await this.prisma.invite.create({
          data: { accountId, email: input.email, role: input.role, token, expiresAt, invitedByUserId: inviterUserId },
        });

    const acceptUrl = `${this.config.get("APP_URL", { infer: true })}/invite/${token}`;
    await this.notifications.sendTeamInvite(input.email, await this.accountDisplayName(account), inviter.username, acceptUrl);
    return { id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt };
  }

  async revokeInvite(accountId: string, callerUserId: string, inviteId: string) {
    const caller = await this.prisma.user.findUniqueOrThrow({ where: { id: callerUserId } });
    this.assertCanManageTeam(caller.role);

    const invite = await this.prisma.invite.findUnique({ where: { id: inviteId } });
    if (!invite || invite.accountId !== accountId) throw new NotFoundException("Invite not found");
    await this.prisma.invite.delete({ where: { id: inviteId } });
    return { ok: true };
  }

  async removeMember(accountId: string, callerUserId: string, targetUserId: string) {
    if (callerUserId === targetUserId) {
      throw new BadRequestException("You can't remove yourself from the team this way");
    }
    const [caller, target] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: callerUserId } }),
      this.prisma.user.findUnique({ where: { id: targetUserId } }),
    ]);
    if (!target || target.accountId !== accountId) throw new NotFoundException("Team member not found");
    this.assertCanManageTeam(caller.role);
    if (target.role !== AccountRole.MEMBER && caller.role !== AccountRole.OWNER) {
      throw new ForbiddenException("Only an owner can remove an admin");
    }
    if (target.role === AccountRole.OWNER) {
      await this.assertNotLastOwner(accountId, targetUserId);
    }

    await this.prisma.user.delete({ where: { id: targetUserId } });
    return { ok: true };
  }

  async updateMemberRole(accountId: string, callerUserId: string, targetUserId: string, role: AccountRole) {
    const caller = await this.prisma.user.findUniqueOrThrow({ where: { id: callerUserId } });
    if (caller.role !== AccountRole.OWNER) {
      throw new ForbiddenException("Only an owner can change roles");
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!target || target.accountId !== accountId) throw new NotFoundException("Team member not found");

    if (target.role === AccountRole.OWNER && role !== AccountRole.OWNER) {
      await this.assertNotLastOwner(accountId, targetUserId);
    }

    const updated = await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
      select: { id: true, username: true, email: true, role: true },
    });
    return updated;
  }

  /** Public — no auth yet, this is what the invitee sees before they've created any credentials. */
  async previewInvite(token: string) {
    const invite = await this.getLiveInviteOrThrow(token);
    const [account, inviter] = await Promise.all([
      this.prisma.account.findUniqueOrThrow({ where: { id: invite.accountId } }),
      this.prisma.user.findUnique({ where: { id: invite.invitedByUserId }, select: { username: true } }),
    ]);
    return {
      email: invite.email,
      role: invite.role,
      accountName: await this.accountDisplayName(account),
      inviterName: inviter?.username ?? "Someone",
    };
  }

  async acceptInvite(token: string, input: AcceptInviteInput): Promise<AuthTokens> {
    const invite = await this.getLiveInviteOrThrow(token);

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: invite.email }, { username: input.username }] },
      select: { id: true, email: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === invite.email
          ? "An account with this email already exists — sign in instead"
          : "That username is already taken",
      );
    }

    const passwordHash = await argon2.hash(input.password);
    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          accountId: invite.accountId,
          email: invite.email,
          username: input.username,
          passwordHash,
          mobileNumber: input.mobileNumber,
          role: invite.role,
        },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return created;
    });

    return this.auth.issueTokens(user.id);
  }

  private async getLiveInviteOrThrow(token: string) {
    const invite = await this.prisma.invite.findUnique({ where: { token } });
    if (!invite || invite.acceptedAt) throw new NotFoundException("Invite not found or already used");
    if (invite.expiresAt < new Date()) throw new NotFoundException("This invite has expired");
    return invite;
  }

  private assertCanManageTeam(role: AccountRole): void {
    if (role !== AccountRole.OWNER && role !== AccountRole.ADMIN) {
      throw new ForbiddenException("Only an owner or admin can manage the team");
    }
  }

  private async assertNotLastOwner(accountId: string, excludingUserId: string): Promise<void> {
    const otherOwnerCount = await this.prisma.user.count({
      where: { accountId, role: AccountRole.OWNER, id: { not: excludingUserId } },
    });
    if (otherOwnerCount === 0) {
      throw new BadRequestException("An account must always have at least one owner");
    }
  }

  private async accountDisplayName(account: { id: string; name: string | null }): Promise<string> {
    if (account.name) return account.name;
    const owner = await this.prisma.user.findFirst({
      where: { accountId: account.id, role: AccountRole.OWNER },
      select: { username: true },
      orderBy: { createdAt: "asc" },
    });
    return owner ? `${owner.username}'s team` : "your team";
  }
}
