# Agents for Humans: Building Kinship -- An Autonomous AI Guardian for Elders Living Alone

## The Problem That Woke Me Up

My grandmother lives alone. Every morning, my mother calls to check if she took her pills. Every evening, she calls to ask if she ate. On a bad day, three calls go unanswered and my mother is on the highway at midnight, heart pounding, because silence is the emergency.

Fifty-eight million Americans are over 65. That number hits 84 million by 2050. Medication non-adherence costs $300 billion per year. And loneliness -- the clinical research is unambiguous -- loneliness kills at the rate of smoking fifteen cigarettes a day.

Every elder companion app I found was the same: a clinical nagging machine that sends one push notification per one missed pill. None of them understood that a missed pill *plus* dizziness *plus* silence is not three nudges. It is an emergency.

So I built Kinship.

## What Kinship Does

Kinship is an autonomous AI guardian that runs quietly in the background of an elder's day and only surfaces to the family when there is a real decision to make.

The demo persona is Eleanor, 79, living alone in Columbus, Ohio. Her daughter Sarah is in Chicago. Three daily medications.

Kinship handles:
- **Medication reminders and logging** with double-dose prevention
- **Loneliness detection and companionship** through mood tracking and memory sharing
- **Symptom tracking** -- passively catching aches and pains mentioned in conversation
- **Scam protection** -- detecting and intercepting fraud attempts targeting elders
- **Welfare monitoring** -- silence detection with escalating alerts
- **Appointment management** -- human-in-the-loop: the agent proposes, the caregiver approves
- **Daily caregiver reports** via WhatsApp and email
- **Real phone calls and WhatsApp voice notes** to reach Eleanor on her actual devices

## Why Strands Agents SDK

I chose the Strands Agents SDK (TypeScript) because I needed three things: tool orchestration at scale, graceful degradation, and the ability to reason across multiple signals simultaneously.

### Tool Orchestration

Kinship's guardian agent has 15 tools:

```typescript
export const ALL_TOOLS = [
  getMedSchedule, confirmIntake, logMood, retrieveMemory,
  notifyFamily, summarizeForDoctor, scheduleTask, callElder,
  manageAppointments, logHealthMetric, getHealthTrends,
  logSymptom, checkRefillStatus, checkScam, flagScam
];
```

The SDK's `tool()` helper with Zod schema validation made each tool a self-contained unit. The agent decides which to invoke based on the conversation context. When Eleanor says "I'm dizzy," the agent simultaneously calls `log_symptom` (passive tracking), checks `get_med_schedule` (are meds missed?), and evaluates whether to call `notify_family` at the `urgent` level.

A separate caregiver agent uses 7 tools. And a scam-specialist sub-agent handles fraud analysis with its own prompt and reasoning chain. Three agents, one SDK, all TypeScript.

### Context Management

Strands' `contextManager: "auto"` was critical. Eleanor's conversations span hours -- morning greeting, med confirmation, a lonely moment at lunch, a symptom mention at dinner. The automatic summarization and context offloading kept the agent coherent across long threads without blowing token budgets.

### Graceful Degradation

The SDK gracefully handles Bedrock being unavailable. When judges click the demo without AWS credentials, the app falls through to a deterministic rule-based reply system that uses the exact same store layer. The agent's `chat()` function checks for credentials and routes accordingly:

```typescript
if (!process.env.AWS_REGION && !process.env.AWS_ACCESS_KEY_ID) {
  const out = await fallbackReply(userId, message);
  return out;
}
```

Every layer degrades one step down, never silent.

## The Hero Feature: Compound-Risk Detection

This is what I believe separates Kinship from a reminder app.

Most systems react to a single alarm: "pill missed, send notification." Kinship combines weak signals:

1. **Medication missed** -- `get_med_schedule` returns 0/3 taken
2. **Breakfast not confirmed** -- morning check-in (Inngest cron at 9am ET) unanswered
3. **Activity unusually low** -- `lastHeartbeat` shows prolonged silence
4. **Elder reports dizziness** -- `log_symptom("dizzy")` caught in conversation
5. **Two check-ins unanswered** -- welfare sweep (Inngest cron, every 30 min) fires twice

Any one of these is a gentle nudge. But the Strands agent sees all five in its tool results and system prompt instructions:

```
If missed dose >= 2 or words like chest pain, fall, dizzy -> escalate URGENT.
```

The welfare sweep independently triggers:

```typescript
if (hb && hb.minutesAgo > q * 2) {
  await addEscalation(elder, "urgent",
    `[welfare-critical] No sign of Eleanor for ~${hrs}h. Call her now.`);
  await notifyCaregiverWA(`ElderLove URGENT: no sign of Eleanor for ~${hrs}h.`);
}
```

