"use server";

/** Q1: "Not now" on the confirm-your-number prompt. Comes back at most once a day on this device. */
import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { COOKIE, cookieOptions } from "@/lib/auth/cookies";

export async function dismissPhonePromptAction(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE.phonePrompt, String(Date.now()), cookieOptions(30 * 24 * 60 * 60));
  refresh();
}
