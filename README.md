# ElderLove — Autonomous Guardian for Elders

> Agents for Humans Hackathon — **Everyday Agents** track.
> Proactive Strands agent (TypeScript SDK) that handles meds, loneliness, memory & escalation in the background. Only pings family when it matters.

Demo persona: **Ruth, 78, lives alone, 3 meds.**

Single codebase: Next.js PWA + Strands TS SDK in `frontend/` — no separate Python backend.

## Problem / Who / Why
- **Problem:** elders miss meds + suffer loneliness; families worry constantly; doctors get no adherence signal.
- **Who:** elders living alone (simple voice-first PWA at `/elder`) + adult children (dashboard at `/family`) + doctors (1-page summary via `summarize_for_doctor` tool).
- **Why:** 65+ US 58M → 84M by 2050; non-adherence ~$300B/yr; loneliness mortality ≈ smoking 15 cigs/day. High spending power, underserved.

## Architecture
```
[PWA /elder + /family] --fetch /api--> [Next.js API routes] --> [Strands TS guardian-agent]
        |                              /api/chat  /api/status      | tools (lib/guardian.ts):
        |                                                         get_med_schedule, confirm_intake,
   voice in/out                                                   log_mood, retrieve_memory,
   (Web Speech)                                                   notify_family (SNS/Twilio TODO),
                                                                  summarize_for_doctor
```

Works with zero AWS creds via rule-based fallback (judges click + it just works). Set AWS creds to enable live Bedrock reasoning. See `ARCHITECTURE.md`.

## Run locally
```bash
cd frontend && npm install && npm run dev
# -> http://localhost:3000  (/elder and /family, /api/chat + /api/status)
```

## Deploy
- Frontend + agent deploy together (Vercel / Amplify Hosting). No separate backend.
- Optional: Bedrock AgentCore TypeScript deploy per Strands docs for production scale.
- Wire `notifyFamily` in `frontend/lib/guardian.ts` to SNS SMS.

## Safety
Reminder + escalation log only. Not medical advice. Urgent keywords (chest pain, fall, dizzy) → URGENT escalation + advise emergency button/911.

## License
MIT — see LICENSE.
