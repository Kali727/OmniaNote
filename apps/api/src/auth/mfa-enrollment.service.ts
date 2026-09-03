import { BadRequestException, Injectable } from "@nestjs/common";
import * as argon2 from "argon2";
import { randomBytes, randomUUID } from "crypto";
import { MfaMethod } from "@omnianote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TotpService } from "./totp.service";

const BACKUP_CODE_COUNT = 8;

@Injectable()
export class MfaEnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly totp: TotpService,
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

    const backupCodes = Array.from({ length: BACKUP_CODE_COUNT }, () => randomBytes(5).toString("hex"));

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { mfaEnabled: true, mfaPreferred: MfaMethod.TOTP },
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
