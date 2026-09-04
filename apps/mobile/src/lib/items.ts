import type { CreateItemInput, FileItemInput, StampType } from "@omnianote/shared";
import { apiFetch, uploadToPresignedUrl } from "./apiClient";
import { createThumbnail } from "./thumbnail";

export interface Item {
  id: string;
  type: "PHOTO" | "VIDEO" | "PDF" | "NOTE";
  title: string;
  body: string | null;
  locationId: string | null;
  folderId: string | null;
  spotId: string | null;
  isFavorite: boolean;
  stamps: StampType[];
  clientCreatedAt: string;
  thumbnailUrl?: string | null;
}


export const itemsApi = {
  listInbox: () => apiFetch<Item[]>("/items/inbox"),
  listRecent: () => apiFetch<Item[]>("/items/recent"),
  listFavorites: () => apiFetch<Item[]>("/items/favorites"),
  listByFolder: (locationId: string, folderId?: string) =>
    apiFetch<Item[]>(`/items/by-folder?locationId=${locationId}${folderId ? `&folderId=${folderId}` : ""}`),

  create: (input: CreateItemInput) =>
    apiFetch<{ item: Item; uploadUrl: string | null; thumbnailUploadUrl: string | null }>("/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  confirmUpload: (itemId: string, storageBytes: number, mimeType: string) =>
    apiFetch(`/items/${itemId}/uploaded`, { method: "POST", body: JSON.stringify({ storageBytes, mimeType }) }),

  file: (itemId: string, input: FileItemInput) =>
    apiFetch<Item>(`/items/${itemId}/file`, { method: "PATCH", body: JSON.stringify(input) }),

  toggleFavorite: (itemId: string) => apiFetch<Item>(`/items/${itemId}/favorite`, { method: "PATCH" }),

  setStamps: (itemId: string, stamps: StampType[]) =>
    apiFetch<Item>(`/items/${itemId}/stamps`, { method: "PATCH", body: JSON.stringify({ stamps }) }),

  async get(itemId: string): Promise<Item & { downloadUrl: string | null }> {
    const { item, downloadUrl, thumbnailUrl } = await apiFetch<{
      item: Omit<Item, "thumbnailUrl">;
      downloadUrl: string | null;
      thumbnailUrl: string | null;
    }>(`/items/${itemId}`);
    return { ...item, thumbnailUrl, downloadUrl };
  },

  /** Full capture-to-inbox flow for a photo/video/pdf: create the metadata row, then push
   *  the original bytes and (for photos) a client-generated thumbnail. A thumbnail failure
   *  never blocks the capture — the item just falls back to its type icon in the grid. */
  async captureMedia(
    type: "PHOTO" | "VIDEO" | "PDF",
    title: string,
    file: Blob,
    fileExtension: string,
    contentType: string,
  ): Promise<Item> {
    const { item, uploadUrl, thumbnailUploadUrl } = await itemsApi.create({
      type,
      title,
      fileExtension,
      clientCreatedAt: new Date().toISOString(),
    });
    if (uploadUrl) {
      await uploadToPresignedUrl(uploadUrl, file, contentType);
      await itemsApi.confirmUpload(item.id, file.size, contentType);
    }
    if (thumbnailUploadUrl) {
      try {
        const thumbnail = await createThumbnail(file);
        await uploadToPresignedUrl(thumbnailUploadUrl, thumbnail, "image/jpeg");
      } catch {
        // Non-fatal — the capture itself already succeeded above.
      }
    }
    return item;
  },
};
