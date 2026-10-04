import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

// The product name lives in one place (CLAUDE.md): packages/core/src/config.ts. Expo's config
// loader doesn't transpile imported workspace TypeScript, so read the constant from the source.
const coreConfig = readFileSync(join(__dirname, "../../packages/core/src/config.ts"), "utf8");
const APP_NAME = /APP_NAME\s*=\s*"([^"]+)"/.exec(coreConfig)?.[1] ?? "Wandr";

/**
 * Expo config for the native app (D75). Bundle ids and the EAS project id are placeholders until
 * the founder sets up the Apple / Google accounts; override them with env vars.
 */
const bundleId = process.env.WANDR_BUNDLE_ID ?? "app.wandr.mobile";
const scheme = "wandr"; // keep in sync with APP_SCHEME in src/lib/share-intake.ts

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  slug: "wandr",
  scheme,
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: bundleId,
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: bundleId,
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "expo-font",
    [
      "expo-splash-screen",
      { backgroundColor: "#fbf7f2", dark: { backgroundColor: "#14110f" }, imageWidth: 1 },
    ],
    ["expo-notifications", { color: "#c2410c" }],
    [
      // FR-21: share links and text from TikTok, Instagram, Maps etc. into a trip or the library.
      // Images are left out until the API has an upload endpoint (see README, open questions).
      "expo-share-intent",
      {
        iosActivationRules: {
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsText: true,
        },
        androidIntentFilters: ["text/*"],
        iosShareExtensionName: `${APP_NAME} Share`,
      },
    ],
    // iOS builds from a path with spaces (expo-constants script phase quoting).
    "./plugins/with-path-spaces-fix",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: process.env.EXPO_PUBLIC_EAS_PROJECT_ID ? { projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID } : undefined,
  },
});
