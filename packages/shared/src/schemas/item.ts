import { z } from "zod";
import { ItemType, StampType } from "../enums";

// Metadata for a captured item. The binary (photo/video/pdf) itself travels as a
// multipart upload alongside this — see apps/api/src/items for the endpoint contract.
// locationId/folderId are optional at creation time on purpose: capture lands in the
// account's Inbox first and gets filed later, per the capture-to-inbox flow.
export const createItemSchema = z.object({
  type: z.nativeEnum(ItemType),
  title: z.string().min(1).max(160),
  body: z.string().max(20_000).optional(), // note text body; irrelevant for PHOTO/VIDEO/PDF
  locationId: z.string().uuid().optional(),
  folderId: z.string().uuid().optional(),
  spotId: z.string().uuid().optional(),
  stamps: z.array(z.nativeEnum(StampType)).max(8).optional(),
  fileExtension: z.string().min(1).max(10).optional(), // e.g. "jpg" — required for PHOTO/VIDEO/PDF
  clientCreatedAt: z.string().datetime(), // set on-device so offline capture keeps its real timestamp
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const fileItemSchema = z.object({
  locationId: z.string().uuid(),
  // Three-way on purpose: omit the key to leave it untouched (e.g. changing the spot
  // without disturbing which folder the item's in), or send an explicit `null` to clear
  // it back to "none" — a plain `.optional()` string can't distinguish "don't touch"
  // from "clear", since both would otherwise just mean "not provided."
  folderId: z.string().uuid().nullable().optional(),
  spotId: z.string().uuid().nullable().optional(),
});
export type FileItemInput = z.infer<typeof fileItemSchema>;

export const setStampsSchema = z.object({
  stamps: z.array(z.nativeEnum(StampType)).max(8),
});
export type SetStampsInput = z.infer<typeof setStampsSchema>;

export const attachToNoteSchema = z.object({
  noteItemId: z.string().uuid(),
  attachmentItemId: z.string().uuid(),
});
export type AttachToNoteInput = z.infer<typeof attachToNoteSchema>;
