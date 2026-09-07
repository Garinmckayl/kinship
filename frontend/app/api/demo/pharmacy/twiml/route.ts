import { NextResponse } from "next/server";
import { escXml, publicBase } from "@/lib/phone";

// Optional live leg. Twilio sends the configured DTMF sequence after the
// pharmacy answers. The default Demo Lab never reaches this route.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = publicBase(req);
  const rx = url.searchParams.get("rx") ?? "RX-4472";
  const digits = process.env.PHARMACY_DTMF_DIGITS ?? "ww1ww2";
  const action = `${base}/api/demo/pharmacy/status?rx=${encodeURIComponent(rx)}`;
  const twiml = `<Response><Dial action="${escXml(action)}" method="POST"><Number sendDigits="${escXml(digits)}">${escXml(process.env.PHARMACY_PHONE_NUMBER ?? "")}</Number></Dial></Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export const POST = GET;

