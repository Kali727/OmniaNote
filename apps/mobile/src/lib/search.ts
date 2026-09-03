import type { Item } from "./items";
import { apiFetch } from "./apiClient";

export const searchApi = {
  search: (query: string) => apiFetch<Item[]>(`/items/search?q=${encodeURIComponent(query)}`),
};
