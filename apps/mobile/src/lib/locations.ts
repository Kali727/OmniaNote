import type { CreateFolderInput, CreateLocationInput } from "@maintnote/shared";
import { apiFetch } from "./apiClient";

export interface Location {
  id: string;
  name: string;
  address: string | null;
}

export interface Folder {
  id: string;
  locationId: string;
  parentFolderId: string | null;
  name: string;
}

export const locationsApi = {
  list: () => apiFetch<Location[]>("/locations"),
  create: (input: CreateLocationInput) =>
    apiFetch<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),
  listFolders: (locationId: string) => apiFetch<Folder[]>(`/locations/${locationId}/folders`),
  createFolder: (input: CreateFolderInput) =>
    apiFetch<Folder>("/folders", { method: "POST", body: JSON.stringify(input) }),
};
