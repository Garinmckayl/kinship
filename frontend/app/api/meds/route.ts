import { NextResponse } from "next/server";
import { requireCaregiver } from "@/lib/auth";
import { listMeds, addMed } from "@/lib/store";

export async function GET() {
  try {
    await requireCaregiver();
    return NextResponse.json({ meds: await listMeds("ruth-78") });
  } catch (e) {
    return e as Response;
  }
}

export async function POST(req: Request) {
  try {
    await requireCaregiver();
    const body = await req.json().catch(() => ({}));
    const { name, dosage, time, label } = body;
    if (!name || !time || !/^\d{2}:\d{2}$/.test(String(time))) {
      return NextResponse.json({ error: "name and time (HH:MM) required" }, { status: 400 });
    }
    const med = await addMed("ruth-78", {
      name: String(name), dosage: String(dosage ?? ""), time: String(time), label: String(label ?? ""),
    });
    return NextResponse.json({ med });
  } catch (e) {
    return e instanceof Response ? e : NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
