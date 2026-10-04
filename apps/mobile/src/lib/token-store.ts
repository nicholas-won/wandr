/**
 * The long-lived API token lives in the Keychain / Keystore via SecureStore, cached in memory so
 * every request doesn't hit the native module. Also remembers the last trip used (FR-21 default).
 */
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "wandr.token";
const LAST_TRIP_KEY = "wandr.lastTrip";

let cached: string | null | undefined;

export const tokenStore = {
  async load(): Promise<string | null> {
    if (cached === undefined) cached = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    // Dev-only shortcuts (screenshots, simulator testing; never in release builds):
    // EXPO_PUBLIC_MOCK_SIGNED_IN=1 starts signed in as the mock user; EXPO_PUBLIC_DEV_TOKEN uses a
    // token from the real API (e.g. one minted by `pnpm smoke`).
    if (!cached && __DEV__) {
      if (process.env.EXPO_PUBLIC_API_MOCK === "1" && process.env.EXPO_PUBLIC_MOCK_SIGNED_IN === "1") cached = "mock-demo";
      else if (process.env.EXPO_PUBLIC_DEV_TOKEN) cached = process.env.EXPO_PUBLIC_DEV_TOKEN;
    }
    return cached;
  },
  get(): string | null {
    return cached ?? null;
  },
  async set(token: string | null) {
    cached = token;
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
  },
};

let lastTrip: string | null | undefined;

export const lastTripStore = {
  async get(): Promise<string | null> {
    if (lastTrip === undefined) lastTrip = await SecureStore.getItemAsync(LAST_TRIP_KEY).catch(() => null);
    return lastTrip;
  },
  async set(tripId: string | null) {
    lastTrip = tripId;
    if (tripId) await SecureStore.setItemAsync(LAST_TRIP_KEY, tripId).catch(() => undefined);
    else await SecureStore.deleteItemAsync(LAST_TRIP_KEY).catch(() => undefined);
  },
};
