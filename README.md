# Kinship — an AI care agent for older adults living alone

> Agents for Humans Hackathon — **Everyday Agents** track

Family caregiving is a second shift made of small, relentless questions: Did Mom take her medication? Is today’s silence normal? Was the appointment confirmed? Most care products detect a problem, send another alert, and leave the family with the same work and uncertainty.

Kinship is a voice-first companion for an older adult and a decision surface for their family. It checks in, records medications, remembers care context, follows up after the conversation ends, and escalates only when a risk or real decision needs a person. When outside work is required, Kinship asks the caregiver first, uses Amazon Nova Act to operate the website, and returns a result the family can verify.

The demo follows **Eleanor, 79, who lives alone**, and her daughter Sarah. Eleanor can talk naturally through the senior-friendly web app, ElevenLabs voice, phone, or WhatsApp. Sarah sees meaningful updates, approval requests, and receipts without having to monitor every interaction. Kinship supports care coordination; it does not diagnose conditions or change medication dosages.

Kinship is built explicitly with the **Strands Agents SDK**. A Guardian Agent coordinates 17 typed care and safety tools, a separate Caregiver Agent serves Sarah, and the Guardian delegates suspicious situations to a ScamGuard Strands sub-agent. Amazon Bedrock supplies reasoning and tool selection; PostgreSQL and Inngest preserve care state and follow-ups across conversations.

