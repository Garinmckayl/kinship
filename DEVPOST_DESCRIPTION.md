# Kinship — The AI Care Companion That Closes the Loop

> **Everyday Agents:** quiet background care that surfaces only when a real human decision is needed.

## Inspiration

Family caregiving is a second shift made of tiny, repetitive tasks: check the pills, confirm the appointment, search insurance directories, follow up, and remember what happened.

Most care tools turn that work into more notifications. They detect a missed medication or low activity, then leave a daughter with more alarms and the same question: **What should I do now?**

Kinship closes that gap. It runs quietly in the background, handles the repetitive work, and surfaces only when there is a real human decision to make.

## What it does

Kinship is a voice-first care companion for an older adult and a decision dashboard for family.

Our demo follows Eleanor, 79, living independently in Columbus:

1. Kinship reminds Eleanor about four medications and shares her confirmations without another repetitive caregiver call.
2. It connects medication, activity, mood, conversation, and upcoming care without claiming a diagnosis.
3. It proposes one bounded action: find nearby Internal Medicine doctors who accept Medicare.
4. Sarah explicitly approves the request.
5. A Strands agent starts a durable task and Amazon Nova Act operates Medicare.gov in a real AgentCore browser.
6. Sarah watches every step live and receives a readable, source-backed receipt.
7. The outcome remains connected to appointments, health context, and family follow-through.
8. In an immersive call, Eleanor can speak naturally while visible tool states confirm that Kinship is checking, logging, and updating—not merely replying.
9. Inngest runs the quiet care rhythm even when nobody has the app open: a 9 AM check-in, 30-minute welfare sweeps, scheduled work, and an 8 PM caregiver digest.

In our production verification, Kinship returned two real providers 0.1 miles from Eleanor: Christopher Barlow and Shannon C. Codispoti, MD, with the practice address and phone number.

That is the difference between an AI that talks and an agent that closes the loop.

## Why it matters

Elder care is not one dramatic emergency. It is a thousand recurring uncertainties: Was the pill taken? Is today’s silence normal? Was the appointment confirmed? Who accepts Medicare? Did anyone follow up?

More than 50 million Americans provide unpaid family care. Returning even one hour per week would represent more than 2.6 billion hours restored to families each year. Kinship is designed to make that credible by automating bounded tasks while protecting human decisions.

Kinship is designed around four principles:

- **Silence is a signal.** Durable welfare checks notice when expected activity does not happen.
- **Context beats alarm volume.** Medication, mood, symptoms, activity, and conversation become one explainable picture.
- **Sent is not saved.** Urgent alerts remain open until a caregiver acknowledges ownership.
- **Humans authorize consequential action.** The agent proposes; the family decides.
- **Repetition belongs to the agent.** Checking, remembering, searching, following up, and verifying run as durable background work.

## How we built it

- **Strands Agents SDK:** specialized care, safety, and browser agents coordinate typed tools for medication status, mood, memory, symptoms, notifications, appointments, health trends, and browser tasks.
- **Amazon Bedrock:** provides the companion’s reasoning and tool selection.
- **Amazon Bedrock AgentCore Browser:** hosts the real browser session used by Nova Act.
- **Amazon Nova Act:** navigates public websites and extracts structured, source-linked results.
- **Inngest:** runs durable reminders, welfare sweeps, reports, and browser workflows that survive disconnects.
- **Next.js + PostgreSQL:** powers the elder experience, family dashboard, approval queue, task history, and care record.
- **ElevenAgents, Twilio, WhatsApp, and Resend:** provide natural conversation and escalation across the channels families already use.

The browser workflow correlates each frontend request with its authoritative sidecar task ID, streams step progress and AgentCore live view to the caregiver, extracts typed results, and fails explicitly instead of fabricating a provider.

## Challenges

### Making “nothing happened” observable

Silence has no event payload. We built heartbeat records and scheduled welfare sweeps so Kinship can reason about missing expected activity while respecting nighttime and configurable quiet windows.

### Showing real agent work without false completion

The frontend originally could confuse tasks of the same type and display completion before the sidecar had finished. We added end-to-end task correlation, durable progress states, explicit failures, and a real DCV/WebSocket live browser view.

### Keeping automation safe

Provider discovery is useful; silently booking care is not. Browser work, appointment requests, and other consequential actions stop at a clear approval boundary. The completed task preserves its steps, source URL, structured result, and errors.

## Accomplishments we are proud of

- A complete, production-verified care loop from compound risk to real nearby help.
- Real Medicare.gov navigation through Nova Act—not a mocked browser or fabricated answer.
- A caregiver can watch the AgentCore browser work in real time.
- Medication reminders, care context, approval, execution, receipt, and follow-through form one coherent product experience.
- The immersive call turns natural conversation into visible medication, schedule, and family-update tool work.
- Inngest provides durable autonomous care and pings family only when risk, attention, or a real decision requires it.
- Human approval remains visible and enforceable.
- Health trends are presented as care context, never diagnosis.
- Alerts and completed browser tasks can be durably acknowledged or cleared.
- The elder experience remains simple, conversational, and full-screen accessible.

## What we learned

The most valuable healthcare agent is not the one with the longest feature list. It is the one that can keep a promise across time:

**notice → understand → ask → act → verify → close the loop**

Reliable execution, explicit approval, truthful failure, and visible receipts matter more than a clever response.

## What’s next

- Confirm provider acceptance and availability with authenticated payer/provider data.
- Turn an approved provider result into a caregiver-reviewed appointment request.
- Add production wearable integrations for passive health signals.
- Expand from one elder to family and community care networks.

## Try it

- **Live app:** https://elderai-omega.vercel.app
- **Caregiver dashboard:** https://elderai-omega.vercel.app/family
- **Demo login:** `caregiver@demo.local` / `demo1234`
- **Source:** https://github.com/Garinmckayl/elderai

### Judge path

1. Sign in and open **Family**.
2. Scroll to **Browser Automation**.
3. Click **Find Medicare doctors near Eleanor**.
4. Review ZIP `43215` and specialty `Internal Medicine`.
5. Click **Approve & Execute**.
6. Watch Nova Act work in the live browser window.
7. Read the completed provider receipt and source URL.

## Built with

Strands Agents SDK, Amazon Bedrock, Amazon Bedrock AgentCore Browser, Amazon Nova Act, Next.js, TypeScript, Inngest, PostgreSQL, ElevenAgents, Twilio, WhatsApp Cloud API, Resend, and Zod.
