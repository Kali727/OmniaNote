import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { MfaEnrollmentService } from "./mfa-enrollment.service";
import {
  LoginDto,
  MfaChallengeVerifyDto,
  MfaEnrollEmailVerifyDto,
  MfaEnrollTotpVerifyDto,
  RefreshTokenDto,
  RegisterDto,
} from "./dto/auth.dto";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtPayload } from "./strategies/jwt.strategy";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly mfaEnrollment: MfaEnrollmentService,
  ) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @HttpCode(HttpStatus.OK)
  @Post("login")
  login(@Body() body: LoginDto) {
    return this.auth.login(body.emailOrUsername, body.password);
  }

  @HttpCode(HttpStatus.OK)
  @Post("mfa/challenge/verify")
  verifyMfaChallenge(@Body() body: MfaChallengeVerifyDto) {
    return this.auth.verifyMfaChallenge(body.challengeToken, body.code);
  }

  @HttpCode(HttpStatus.OK)
  @Post("refresh")
  refresh(@Body() body: RefreshTokenDto) {
    return this.auth.refresh(body.refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post("logout")
  async logout(@Body() body: RefreshTokenDto) {
    await this.auth.logout(body.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.getProfile(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("mfa/totp/enroll")
  startTotpEnrollment(@CurrentUser() user: JwtPayload) {
    return this.mfaEnrollment.startTotpEnrollment(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post("mfa/totp/enroll/verify")
  confirmTotpEnrollment(@CurrentUser() user: JwtPayload, @Body() body: MfaEnrollTotpVerifyDto) {
    return this.mfaEnrollment.confirmTotpEnrollment(user.sub, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post("mfa/email/enroll")
  async startEmailEnrollment(@CurrentUser() user: JwtPayload) {
    await this.mfaEnrollment.startEmailEnrollment(user.sub);
    return { sent: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post("mfa/email/enroll/verify")
  confirmEmailEnrollment(@CurrentUser() user: JwtPayload, @Body() body: MfaEnrollEmailVerifyDto) {
    return this.mfaEnrollment.confirmEmailEnrollment(user.sub, body.code);
  }
}
