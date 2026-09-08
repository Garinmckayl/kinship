import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { listChatMessages } from "@/lib/store";

export async function GET() {
  try {
    await requireCaregiver();
    return NextResponse.json({ messages: await listChatMessages("eleanor-79", 100).catch(() => []) });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
