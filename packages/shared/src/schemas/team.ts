import { z } from "zod";
import { AccountRole } from "../enums";
import { passwordSchema } from "./auth";

export const inviteTeammateSchema = z.object({
  email: z.string().email(),
  role: z.nativeEnum(AccountRole).default(AccountRole.MEMBER),
});
export type InviteTeammateInput = z.infer<typeof inviteTeammateSchema>;

// Same shape as registration minus email — the invite already pins that down.
export const acceptInviteSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_.-]+$/, "Username may only contain letters, numbers, dots, dashes and underscores"),
  password: passwordSchema,
  mobileNumber: z.string().min(8).max(20),
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(AccountRole),
});
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;

export const updateAccountNameSchema = z.object({
  name: z.string().min(1).max(120),
});
export type UpdateAccountNameInput = z.infer<typeof updateAccountNameSchema>;
