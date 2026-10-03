/**
 * The share extension (FR-21) opens the app with `wandr://dataUrl=<key>`; send that to the share
 * sheet. Other links (wandr://trip/<id>) pass through to their routes.
 */
import { getShareExtensionKey } from "expo-share-intent";

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) return "/share";
    return path;
  } catch {
    return "/";
  }
}
