import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().max(240).optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const createFolderSchema = z.object({
  name: z.string().min(1).max(120),
  locationId: z.string().uuid(),
  parentFolderId: z.string().uuid().optional(), // omit for a top-level folder
});
export type CreateFolderInput = z.infer<typeof createFolderSchema>;

// A "spot" is the recurring place/asset an item can be pinned to (e.g. "AC Unit, Room 312"),
// independent of which folder it happens to be filed in — this is what powers the
// location/asset history timeline.
export const createSpotSchema = z.object({
  name: z.string().min(1).max(120),
  locationId: z.string().uuid(),
});
export type CreateSpotInput = z.infer<typeof createSpotSchema>;
