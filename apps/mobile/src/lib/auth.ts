import type { LoginInput, MfaMethod, RegisterInput } from "@omnianote/shared";
import { apiFetch } from "./apiClient";
import { tokenStore } from "./tokenStore";

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

type LoginResponse = AuthTokens | { mfaRequired: true; challengeToken: string; method: MfaMethod };

export const auth = {
  async register(input: RegisterInput): Promise<void> {
    const tokens = await apiFetch<AuthTokens>("/auth/register", { method: "POST", body: JSON.stringify(input) });
    await tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
  },

  async login(input: LoginInput): Promise<LoginResponse> {
    const result = await apiFetch<LoginResponse>("/auth/login", { method: "POST", body: JSON.stringify(input) });
    if ("accessToken" in result) {
      await tokenStore.setTokens(result.accessToken, result.refreshToken);
    }
    return result;
  },

  async verifyMfaChallenge(challengeToken: string, code: string): Promise<void> {
    const tokens = await apiFetch<AuthTokens>("/auth/mfa/challenge/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    await tokenStore.setTokens(tokens.accessToken, tokens.refreshToken);
  },

  async logout(): Promise<void> {
    const refreshToken = await tokenStore.getRefreshToken();
    if (refreshToken) {
      await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) }).catch(() => {});
    }
    await tokenStore.clear();
  },

  async isLoggedIn(): Promise<boolean> {
    return (await tokenStore.getAccessToken()) !== null;
  },
};
