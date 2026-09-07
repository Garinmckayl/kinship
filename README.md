# ElderLove — Autonomous Guardian for Elders

> Agents for Humans Hackathon — **Everyday Agents** track.
> Proactive Strands agent (TypeScript SDK) that handles meds, loneliness, memory & escalation in the background. Only pings family when it matters.

Demo persona: **Eleanor, 79, lives alone, 3 meds.**

Single codebase: Next.js PWA + Strands TS SDK in `frontend/` — no separate Python backend.

## Problem / Who / Why
- **Problem:** elders miss meds + suffer loneliness; families worry constantly; doctors get no adherence signal.
- **Who:** elders living alone (simple voice-first PWA at `/elder`, or her **real phone** via Twilio voice) + adult children (dashboard at `/family`) + doctors (1-page summary via `summarize_for_doctor` tool).
- **Why:** 65+ US 58M → 84M by 2050; non-adherence ~$300B/yr; loneliness mortality ≈ smoking 15 cigs/day. High spending power, underserved.

## Architecture
```
[PWA /elder + /family] --fetch /api--> [Next.js API routes] --> [Strands TS guardian-agent]
        |                              /api/chat /status /tasks      | 8 tools (lib/guardian.ts):
   orb + beam UI,                                                   | meds, mood, memory, notify_family,
   ElevenLabs voice                                                  | summarize_for_doctor, schedule_task,
   in-app Call Mode                                                  | call_elder
                                          |
                    [Inngest] durable background tasks (survives disconnects)
                    [Twilio] REAL phone calls: /api/voice/incoming|respond|trigger
```

Works with zero AWS creds via rule-based fallback (judges click + it just works). Set AWS creds to enable live Bedrock reasoning. See `ARCHITECTURE.md`.

## Background agent (survives disconnects)
- Ruth says "remind me in 30 minutes" → agent calls `schedule_task` → Inngest runs it durably (`elder/task.requested` + `step.sleepUntil`), executes the agent, updates `/api/tasks`, escalates if needed.
- Daily 9am ET proactive check-in via Inngest cron (`morning-checkin`).
- Without Inngest keys: inline in-process fallback (single-instance dev/demo).
- Local full loop: `npx inngest-cli dev` + `INNGEST_DEV=1`. Prod: set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.

## Real phone calls (Twilio, no simulation)
- `POST /api/voice/trigger {secret, to?}` → Ruth's real phone rings → Gather speech → `/api/voice/respond` runs the Strands agent → replies in ElevenLabs voice via `<Play /api/speak>` (Twilio voice fallback without public URL).
- Agent tool `call_elder` lets the agent itself place urgent calls; degrades to family escalation without creds.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ELDER_PHONE_NUMBER`, `VOICE_CALLBACK_SECRET`, `PUBLIC_BASE_URL`.

## WhatsApp voice loop (FREE — works in Ethiopia where Twilio trial can't)
- Twilio trial can't terminate to +251, so: Meta Cloud API (free) voice notes instead.
- Agent → Ruth: ElevenLabs MP3 sent as WhatsApp audio (`POST /api/whatsapp/send {secret, to?, text}`).
- Ruth → agent: text or voice note → `/api/whatsapp/webhook` → voice transcribed via ElevenLabs Scribe → Strands agent replies with voice note.
- Agent tool `call_elder` tries Twilio → WhatsApp voice → family escalation, in that order.
- Setup: developers.facebook.com → app → WhatsApp API Setup → test number works instantly. Env: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ELDER_WHATSAPP_NUMBER` (e.g. 251911234567), `WHATSAPP_VERIFY_TOKEN`.

## ElevenAgents live voice (the real agent path)
- The elder surface includes the official @elevenlabs/react SDK. It uses ElevenAgents WebRTC for low-latency turn-taking, interruption/barge-in, real microphone audio, typed messages, dynamic variables, client tools, and native ElevenLabs conversation IDs.
- Public browser agent: set NEXT_PUBLIC_ELEVENLABS_AGENT_ID. Private caregiver agent: set ELEVENLABS_AGENT_ID + ELEVENLABS_API_KEY; the authenticated GET /api/eleven/signed-url route mints the credential without exposing the key.
- Configure these ElevenAgents webhook tools to point at the deployed app (Bearer header = ELEVENLABS_TOOL_SECRET): /api/eleven/tools/parent-status, /api/eleven/tools/request-appointment, and /api/eleven/tools/pharmacy-refill. Appointment requests are proposals only; the caregiver must approve in /calendar before Google sync.
- Configure the ElevenLabs post-call transcription webhook as /api/eleven/webhook with HMAC secret ELEVENLABS_WEBHOOK_SECRET. Completed voice turns are written into the durable chat_messages thread, while ElevenLabs retains its native transcript/analysis history.
- Recommended agent prompt: “You are Kinship, Eleanor’s warm voice companion. Use live tools for current status. Never claim an appointment is booked; stage it and ask a caregiver to approve. Never give medical diagnosis or dosage changes. If a scam is suspected, stop the conversation, protect Eleanor, and alert the caregiver.” Add dynamic variables {{elder_name}}, {{medication_focus}}, {{adherence_today}}, and {{caregiver_decision_url}}.

