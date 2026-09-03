import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes, randomInt, randomUUID } from "crypto";
import { MfaMethod } from "@omnianote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TotpService } from "./totp.service";
import { RedisService } from "../common/redis/redis.service";
import { NotificationService } from "../notifications/notification.service";

const BACKUP_CODE_COUNT = 8;
const EMAIL_ENROLL_TTL_SECONDS = 5 * 60;
const emailEnrollKey = (userId: string) => `mfa:email-enroll:${userId}`;

@Injectable()
export class MfaEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
    private readonly redis: RedisService,
    private readonly notifications: NotificationService,
  ) {}

  /** Step 1: generate and persist (encrypted) a pending secret, return it for the user to scan. */
  async startTotpEnrollment(userId: string): Promise<{ secret: string; qrCodeDataUrl: string }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = this.totp.generateSecret();
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaTotpSecret: this.totp.encryptSecret(secret) },
    });
    const qrCodeDataUrl = await this.totp.buildQrCodeDataUrl(user.email, secret);
    return { secret, qrCodeDataUrl };
  }

  /** Step 2: confirm the user actually captured a working secret before turning MFA on. */
  async confirmTotpEnrollment(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaTotpSecret) {
      throw new BadRequestException("No pending TOTP enrollment — call the enroll endpoint first");
    }
    const secret = this.totp.decryptSecret(user.mfaTotpSecret);
    if (!this.totp.verify(code, secret)) {
      throw new BadRequestException("Incorrect code");
    }

    return this.enableMfa(userId, MfaMethod.TOTP);
  }

  /** Step 1: email a code to the account's own address — nothing to persist yet, unlike TOTP's secret. */
  async startEmailEnrollment(userId: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.redis.setWithTtl(emailEnrollKey(userId), await argon2.hash(code), EMAIL_ENROLL_TTL_SECONDS);
    await this.notifications.sendOtpCode(MfaMethod.EMAIL, user.email, code);
  }

  /** Step 2: confirm the code actually arrived before turning MFA on. */
  async confirmEmailEnrollment(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const hash = await this.redis.get(emailEnrollKey(userId));
    if (!hash || !(await argon2.verify(hash, code))) {
      throw new UnauthorizedException("Incorrect or expired code");
    }
    await this.redis.del(emailEnrollKey(userId));

    return this.enableMfa(userId, MfaMethod.EMAIL);
  }

  private async enableMfa(userId: string, method: MfaMethod): Promise<{ backupCodes: string[] }> {
    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString("hex"));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, mfaPreferred: method },
      }),
      this.prisma.mfaBackupCode.deleteMany({ where: { userId } }),
      this.prisma.mfaBackupCode.createMany({
        data: await Promise.all(
          backupCodes.map(async (code) => ({
            id: randomUUID(),
            userId,
            codeHash: await argon2.hash(code),
          })),
        ),
      }),
    ]);

    return { backupCodes }; // shown to the user exactly once — the API never returns them again
  }
}
