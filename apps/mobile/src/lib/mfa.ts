import { apiFetch } from "./apiClient";

export interface Profile {
  id: string;
  email: string;
  username: string;
  mobileNumber: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  mfaEnabled: boolean;
  mfaPreferred: "TOTP" | "SMS" | "EMAIL" | null;
}

export const mfaApi = {
  getProfile: () => apiFetch<Profile>("/auth/me"),

  startTotpEnroll: () => apiFetch<{ secret: string; qrCodeDataUrl: string }>("/auth/mfa/totp/enroll", { method: "POST" }),
  confirmTotpEnroll: (code: string) =>
    apiFetch<{ backupCodes: string[] }>("/auth/mfa/totp/enroll/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  startEmailEnroll: () => apiFetch<{ sent: true }>("/auth/mfa/email/enroll", { method: "POST" }),
  confirmEmailEnroll: (code: string) =>
    apiFetch<{ backupCodes: string[] }>("/auth/mfa/email/enroll/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};