The official platform supports knowledge, authenticated webhook tools, dynamic variables, telephony/Twilio, real-time events, post-call webhooks, testing/evals, analytics, and data retention. Kinship uses the SDK, tool, personalization, telephony, and post-call surfaces in the live path: https://elevenlabs.io/docs/eleven-agents/overview.
## Data: Postgres (Neon) + auth + meds
- `lib/store.ts` persists everything (meds, intakes, moods, memories, escalations, tasks, reports, chat messages, approval-gated appointments, users). No `DATABASE_URL` → in-memory demo mode, nothing breaks.
- Auth: signup/login/logout/me with scrypt + JWT httpOnly cookie (`lib/auth.ts`). `/family` requires a caregiver session. Demo login: `caregiver@demo.local` / `demo1234` (auto-seeded).
- Medication management: caregiver adds/pauses/removes meds in the dashboard (`/api/meds`); the agent reads the live schedule — no hardcoded pills.
- Daily report: 8pm ET Inngest cron → WhatsApp text (`CAREGIVER_WHATSAPP_NUMBER`) + email via Resend (`RESEND_API_KEY`, `CAREGIVER_EMAIL`) + saved to DB. Manual: `POST /api/reports/generate` (caregiver session or `REPORT_SECRET`).
- Urgent/attention escalations also push WhatsApp text to the caregiver automatically.
- Vercel env add: `DATABASE_URL`, `AUTH_SECRET`, `REPORT_SECRET`, `RESEND_API_KEY`, `CAREGIVER_WHATSAPP_NUMBER`, `CAREGIVER_EMAIL`.

## Life-saving loops (why this wins "for humans")
- **Silence is the emergency.** Every elder message is a heartbeat. Inngest `welfare-check` cron (30 min) fires when Ruth goes quiet past `WELFARE_QUIET_MINUTES` (6h default): attention nudge → urgent + caregiver WhatsApp + direct voice ping past 2×. Nights are sleep, not silence. Manual trigger: `POST /api/welfare/check` (REPORT_SECRET).
- **Sent ≠ saved.** Every attention/urgent alert needs a family "I'm on it" tap (`PATCH /api/escalations/[id]`); unconfirmed alerts re-fire via WhatsApp every 30 min until someone owns them.
- **Double-dose guard.** `confirm_intake` refuses same-day re-logs, stops Ruth firmly, and writes the prevented attempt to the family trail. Proven live: adherence stayed 1/3, family notified.

## AgentCore (Bedrock, TypeScript)
- `agentcore/` = standalone Express guardian (`GET /ping`, `POST /invocations`) per the Strands TS deploy guide, same tools + Postgres. Proven live: `/ping` healthy, `/invocations` answered from Bedrock with tool calls.
- `agentcore/deploy.sh` pushes to ECR + creates the runtime (us-west-2). Needs docker buildx + IAM perms; runtime costs money — deploy deliberately.

## Chat that doesn't suck
- Token streaming via `agent.stream()` async iterators (`/api/chat/stream`, `/api/caregiver/stream`, SSE), markdown rendering, auto-scroll, live tool status ("Logging your pill…").Agents use `contextManager: "auto"` (summarize + offload per Strands context-management).

## Beyond meds
- **Appointments:** `manage_appointments` + `request_appointment` stage proposals; `/calendar` exposes a caregiver decision queue. Only explicit caregiver approval promotes a proposal to `upcoming` and triggers Google Calendar sync (`GOOGLE_CLIENT_EMAIL/PRIVATE_KEY/CALENDAR_ID`).
- **Health:** vitals table + `/health` page (sparklines, 7-day avgs) + `POST /api/health` ingest (caregiver session or `REPORT_SECRET` — any watch app can push) + `log_health_metric`/`get_health_trends` tools the agent references.
- **Elder today board:** `/api/today` quick-actions card (meds to log, check-in, reminders, today's doctors).
- **Caregiver chat:** family dashboard Chat tab — realtime streaming answers from live data, "add Vitamin D at 8am", "remind mom now".
- shadcn-style `components/ui.tsx` (card, button, badge, input, calendar, tabs) used across new pages.

## Limit-pushing Demo Lab

Open `/demo` for the judge-facing surface:

- **Pharmacy phone-tree buster:** mock-first DTMF trace for CVS on 4th Ave, prescription `RX-4472`, confirmation `CVS-THU-0200`; an optional live Twilio leg uses `LIVE_PHARMACY_DEMO=1`, `PHARMACY_PHONE_NUMBER`, and `PHARMACY_DTMF_DIGITS`.
- **Pill-tray vision:** browser camera capture with a deterministic safe fallback; with Bedrock credentials and `VISION_MODEL_ID`, the server sends the image through the Strands SDK multimodal `ImageBlock` path.
- **Scam interceptor:** mock audio-intercept protocol blocks the caller, queues an FTC-style report, simulates a linked-card freeze, and creates an urgent caregiver alert. External bank/report webhooks require both their URL and an explicit `live: true` request; caregiver WhatsApp also requires `ALLOW_DEMO_OUTBOUND=1`.
- **Temporal graph:** a visible entity-relationship-time chain connects the knee memory, a weather signal, and a proactive heating-pad action.

Every card reports whether it ran in `mock`, `demo-vision`, `bedrock-vision`, or live integration mode.

## Run locally
```bash
cd frontend && npm install && npm run dev
# -> http://localhost:3000  (/elder, /family, /login, /signup)
```

## Deploy (Vercel)
- Import `Garinmckayl/elderai`, root directory `frontend`.
- Env vars: AWS creds, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` (or private `ELEVENLABS_AGENT_ID`), `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, Inngest keys, Twilio vars, `PUBLIC_BASE_URL=https://<your-app>.vercel.app`.
- Inngest syncs via `/api/inngest` automatically.

## Safety
Reminder + escalation log only. Not medical advice. Urgent keywords (chest pain, fall, dizzy) → URGENT escalation + advise emergency button/911.

## License
MIT — see LICENSE.