- **Live app:** [kinship.arcumet.com](https://kinship.arcumet.com)
- **Submission narrative:** [DEVPOST_DESCRIPTION.md](DEVPOST_DESCRIPTION.md)
- **Architecture:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Builder articles:** [Project story](https://builder.aws.com/content/3JDRwUYHIIqyFxDdCzvkmYCucRY/agents-for-humans-building-kinship-a-care-agent-that-keeps-its-promises) · [Strands architecture](https://builder.aws.com/content/3JGQ3vqC3sWSzOxRuxNqKuusgIp/agents-for-humans-why-kinship-uses-four-agents-instead-of-one) · [Nova Act evidence](https://builder.aws.com/content/3JGQZ7cl3hF77OWB4TH6Qyxnh7B/agents-for-humans-from-approval-to-evidence-with-nova-act-and-agentcore-browser)

## Architecture

Kinship uses specialized agents rather than one unrestricted assistant:

- **Guardian Agent:** elder-facing care and safety orchestration.
- **Caregiver Agent:** family-facing status and care-management orchestration.
- **ScamGuard:** specialist Strands sub-agent invoked by the Guardian for suspicious caller and payment stories.
- **Nova Act Browser Worker:** caregiver-approved external website execution.

They coordinate through typed tools, approval states, and the shared PostgreSQL care record.

```
[PWA /elder + /family] --fetch /api--> [Next.js API routes] --> [Strands TS guardian-agent]
        |                              /api/chat /status /tasks      | 17 typed tools (lib/guardian.ts):
   orb + beam UI,                                                   | meds, mood, memory, notify_family,
   ElevenLabs voice                                                  | summarize_for_doctor, schedule_task,
   in-app Call Mode                                                  | call_elder
                                          |
                    [Inngest] durable background tasks (survives disconnects)
                    [Twilio] REAL phone calls: /api/voice/incoming|respond|trigger
```

Works with zero AWS creds via rule-based fallback (judges click + it just works). Set AWS creds to enable live Bedrock reasoning. See `ARCHITECTURE.md`.

## Background agent (survives disconnects)
- Eleanor says "remind me in 30 minutes" → agent calls `schedule_task` → Inngest runs it durably (`elder/task.requested` + `step.sleepUntil`), executes the agent, updates `/api/tasks`, escalates if needed.
- Daily 9am ET proactive check-in via Inngest cron (`morning-checkin`).
- Without Inngest keys: inline in-process fallback (single-instance dev/demo).
- Local full loop: `npx inngest-cli dev` + `INNGEST_DEV=1`. Prod: set `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`.

## Real phone calls (Twilio, no simulation)
- `POST /api/voice/trigger {secret, to?}` → Eleanor's real phone rings → Gather speech → `/api/voice/respond` runs the Strands agent → replies in ElevenLabs voice via `<Play /api/speak>` (Twilio voice fallback without public URL).
- Agent tool `call_elder` lets the agent itself place urgent calls; degrades to family escalation without creds.
- Env: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `ELDER_PHONE_NUMBER`, `VOICE_CALLBACK_SECRET`, `PUBLIC_BASE_URL`.

## WhatsApp voice loop (FREE — works in Ethiopia where Twilio trial can't)
- Twilio trial can't terminate to +251, so: Meta Cloud API (free) voice notes instead.
- Agent → Eleanor: ElevenLabs MP3 sent as WhatsApp audio (`POST /api/whatsapp/send {secret, to?, text}`).
- Eleanor → agent: text or voice note → `/api/whatsapp/webhook` → voice transcribed via ElevenLabs Scribe → Strands agent replies with voice note.
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
- **Silence is the emergency.** Every elder message is a heartbeat. Inngest `welfare-check` cron (30 min) fires when Eleanor goes quiet past `WELFARE_QUIET_MINUTES` (6h default): attention nudge → urgent + caregiver WhatsApp + direct voice ping past 2×. Nights are sleep, not silence. Manual trigger: `POST /api/welfare/check` (REPORT_SECRET).
- **Sent ≠ saved.** Every attention/urgent alert needs a family "I'm on it" tap (`PATCH /api/escalations/[id]`); unconfirmed alerts re-fire via WhatsApp every 30 min until someone owns them.
- **Double-dose guard.** `confirm_intake` refuses same-day re-logs, stops Eleanor firmly, and writes the prevented attempt to the family trail. Proven live: adherence stayed 1/3, family notified.

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

## Run locally

### Prerequisites

- Node.js 20 or later and npm
- Optional: a PostgreSQL database for durable state and caregiver login
- Optional: AWS credentials with Bedrock access for live Strands reasoning

### Fastest path: local demo

The elder experience and rule-based care loop run without cloud credentials or a database. State is held in memory until the development server restarts.

```bash
git clone https://github.com/Garinmckayl/kinship.git
cd kinship/frontend
npm ci
npm run dev
```

Open [http://localhost:3000/elder](http://localhost:3000/elder). The family dashboard needs PostgreSQL-backed authentication; follow the full setup below to use it.

### Full local setup

1. Create an empty PostgreSQL database (Neon or local PostgreSQL both work).
2. Copy `frontend/.env.example` to `frontend/.env.local`.
3. Set `DATABASE_URL`, `AUTH_SECRET`, and `REPORT_SECRET`. Generate the secrets with `openssl rand -hex 32`.
4. To enable live Strands Agents instead of the built-in fallback, also set `AWS_REGION` and standard AWS credentials with Amazon Bedrock model access.
5. From `frontend/`, run `npm ci` and `npm run dev`.
6. Open `/login` and sign in with `caregiver@demo.local` / `demo1234`. On first database use, Kinship creates its schema and demo records automatically.

All other integrations are optional and documented in [`frontend/.env.example`](frontend/.env.example): ElevenLabs voice, Inngest background jobs, Twilio, WhatsApp, Resend, Google Calendar, and the Nova Act browser worker.

### Verify the build

```bash
cd frontend
npm run build
```

### Optional: run Nova Act locally

The web app is functional without the browser worker. To execute real browser tasks locally, see [`nova-act/README.md`](nova-act/README.md). Without `NOVA_ACT_API_KEY`, that service uses its simulated demo path.

## Repository map

| Path | Purpose |
|---|---|
| `frontend/` | Next.js product, Strands agents, API routes, UI, and bundled visual assets |
| `agentcore/` | Standalone TypeScript Guardian Agent for Bedrock AgentCore Runtime |
| `nova-act/` | Local Python Nova Act sidecar and its setup instructions |
| `nova-act-agentcore/` | AgentCore-hosted Nova Act browser worker |
| `ARCHITECTURE.md` | System diagram and autonomous-loop explanation |
| `DEVPOST_DESCRIPTION.md` | Plain-language submission description |

## Deploy (Vercel)
- Import `Garinmckayl/kinship`, root directory `frontend`.
- Env vars: AWS creds, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `NEXT_PUBLIC_ELEVENLABS_AGENT_ID` (or private `ELEVENLABS_AGENT_ID`), `ELEVENLABS_TOOL_SECRET`, `ELEVENLABS_WEBHOOK_SECRET`, Inngest keys, Twilio vars, `PUBLIC_BASE_URL=https://<your-app>.vercel.app`.
- Inngest syncs via `/api/inngest` automatically.

## Safety
Reminder + escalation log only. Not medical advice. Urgent keywords (chest pain, fall, dizzy) → URGENT escalation + advise emergency button/911.

## Originality and prior work

Kinship was created during the Agents for Humans hackathon period. No source code or assets from Title AI—or any other prior project—were copied into Kinship. Previous hackathon experience informed product judgment only; Kinship’s implementation and assets are new.

## License

[MIT](LICENSE). The repository contains the source code, original project assets, configuration template, and instructions needed to run Kinship; third-party hosted services require their own credentials.
