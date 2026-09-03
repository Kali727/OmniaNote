import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { TotpService } from "./totp.service";
import { MfaChallengeService } from "./mfa-challenge.service";
import { MfaEnrollmentService } from "./mfa-enrollment.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { EncryptionService } from "../common/crypto/encryption.service";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  // JwtModule is registered with no default secret/options — every sign/verify call in
  // AuthService passes its own secret and TTL explicitly, since access and refresh
  // tokens intentionally use different secrets.
  imports: [PassportModule, JwtModule.register({}), NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    TotpService,
    MfaChallengeService,
    MfaEnrollmentService,
    JwtStrategy,
    EncryptionService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