The combination of agent-level reasoning (Strands tools + system prompt) and system-level monitoring (Inngest crons + heartbeat tracking) creates a compound detection net that no single alarm system can match.

## Architecture: Single Codebase, Multiple Channels

```
[PWA /elder + /family]
    |
    v
[Next.js API routes] --> [Strands TS guardian-agent (Bedrock Sonnet 4.6)]
    |                          |
    |                     15 tools (meds, mood, memory, symptom,
    |                      notify, call, appointments, health,
    |                      scam, refill, schedule)
    |
[Inngest] -- durable crons:
    morning-checkin (9am ET)
    welfare-sweep (every 30 min)
    daily-report (8pm ET)
    |
[Postgres (Neon)] -- 13 tables
    |
[Communication channels]:
    ElevenAgents WebRTC (live voice, turn-taking, barge-in)
    Twilio (real PSTN phone calls)
    WhatsApp Cloud API (free voice notes)
    Resend (email reports)
```

Everything is TypeScript. One `frontend/` directory. The Strands agent, the API routes, the background jobs, and the communication channels share the same `store.ts` persistence layer.

## Deploying on Bedrock AgentCore

I deployed the guardian agent as a standalone AgentCore runtime. The `agentcore/` directory contains a Docker-based Express server (`/ping` + `/invocations`) using the same Strands tools and Postgres connection:

```bash
# deploy.sh (simplified)
docker buildx build --platform linux/arm64 -t elderlove-guardian .
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_URI
docker push $ECR_URI/elderlove-guardian:latest
aws bedrock-agentcore create-agent-runtime \
  --agent-runtime-name elderlove_guardian \
  --model-identifier anthropic.claude-sonnet-4-20250514-v1:0 \
  --runtime-config containerConfig={...}
```

The runtime is live and healthy: `arn:aws:bedrock-agentcore:us-west-2:451870923073:runtime/elderlove_guardian-2ee2NC41zV`.

AgentCore strengthened the architecture: the heavy Strands inference runs on dedicated ARM64 compute, isolated from the Vercel cold-start path.

## The Safety Contract

Kinship is not a medical device. The system prompt and every tool callback enforce strict boundaries:

- **Never diagnose.** The agent reminds and logs. Dosage changes come from doctors.
- **Never book without consent.** Appointments are `proposed` until a caregiver taps `Approve`.
- **Never stay silent.** Every channel degrades one step down (Twilio -> WhatsApp -> dashboard escalation), but the system never swallows an alert.
- **Sent is not saved.** Unconfirmed urgent alerts re-fire every 30 minutes via WhatsApp until a human taps "I'm on it."

```typescript
// An alert nobody confirmed is an alert nobody saw.
const stale = await unackedUrgentOlderThan(30, elder);
for (const s of stale.slice(0, 3)) {
  await notifyCaregiverWA(`ElderLove reminder (unconfirmed ${s.level}): ${s.message}`);
}
```

## What I Learned

**1. Tools are the product.** The Strands SDK's tool abstraction forced me to think about every agent capability as a discrete, testable unit. `confirm_intake` isn't just "log a pill" -- it's a double-dose guard, a family notification, and an adherence counter, all behind one Zod schema.

**2. Durable execution matters more than LLM quality.** Eleanor closes the browser. She puts down the tablet. The agent must keep working. Inngest's `sleepUntil` and cron triggers gave me background execution that survives disconnects. Without this, "remind me in 30 minutes" is a broken promise.

**3. Silence detection is the hardest problem.** Building a system that notices *nothing happened* is fundamentally different from building one that reacts to input. The heartbeat + welfare sweep architecture was the most important design decision in the project.

**4. Graceful degradation wins demos.** Judges will not have your AWS credentials, your Twilio number, or your database. Every layer must work without its dependencies. The rule-based fallback, the in-memory store, the browser TTS -- these aren't compromises. They're what make the demo work.

## Try It

- **Live demo:** [Vercel deployment URL]
- **Source code:** [github.com/Garinmckayl/elderai](https://github.com/Garinmckayl/elderai) (MIT license)
- **Run locally:** `cd frontend && npm install && npm run dev`

Open `/elder` to be Eleanor. Open `/family` to be Sarah.

Kinship doesn't replace a daughter's love. It makes sure she never has to wonder if her mother is okay.

---

*Built for the Agents for Humans Hackathon using Strands Agents SDK, AWS Bedrock, and Bedrock AgentCore.*
