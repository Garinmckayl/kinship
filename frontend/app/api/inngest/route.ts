import { serve } from "inngest/next";
import { inngest, functions } from "@/lib/inngest";

export const { GET, POST, PUT } = serve({ client: inngest, functions });
