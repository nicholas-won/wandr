/** Inngest endpoint (§7a). Signed with INNGEST_SIGNING_KEY in production. */
import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { functions } from "@/inngest/functions";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
