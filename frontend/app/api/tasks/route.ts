import { NextResponse } from "next/server";
import { listTasks } from "@/lib/store";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? undefined;
  return NextResponse.json({ tasks: await listTasks(userId) });
}
