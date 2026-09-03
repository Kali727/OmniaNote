import { Injectable, UnauthorizedException } from "@nestjs/common";
import { randomInt, randomUUID } from "crypto";
import * as argon2 from "argon2";
import { MfaMethod } from "@maintnote/shared";
import { RedisService } from "../common/redis/redis.service";
import { NotificationService } from "../notifications/notification.service";

const CHALLENGE_TTL_SECONDS = 5 * 60;
const challengeKey = (token: string) => `mfa:challenge:${token}`;
const otpKey = (token: string) => `mfa:otp:${token}`;

interface ChallengePayload {
  userId: string;
  method: MfaMethod;
}

/**
 * Represents the gap between "password checked out" and "session issued" while MFA is
 * pending. The challenge token is opaque and short-lived; it authorizes nothing on its
 * own except submitting one MFA code for one specific user.
 */
@Injectable()
export class MfaChallengeService {
  constructor(
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  async createChallenge(userId: string, method: MfaMethod): Promise<string> {
    const token = randomUUID();
    const payload: ChallengePayload = { userId, method };
    await this.redis.setWithTtl(challengeKey(token), JSON.stringify(payload), CHALLENGE_TTL_SECONDS);
    return token;
  }

  async sendOtpForChallenge(token: string, destination: string): Promise<void> {
    const payload = await this.getChallenge(token);
    if (payload.method === MfaMethod.TOTP) {
      return; // TOTP codes come from the authenticator app, nothing to send
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const codeHash = await argon2.hash(code);
    await this.redis.setWithTtl(otpKey(token), codeHash, CHALLENGE_TTL_SECONDS);
    await this.notifications.sendOtpCode(payload.method, destination, code);
  }

  async getChallenge(token: string): Promise<ChallengePayload> {
    const raw = await this.redis.get(challengeKey(token));
    if (!raw) {
      throw new UnauthorizedException("MFA challenge expired or invalid");
    }
    return JSON.parse(raw) as ChallengePayload;
  }

  async verifyOtp(token: string, code: string): Promise<void> {
    const hash = await this.redis.get(otpKey(token));
    if (!hash || !(await argon2.verify(hash, code))) {
      throw new UnauthorizedException("Incorrect or expired code");
    }
    await this.redis.del(otpKey(token));
  }

  async consumeChallenge(token: string): Promise<void> {
    await this.redis.del(challengeKey(token));
  }
}
