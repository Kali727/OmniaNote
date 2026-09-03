import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { EnvConfig } from "../../config/env.validation";

// Ephemeral, TTL-bound values only (MFA challenges/OTP codes, rate-limit counters).
// Anything that needs to survive a Redis flush belongs in Postgres, not here.
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService<EnvConfig, true>) {
    this.client = new Redis(config.get("REDIS_URL", { infer: true }));
  }

  async setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.client.set(key, value, "EX", ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const count = await this.client.incr(key);
    if (count === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return count;
  }

  async onModuleDestroy() {
    this.client.disconnect();
  }
}
