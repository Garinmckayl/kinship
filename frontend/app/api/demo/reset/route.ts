import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { resetJudgeDemo } from "@/lib/store";

export async function POST() {
  try {
    await requireCaregiver();
    const task = await resetJudgeDemo();
    return NextResponse.json({
      ok: true,
      message: "Judge demo reset: one provider-search request is pending caregiver approval.",
      task,
    });
  } catch (error) {
    return error instanceof Response
      ? error
      : NextResponse.json({ error: "Could not reset judge demo" }, { status: 500 });
  }
}
