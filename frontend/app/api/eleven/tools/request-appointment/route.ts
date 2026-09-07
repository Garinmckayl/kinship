import { NextResponse } from "next/server";
import { verifyElevenToolRequest, elevenToolParams } from "@/lib/eleven";
import { addAppointment, addEscalation } from "@/lib/store";

/** ElevenAgents webhook tool: creates a proposal, never a booked appointment. */
export async function POST(req: Request) {
  if (!verifyElevenToolRequest(req)) return NextResponse.json({ error: "invalid ElevenLabs tool credentials" }, { status: 401 });
  const input = elevenToolParams(await req.json().catch(() => ({})));
  const at = String(input.at ?? input.datetime ?? input.date_time ?? "");
  const title = String(input.title ?? input.reason ?? "Doctor appointment").trim();
  if (!at || Number.isNaN(new Date(at).getTime())) return NextResponse.json({ ok: false, error: "at must be a valid ISO datetime" }, { status: 400 });
  const appt = await addAppointment("eleanor-79", {
    title,
    doctor: String(input.doctor ?? ""),
    location: String(input.location ?? ""),
    at,
    notes: String(input.notes ?? ""),
  }, "proposed");
  await addEscalation("eleanor-79", "attention", `Approval needed: ${appt.title} on ${new Date(appt.at).toLocaleString()}. Nothing was booked yet.`);
  return NextResponse.json({
    ok: true,
    appointment: appt,
    needsCaregiverApproval: true,
    message: "Appointment proposal created. Tell Eleanor that a caregiver must approve it in the Kinship decision queue before calendar sync.",
  });
}
