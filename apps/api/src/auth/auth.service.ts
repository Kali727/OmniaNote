import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes, randomUUID } from "crypto";
import { AccountRole, MfaMethod, RegisterInput } from "@omnianote/shared";
import { PrismaService } from "../prisma/prisma.service";
import { EnvConfig } from "../config/env.validation";
import { TotpService } from "./totp.service";
import { MfaChallengeService } from "./mfa-challenge.service";

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export type LoginResult = AuthTokens | { mfaRequired: true; challengeToken: string; method: MfaMethod };

const REFRESH_TOKEN_BYTES = 48;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly totp: TotpService,
    private readonly mfaChallenges: MfaChallengeService,
  ) {}

  async register(input: RegisterInput): Promise<AuthTokens> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: input.username }] },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException("An account with that email or username already exists");
    }

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({ data: {} }); // defaults to FREE tier
      return tx.user.create({
        data: {
          accountId: account.id,
          email: input.email,
          username: input.username,
          passwordHash,
          mobileNumber: input.mobileNumber,
          role: AccountRole.OWNER,
        },
      });
    });

    return this.issueTokens(user.id);
  }

  async login(emailOrUsername: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: emailOrUsername }, { username: emailOrUsername }] },
    });
    if (!user || !(await argon2.verify(user.passwordHash, password))) {
      throw new UnauthorizedException("Incorrect email/username or password");
    }

    if (!user.mfaEnabled || !user.mfaPreferred) {
      return this.issueTokens(user.id);
    }

    const challengeToken = await this.mfaChallenges.createChallenge(user.id, user.mfaPreferred);
    if (user.mfaPreferred !== MfaMethod.TOTP) {
      const destination = user.mfaPreferred === MfaMethod.EMAIL ? user.email : user.mobileNumber;
      await this.mfaChallenges.sendOtpForChallenge(challengeToken, destination);
    }
    return { mfaRequired: true, challengeToken, method: user.mfaPreferred };
  }

  async verifyMfaChallenge(challengeToken: string, code: string): Promise<AuthTokens> {
    const { userId, method } = await this.mfaChallenges.getChallenge(challengeToken);

    if (method === MfaMethod.TOTP) {
      const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
      const secret = this.totp.decryptSecret(user.mfaTotpSecret!);
      if (!this.totp.verify(code, secret)) {
        throw new UnauthorizedException("Incorrect or expired code");
      }
    } else {
      await this.mfaChallenges.verifyOtp(challengeToken, code);
    }

    await this.mfaChallenges.consumeChallenge(challengeToken);
    return this.issueTokens(userId);
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token is invalid or expired");
    }

    // Rotate: the old refresh token is single-use.
    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
    return this.issueTokens(stored.userId);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashRefreshToken(rawRefreshToken);
    await this.prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  }

  private async issueTokens(userId: string): Promise<AuthTokens> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { accountId: true } });
    const accessToken = await this.jwt.signAsync(
      { sub: userId, accountId: user.accountId },
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.config.get("JWT_ACCESS_TTL", { infer: true }),
      },
    );

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString("base64url");
    const refreshTtlMs = this.parseTtlToMs(this.config.get("JWT_REFRESH_TTL", { infer: true }));
    await this.prisma.refreshToken.create({
      data: {
        id: randomUUID(),
        userId,
        tokenHash: this.hashRefreshToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtlMs),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashRefreshToken(token: string): string {
    // Refresh tokens are high-entropy random bytes (not passwords), so a fast SHA-256
    // lookup hash is appropriate here — argon2 is reserved for user-chosen secrets.
    return createHash("sha256").update(token).digest("hex");
  }

  private parseTtlToMs(ttl: string): number {
    const match = /^(\d+)([smhd])$/.exec(ttl);
    if (!match) throw new Error(`Invalid TTL format: ${ttl}`);
    const value = Number(match[1]);
    const unitMs = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]]!;
    return value * unitMs;
  }
}
