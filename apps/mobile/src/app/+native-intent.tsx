/**
 * The share extension (FR-21) opens the app with `wandr://dataUrl=<key>`; send that to the share
 * sheet. Other links (wandr://trip/<id>) pass through to their routes.
 */
import { getShareExtensionKey } from "expo-share-intent";
import { APP_SCHEME } from "@/lib/share-intake";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    // Explicit scheme: never depends on the embedded manifest (see lib/share-intake.ts).
    if (path.includes(`dataUrl=${getShareExtensionKey({ scheme: APP_SCHEME })}`)) return "/share";
    return path;
  } catch {
    return path;
  }
}
