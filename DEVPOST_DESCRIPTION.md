# Kinship — An AI Care Agent for Older Adults Living Alone

**Track:** Everyday Agents

**Elevator pitch:** Kinship talks with older adults, logs medications, schedules and monitors follow-ups, and uses Amazon Nova Act to complete caregiver-approved tasks such as finding Medicare doctors—alerting family only when a risk or real decision needs them.

## Inspiration

Family caregiving is a second shift made of small, relentless questions:

- Did Mom take her medication?
- Is today’s silence normal?
- Was the appointment confirmed?
- Which nearby doctor accepts Medicare?
- Did anybody follow up?

Most care products turn those questions into more alerts. They detect something, notify a daughter, and leave her with the same work and the same uncertainty.

We built Kinship around a different idea: **the agent should handle repetition quietly and involve family only when human judgment or approval is required.**

## What it does

Kinship is a voice-first AI care companion for older adults living independently and a decision surface for their families.

Our demo follows Eleanor, 79, and her daughter Sarah.

Eleanor can speak naturally to Kinship or use a simple senior-friendly interface. In one real production interaction, she says that she took her Metformin and asks for a blood-pressure reminder. Kinship:

1. Streams its response in real time.
2. Calls the medication tool and safely records the dose.
3. Creates a durable follow-up task.
4. Keeps that task running after the conversation ends.
5. Shows the exact task on Sarah’s caregiver dashboard.
6. Alerts Sarah only if Eleanor misses the follow-up or a decision is required.

Kinship also connects medication adherence, symptoms, mood, activity, health signals, appointments, and conversation history into one care context. It does not diagnose or change dosages.

For consequential external work, Kinship pauses for approval. In the demo, it proposes finding nearby Internal Medicine clinicians who accept Medicare. Sarah reviews the request and selects **Approve & Execute**. Amazon Nova Act then operates Medicare Care Compare inside an Amazon Bedrock AgentCore Browser while Sarah watches the live browser session.

Kinship returns a readable receipt—not a vague “done” message. Our production run found two real providers 0.1 miles from Eleanor’s Columbus ZIP, including address, phone number, search criteria, and source.

That is the complete loop:

**notice → understand → ask → act → verify → remember**

## Why it matters

Care rarely fails because nobody cares. It fails in the gap between noticing and following through.

Kinship reduces that gap without taking control away from Eleanor or Sarah:

- **Quiet by default:** repetitive checks and reminders run in the background.
- **Decision-aware:** appointments, browser actions, and other consequential steps require explicit approval.
- **Observable:** the caregiver can watch Nova Act work and see durable task status.
- **Auditable:** completed work preserves steps, results, errors, and source links.
- **Accessible:** Eleanor gets large controls, natural voice interaction, an immersive call, and a full-screen conversation.
- **Safety-bounded:** health signals are context, not diagnosis; medication confirmation includes double-dose protection.

More than 50 million Americans provide unpaid family care. Returning even one hour per week would restore more than 2.6 billion hours to families each year.

## How we built it

### Agent orchestration

Kinship uses a multi-agent architecture organized around trust boundaries:

- **Guardian Agent:** Eleanor’s elder-facing Strands agent. It coordinates 17 care and safety tools for medications, symptoms, mood, health trends, appointments, reminders, notifications, and browser-task requests.
- **Caregiver Agent:** Sarah’s family-facing Strands agent. It reads the same durable care record but has a different prompt and narrower tools for status, medication management, reminders, summaries, and appointment proposals.
- **ScamGuard Specialist:** a dedicated Strands sub-agent. The Guardian delegates suspicious caller or money stories through `check_scam`; ScamGuard returns a structured verdict, a kind script for Eleanor, and a family note.
- **Nova Act Browser Worker:** an approval-gated execution agent for external websites. It begins only after Sarah approves a bounded request, then writes progress and results back to the shared task record.

The agents do not pass around unstructured chat. They coordinate through typed tool contracts, explicit approval states, and shared PostgreSQL records. We chose specialized agents around safety boundaries—not a swarm of general-purpose chatbots.

The Guardian’s typed tools cover:

- Medication schedules and intake confirmation
- Mood, memory, symptoms, and health trends
- Durable reminders and welfare follow-up
- Caregiver notifications and doctor summaries
- Appointment proposals and approvals
- Browser task requests and result handling

