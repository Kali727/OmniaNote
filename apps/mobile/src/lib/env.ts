// On a real device there is no "localhost" to fall back to — VITE_API_URL must point at
// the actual server. The localhost fallback only makes sense in the browser dev preview.
export const API_URL: string = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
