import type { CreateItemInput, FileItemInput } from "@omnianote/shared";
import { apiFetch, uploadToPresignedUrl } from "./apiClient";

export interface Item {
  id: string;
  type: "PHOTO" | "VIDEO" | "PDF" | "NOTE";
  title: string;
  body: string | null;
  locationId: string | null;
  folderId: string | null;
  spotId: string | null;
  isFavorite: boolean;
  clientCreatedAt: string;
}

export const itemsApi = {
  listInbox: () => apiFetch<Item[]>("/items/inbox"),
  listRecent: () => apiFetch<Item[]>("/items/recent"),
  listFavorites: () => apiFetch<Item[]>("/items/favorites"),
  listByFolder: (locationId: string, folderId?: string) =>
    apiFetch<Item[]>(`/items/by-folder?locationId=${locationId}${folderId ? `&folderId=${folderId}` : ""}`),

  create: (input: CreateItemInput) =>
    apiFetch<{ item: Item; uploadUrl: string | null }>("/items", { method: "POST", body: JSON.stringify(input) }),

  confirmUpload: (itemId: string, storageBytes: number, mimeType: string) =>
    apiFetch(`/items/${itemId}/uploaded`, { method: "POST", body: JSON.stringify({ storageBytes, mimeType }) }),

  file: (itemId: string, input: FileItemInput) =>
    apiFetch<Item>(`/items/${itemId}/file`, { method: "PATCH", body: JSON.stringify(input) }),

  toggleFavorite: (itemId: string) => apiFetch<Item>(`/items/${itemId}/favorite`, { method: "PATCH" }),

  /** Full capture-to-inbox flow for a photo/video/pdf: create the metadata row, then push the bytes. */
  async captureMedia(
    type: "PHOTO" | "VIDEO" | "PDF",
    title: string,
    file: Blob,
    fileExtension: string,
    contentType: string,
  ): Promise<Item> {
    const { item, uploadUrl } = await itemsApi.create({
      type,
      title,
      fileExtension,
      clientCreatedAt: new Date().toISOString(),
    });
    if (uploadUrl) {
      await uploadToPresignedUrl(uploadUrl, file, contentType);
      await itemsApi.confirmUpload(item.id, file.size, contentType);
    }
    return item;
  },
};
