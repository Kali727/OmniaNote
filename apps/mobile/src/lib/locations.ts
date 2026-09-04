import type { CreateFolderInput, CreateLocationInput, CreateSpotInput } from "@omnianote/shared";
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

export interface Spot {
  id: string;
  locationId: string;
  name: string;
}

export const locationsApi = {
  list: () => apiFetch<Location[]>("/locations"),
  create: (input: CreateLocationInput) =>
    apiFetch<Location>("/locations", { method: "POST", body: JSON.stringify(input) }),
  listFolders: (locationId: string) => apiFetch<Folder[]>(`/locations/${locationId}/folders`),
  createFolder: (input: CreateFolderInput) =>
    apiFetch<Folder>("/folders", { method: "POST", body: JSON.stringify(input) }),
  listSpots: (locationId: string) => apiFetch<Spot[]>(`/locations/${locationId}/spots`),
  getSpot: (spotId: string) => apiFetch<Spot>(`/spots/${spotId}`),
  createSpot: (input: CreateSpotInput) => apiFetch<Spot>("/spots", { method: "POST", body: JSON.stringify(input) }),
};
