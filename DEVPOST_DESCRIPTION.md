# Kinship -- Autonomous AI Guardian for Elders Living Alone

## Inspiration

Every morning, a daughter in Chicago calls her 79-year-old mother in Columbus to ask if she took her pills. Every evening, she calls again to check if she ate. On a bad day, three calls go unanswered and she is on the highway at midnight, heart pounding -- because silence is the emergency.

58 million Americans are over 65. That number hits 84 million by 2050. Medication non-adherence costs $300 billion per year. Loneliness kills at the rate of smoking 15 cigarettes a day. And when an elder falls alone, no alarm fires -- because the problem is that nothing happened, and no one noticed.

Every elder companion app we found was a clinical nagging machine: one push notification per one missed pill. None of them understood that a missed pill plus dizziness plus silence is not three nudges. It is an emergency.

## What It Does

Kinship is an autonomous AI guardian that runs quietly in the background of an elder's day and **only surfaces to the family when there is a real decision to make**.

The demo persona is Eleanor, 79, living alone in Columbus, Ohio. Her daughter Sarah is in Chicago. Three daily medications.

**Core capabilities:**
- Medication reminders, logging, and double-dose prevention
- Loneliness detection with companionship and memory sharing
- Passive symptom tracking from natural conversation
- Scam protection -- real-time fraud interception for gift-card and IRS scams
- Welfare monitoring -- silence detection with escalating alerts
- Appointment management -- human-in-the-loop (agent proposes, caregiver approves)
- Daily caregiver reports via WhatsApp and email
- Real phone calls and WhatsApp voice notes to reach Eleanor on her actual devices

**The hero feature: Compound-risk detection.** Most systems react to one alarm. Kinship combines five weak signals -- medication missed, breakfast unconfirmed, activity low, dizziness reported, check-ins unanswered -- reasons about the combination, concludes it is abnormal, explains its reasoning, and begins escalation. It doesn't wait for a fall. It acts before one happens.

## How We Built It

**Single TypeScript codebase.** Next.js 14 PWA in `frontend/`, no separate backend.

**Strands Agents SDK** powers three agents:
- **Guardian agent** (15 tools): meds, mood, memory, symptoms, family notification, doctor summaries, background tasks, phone calls, appointments, health metrics, refill tracking, scam detection
- **Caregiver agent** (7 tools): live parent status, add medications, request appointments, remind parent now, schedule tasks
- **ScamGuard sub-agent**: dedicated fraud specialist with its own prompt and reasoning chain

**AWS Bedrock** (Claude Sonnet 4.6) provides the reasoning. Falls back to deterministic rule-based replies when credentials are unavailable -- judges click and it just works.

**Bedrock AgentCore** deployment: standalone Express runtime on ARM64, invocation-tested and healthy.

**Inngest** handles durable background execution:
- Morning check-in at 9am ET
- Welfare sweep every 30 minutes (silence is the emergency)
- Daily caregiver report at 8pm ET
- `sleepUntil` for scheduled reminders that survive disconnects

**Communication channels:**
- ElevenAgents WebRTC -- real-time voice with turn-taking and barge-in
- Twilio -- real PSTN phone calls
- WhatsApp Cloud API -- free voice notes
- Resend -- email delivery

**Postgres (Neon)** with 13 tables. Falls back to in-memory store when no database is configured.

**Graceful degradation at every layer:** no AWS creds -> rule-based replies. No database -> in-memory. No Twilio -> WhatsApp voice. No WhatsApp -> dashboard escalation. Every channel degrades one step down, never silent.

## Challenges We Ran Into

**Silence detection is fundamentally different from event handling.** Building a system that notices nothing happened required rethinking the architecture around heartbeats and cron sweeps rather than request-response patterns. The welfare sweep runs every 30 minutes via Inngest and checks when Eleanor last interacted -- not what she said.

**Double-dose prevention under concurrent access.** The database uses a unique constraint on `(elder_id, med_id, intake_date)` and `ON CONFLICT DO NOTHING` to guarantee exactly one intake per medication per day, even if Eleanor taps "Yes" twice quickly.

**Making the demo bulletproof.** Judges don't have our AWS credentials, Twilio number, or database. Every integration needed a working fallback that demonstrates the same safety behavior without external dependencies.

## Accomplishments That We're Proud Of

- **Compound-risk detection** -- the agent combines missed medication data, symptom tracking, and welfare heartbeats to detect dangerous combinations no single alarm catches
- **"Sent is not saved" principle** -- unconfirmed urgent alerts re-fire via WhatsApp every 30 minutes until a human taps "I'm on it"
- **Double-dose guard** -- database-enforced, elder stopped firmly but kindly, attempt logged to family trail
- **Zero-credential demo mode** -- the full product experience works without any API keys
- **AgentCore deployed and healthy** -- production-grade Strands agent running on dedicated ARM64 compute

## What We Learned

1. **Tools are the product.** The Strands SDK's tool abstraction forced every agent capability into a discrete, testable unit with Zod schema validation.
2. **Durable execution matters more than LLM quality.** Eleanor closes the browser. The agent must keep working. Inngest's `sleepUntil` made "remind me in 30 minutes" a kept promise instead of a broken one.
3. **Silence detection is the hardest problem in elder care.** The heartbeat + welfare sweep architecture was the most important design decision.
4. **Graceful degradation wins demos.** The fallback system isn't a compromise -- it's what makes the product trustworthy.

## What's Next

- Wearable integration (Apple Watch / Fitbit) for passive health data ingestion
- Multi-elder support for caregivers managing multiple family members
- Medication image recognition for physical pill verification
- Local community network for Good Neighbor Agents track expansion

## Built With

- Strands Agents SDK (TypeScript)
- AWS Bedrock (Claude Sonnet 4.6)
- AWS Bedrock AgentCore
- Next.js 14
- Inngest
- PostgreSQL (Neon)
- ElevenLabs / ElevenAgents
- Twilio
- WhatsApp Cloud API
- Tailwind CSS
- Zod
- Resend

## Try It

- **Source:** [github.com/Garinmckayl/elderai](https://github.com/Garinmckayl/elderai) (MIT license)
- **Run locally:** `cd frontend && npm install && npm run dev`
- Open `/elder` to be Eleanor. Open `/family` to be Sarah. Open `/demo` to see the agent lab.

**Track:** Everyday Agents -- "runs quietly in the background and only pings you when there's a real decision to make."
