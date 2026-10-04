/**
 * Share intake setup (FR-21). expo-share-intent works out the URL scheme from the embedded Expo
 * manifest via expo-linking, which throws a render error if the native build has no manifest
 * (this happened when the repo path had spaces; see README Troubleshooting). We pass the scheme
 * explicitly, and if expo-linking still can't build a URL we log it and turn share intake off for
 * this session instead of crashing.
 */
import * as Linking from "expo-linking";
type ShareIntentOptions = { scheme?: string; resetOnBackground?: boolean; disabled?: boolean };

/** Must match `scheme` in app.config.ts. */
export const APP_SCHEME = "wandr";

let cached: ShareIntentOptions | null = null;

export function shareIntentOptions(): ShareIntentOptions {
  if (cached) return cached;
  let disabled = false;
  try {
    Linking.createURL("/");
  } catch (e) {
    disabled = true;
    console.warn(
      "[share] Expo manifest missing from this native build, so sharing into the app is off for this session. Rebuild with `npx expo run:ios`.",
      e,
    );
  }
  cached = { scheme: APP_SCHEME, resetOnBackground: false, disabled };
  return cached;
}
