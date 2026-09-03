import { Preferences } from "@capacitor/preferences";

// @capacitor/preferences maps to Keychain on iOS and EncryptedSharedPreferences-backed
// storage on Android — appropriate for tokens, unlike plain localStorage.
const ACCESS_KEY = "auth.accessToken";
const REFRESH_KEY = "auth.refreshToken";

export const tokenStore = {
  async getAccessToken(): Promise<string | null> {
    return (await Preferences.get({ key: ACCESS_KEY })).value;
  },
  async getRefreshToken(): Promise<string | null> {
    return (await Preferences.get({ key: REFRESH_KEY })).value;
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    await Promise.all([
      Preferences.set({ key: ACCESS_KEY, value: accessToken }),
      Preferences.set({ key: REFRESH_KEY, value: refreshToken }),
    ]);
  },
  async clear(): Promise<void> {
    await Promise.all([Preferences.remove({ key: ACCESS_KEY }), Preferences.remove({ key: REFRESH_KEY })]);
  },
};
