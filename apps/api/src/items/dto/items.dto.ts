import { z } from "zod";
import { createZodDto } from "nestjs-zod";
import { attachToNoteSchema, createItemSchema, fileItemSchema, setStampsSchema, setTagsSchema } from "@omnianote/shared";

export class CreateItemDto extends createZodDto(createItemSchema) {}
export class FileItemDto extends createZodDto(fileItemSchema) {}
export class SetStampsDto extends createZodDto(setStampsSchema) {}
export class SetTagsDto extends createZodDto(setTagsSchema) {}
export class AttachToNoteDto extends createZodDto(attachToNoteSchema) {}

export const confirmUploadSchema = z.object({
  storageBytes: z.number().int().positive(),
  mimeType: z.string().min(1),
});
export class ConfirmUploadDto extends createZodDto(confirmUploadSchema) {}
