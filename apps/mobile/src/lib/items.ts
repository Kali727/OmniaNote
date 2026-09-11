import type { CreateItemInput, FileItemInput, SetTagsInput, StampType } from "@omnianote/shared";
import { apiFetch } from "./apiClient";

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

export interface NoteAttachmentSummary {
  id: string;
  type: Item["type"];
  title: string;
  thumbnailUrl: string | null;
}


export const itemsApi = {
  listInbox: () => apiFetch<Item[]>("/items/inbox"),
  listRecent: () => apiFetch<Item[]>("/items/recent"),
  listFavorites: () => apiFetch<Item[]>("/items/favorites"),
  listByFolder: (locationId: string, folderId?: string) =>
    apiFetch<Item[]>(`/items/by-folder?locationId=${locationId}${folderId ? `&folderId=${folderId}` : ""}`),
  listBySpot: (spotId: string) => apiFetch<Item[]>(`/items/by-spot/${spotId}`),

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

  setTags: (itemId: string, input: SetTagsInput) =>
    apiFetch<{ item: Item; tags: string[] }>(`/items/${itemId}/tags`, { method: "PATCH", body: JSON.stringify(input) }),

  listTags: () => apiFetch<string[]>("/items/tags"),

  async get(itemId: string): Promise<Item & { downloadUrl: string | null; tags: string[]; attachments: NoteAttachmentSummary[] }> {
    const { item, downloadUrl, thumbnailUrl, tags, attachments } = await apiFetch<{
      item: Omit<Item, "thumbnailUrl">;
      downloadUrl: string | null;
      thumbnailUrl: string | null;
      tags: string[];
      attachments: NoteAttachmentSummary[];
    }>(`/items/${itemId}`);
    return { ...item, thumbnailUrl, downloadUrl, tags, attachments };
  },

  attach: (input: { noteItemId: string; attachmentItemId: string }) =>
    apiFetch<void>("/items/attach", { method: "POST", body: JSON.stringify(input) }),
};