Amazon Bedrock provides reasoning and tool selection. Zod schemas keep tool inputs explicit and validated.

### Real browser action

Amazon Nova Act runs approved tasks in an **Amazon Bedrock AgentCore Browser**. A sidecar service creates and tracks the browser session. The frontend correlates every request with its authoritative sidecar task ID, streams progress, and embeds the AgentCore DCV live view.

For the competition demo, Nova Act:

1. Opens Medicare Care Compare.
2. Selects clinicians.
3. Enters ZIP `43215`.
4. Filters for Internal Medicine.
5. Reads the official results.
6. Returns structured provider details with the source attached.

### Durable care

Kinship persists medication intake, chat history, alerts, tasks, appointments, reports, and health metrics in PostgreSQL.

Scheduled reminders and welfare checks continue after Eleanor closes the app. The family dashboard shows the resulting work, while notification channels are reserved for attention and real decisions.

### Voice and communication

The elder experience includes ElevenLabs conversational voice with natural turn-taking, interruption, dynamic context, and tool events. Kinship can also use Twilio, WhatsApp, Resend, and browser speech fallbacks depending on available channels.

### Product surfaces

- **Eleanor:** voice companion, immersive call, medication board, and full-screen chat
- **Sarah:** caregiver status, decisions, alerts, reports, background tasks, and live browser work
- **Calendar:** appointment proposals remain pending until caregiver approval
- **Health:** trends and context without diagnostic claims

## Challenges

### Making agent work truthful

The browser workflow originally risked showing a completed state before the matching sidecar task had actually finished. We replaced task-type guessing with exact `sidecar_task_id` correlation and explicit running, completed, and failed states.

### Showing a real remote browser

AgentCore’s live view is a DCV/WebSocket stream rather than a normal video URL. We integrated the official live-view client, matched the remote viewport, and kept the signed stream stable while task updates continued.

### Detecting when nothing happened

Silence has no event payload. Kinship records heartbeats and runs scheduled welfare checks with quiet-hour awareness. Missing expected activity can become a gentle nudge, then an escalation if multiple signals compound.

### Keeping medication interaction safe

Medication confirmation resolves the caregiver-managed schedule, accepts natural spoken labels such as “Metformin 500mg,” refuses duplicate same-day intake, and records prevented double-dose attempts.

## Accomplishments we are proud of

- A real end-to-end care loop from Eleanor’s conversation to durable follow-up on Sarah’s dashboard
- Production Nova Act navigation on Medicare.gov—not a mocked browser
- A live AgentCore browser stream visible to the caregiver
- Explicit human approval before consequential action
- Specific, source-backed provider results rather than fabricated completion
- Durable reminders that survive the conversation
- A voice experience that visibly shows tool work
- Health context that supports care without pretending to diagnose
- Clearable alerts and completed browser tasks

## What we learned

The best agent is not the one with the longest capability list. It is the one that can keep a promise across time.

Reliable execution, explicit approval, truthful failure, durable state, and visible receipts matter more than a clever response.

## What’s next

- Connect authenticated payer and provider data for plan-specific coverage
- Turn approved provider results into caregiver-reviewed appointment requests
- Add production wearable integrations
- Expand from one elder to coordinated family and community care networks

## Try it

- **Live app:** https://kinship.arcumet.com
- **Caregiver dashboard:** https://kinship.arcumet.com/family
- **Demo login:** `caregiver@demo.local` / `demo1234`
- **Source:** https://github.com/Garinmckayl/elderai
- **Demo video:** add final video URL

### Recommended judge path

1. Sign in and open **Family**.
2. Scroll to **Browser Automation**.
3. Select **Find Medicare doctors near Eleanor**.
4. Review ZIP `43215` and specialty `Internal Medicine`.
5. Select **Approve & Execute**.
6. Watch Nova Act work in the live browser.
7. Read the provider receipt and source.
8. Open **Eleanor**, select **Simulate morning call**, and send: “I took my Metformin 500mg. Remind me in 30 minutes to check my blood pressure.”
9. Return to **Family** and inspect the durable background task.

## Built with

Strands Agents SDK, Amazon Bedrock, Amazon Bedrock AgentCore Browser, Amazon Nova Act, Next.js, TypeScript, PostgreSQL, Inngest, ElevenLabs, Twilio, WhatsApp Cloud API, Resend, and Zod.
