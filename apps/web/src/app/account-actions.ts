"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/lib/auth/session";
import { routes } from "@/lib/routes";

export async function signOutAction() {
  await signOut({ links: true });
  redirect(routes.site);
}
