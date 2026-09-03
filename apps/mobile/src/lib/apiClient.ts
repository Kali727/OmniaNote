import { API_URL } from "./env";
import { tokenStore } from "./tokenStore";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshTokens(): Promise<boolean> {
  const refreshToken = await tokenStore.getRefreshToken();
  if (!refreshToken) return false;
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return false;
  const tokens = await res.json();
  await tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
  return true;
}

/** JSON fetch against the API, with a single automatic retry after a silent token refresh on 401. */
export async function apiFetch<T>(path: string, options: RequestInit = {}, _retried = false): Promise<T> {
  const accessToken = await tokenStore.getAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401 && !_retried) {
    refreshInFlight ??= refreshTokens().finally(() => {
      refreshInFlight = null;
    });
    if (await refreshInFlight) {
      return apiFetch<T>(path, options, true);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Uploads a file directly to object storage via a presigned URL — never touches the API process. */
export async function uploadToPresignedUrl(uploadUrl: string, file: Blob, contentType: string): Promise<void> {
  const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: file });
  if (!res.ok) throw new ApiError(res.status, "Upload failed");
}
