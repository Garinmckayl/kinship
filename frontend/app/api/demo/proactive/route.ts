import { NextResponse } from "next/server";
import { proactiveGraph } from "@/lib/demo-lab";

export async function POST() {
  return NextResponse.json(proactiveGraph());
}

