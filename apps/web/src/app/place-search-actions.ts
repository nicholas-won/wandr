"use server";

import { placeSearchConnected } from "@/server/place-search";

/** Is Google place search configured? Without a key the picker offers rename only. No Google call. */
export async function placeSearchStatusAction(): Promise<{ connected: boolean }> {
  return { connected: placeSearchConnected() };
}
