# Architecture (single TypeScript codebase)

```mermaid
flowchart LR
    E[Elder PWA /elder<br/>voice + 3 big buttons] --> API[Next.js API<br/>/api/chat /api/status]
    F[Family Dashboard /family<br/>adherence + escalations] --> API
    API --> G[Strands TS guardian-agent<br/>lib/guardian.ts]
    G --> T1[get_med_schedule]
    G --> T2[confirm_intake]
    G --> T3[log_mood]
    G --> T4[retrieve_memory]
    G --> T5[notify_family<br/>SNS/Twilio TODO]
    G --> T6[summarize_for_doctor]
    T1 & T2 & T3 & T4 & T5 & T6 --> DB[(in-memory store<br/>lib/demo-data.ts<br/>DynamoDB in prod)]
```

**Autonomous loop:** scheduled check-in → med confirm → mood scan → memory moment → escalate (info/attention/urgent) only on threshold.

**Fallback:** without AWS creds, `fallbackReply()` handles demo deterministically. With creds, Strands Bedrock agent reasons with tools.
