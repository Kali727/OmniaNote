import { createZodDto } from "nestjs-zod";
import {
  acceptInviteSchema,
  inviteTeammateSchema,
  updateAccountNameSchema,
  updateMemberRoleSchema,
} from "@omnianote/shared";

export class InviteTeammateDto extends createZodDto(inviteTeammateSchema) {}
export class AcceptInviteDto extends createZodDto(acceptInviteSchema) {}
export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}
export class UpdateAccountNameDto extends createZodDto(updateAccountNameSchema) {}
