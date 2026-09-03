import { createZodDto } from "nestjs-zod";
import {
  loginSchema,
  mfaChallengeVerifySchema,
  mfaEnrollTotpVerifySchema,
  refreshTokenSchema,
  registerSchema,
} from "@maintnote/shared";

// Thin class wrappers so Nest's pipes/Swagger can see a DTO type, while the zod schema
// in packages/shared stays the single source of truth for validation rules — the same
// schema runs client-side in the mobile app before the request is even sent.
export class RegisterDto extends createZodDto(registerSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class MfaChallengeVerifyDto extends createZodDto(mfaChallengeVerifySchema) {}
export class MfaEnrollTotpVerifyDto extends createZodDto(mfaEnrollTotpVerifySchema) {}
export class RefreshTokenDto extends createZodDto(refreshTokenSchema) {}
