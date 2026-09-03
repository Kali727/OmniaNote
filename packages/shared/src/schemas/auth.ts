import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  email: z.string().email(),
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, dots, dashes and underscores"),
  password: passwordSchema,
  mobileNumber: z.string().min(8).max(20), // E.164, validated more strictly server-side via libphonenumber
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  emailOrUsername: z.string().min(3),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const mfaChallengeVerifySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().length(6).regex(/^\d+$/),
});
export type MfaChallengeVerifyInput = z.infer<typeof mfaChallengeVerifySchema>;

export const mfaEnrollTotpVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
});
export type MfaEnrollTotpVerifyInput = z.infer<typeof mfaEnrollTotpVerifySchema>;

export const mfaEnrollEmailVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d+$/),
});
export type MfaEnrollEmailVerifyInput = z.infer<typeof mfaEnrollEmailVerifySchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
