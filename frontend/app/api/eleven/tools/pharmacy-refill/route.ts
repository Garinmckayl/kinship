import { NextResponse } from "next/server";
import { verifyElevenToolRequest, elevenToolParams } from "@/lib/eleven";
import { addEscalation } from "@/lib/store";

/** ElevenAgents webhook tool: pharmacy refill worker. */
export async function POST(req: Request) {
  if (!verifyElevenToolRequest(req)) return NextResponse.json({ error: "invalid ElevenLabs tool credentials" }, { status: 401 });
  const input = elevenToolParams(await req.json().catch(() => ({})));
  const medication = String(input.medication ?? "Lisinopril 10 mg");

  const caregiverMessage = `${medication} refill request noted. Please confirm and place the refill with your pharmacy.`;
  await addEscalation("eleanor-79", "attention", `Pharmacy refill requested: ${caregiverMessage}`);

  let whatsapp = "skipped";
  if (process.env.CAREGIVER_WHATSAPP_NUMBER) {
    try {
      const { sendWaText } = await import("@/lib/whatsapp");
      whatsapp = (await sendWaText(process.env.CAREGIVER_WHATSAPP_NUMBER, `Kinship: ${caregiverMessage}`)).ok ? "sent" : "failed";
    } catch { whatsapp = "failed"; }
  }

  return NextResponse.json({
    ok: true,
    medication,
    caregiverMessage,
    whatsapp,
    createdAt: new Date().toISOString(),
  });
}
