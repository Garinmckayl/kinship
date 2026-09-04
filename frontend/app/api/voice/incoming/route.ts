import { NextResponse } from "next/server";
import { publicBase, escXml } from "@/lib/phone";

// Twilio hits this when Ruth answers. Speaks + listens in a loop.
export async function POST(req: Request) {
  const base = publicBase(req);
  const url = new URL(req.url);
  const userId = url.searchParams.get("user_id") ?? "ruth-78";
  const greeting = "Hi Ruth, it's ElderLove calling to check on you. Did you take your morning pill?";
  const action = `${base}/api/voice/respond?user_id=${encodeURIComponent(userId)}`;
  const twiml =
    `<Response>` +
    `<Gather input="speech" speechTimeout="auto" action="${action}" method="POST">` +
    `<Say voice="Polly.Joanna-Neural" language="en-US">${escXml(greeting)}</Say>` +
    `</Gather>` +
    `<Say voice="Polly.Joanna-Neural" language="en-US">I didn't catch that. Goodbye for now, Ruth. I'll check back soon.</Say>` +
    `</Response>`;
  return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" } });
}

export const GET = POST;
