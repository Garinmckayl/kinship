# Architecture — ElderLove (single TypeScript codebase + AgentCore service)

```mermaid
flowchart TB
    subgraph CLIENT["Next.js PWA (Vercel)"]
        E["/elder<br/>orb · voice · wake word<br/>call mode · today board"]
        F["/family<br/>dashboard · caregiver chat<br/>meds · alerts+ack · reports"]
        C["/calendar · /health"]
    end

    subgraph API["Next.js API routes"]
        CHAT["/api/chat + /stream (SSE)"]
        CG["/api/caregiver/stream"]
        REST["status · today · meds<br/>appointments · health · tasks<br/>reports · welfare/check"]
        VOICE["speak (ElevenLabs) · voice/* (Twilio)<br/>whatsapp/* (Meta Cloud API)"]
    end

    subgraph AGENTS["Strands TS agents (Bedrock Sonnet 4.6)"]
        G["guardian-agent<br/>11 tools · contextManager:auto"]
        CG2["caregiver-agent<br/>parent_status · add_medication<br/>remind_parent_now"]
    end

    subgraph DATA["Postgres (Neon)"]
        DB[("meds · intakes · moods<br/>memories · escalations(+ack)<br/>heartbeats · tasks · reports<br/>appointments · health_metrics · users")]
    end

    subgraph BG["Background (Inngest)"]
        CRON["morning-checkin · welfare-check/30min<br/>daily-report 8pm ET"]
    end

    subgraph AC["Bedrock AgentCore (agentcore/)"]
        RT["Express runtime<br/>/ping + /invocations<br/>same tools + Postgres"]
    end

    E --> CHAT
    F --> CG
    C --> REST
    E --> VOICE
    CHAT --> G
    CG --> CG2
    REST --> DB
    G --> DB
    CG2 --> DB
    CRON --> G
    CRON --> DB
    RT --> DB
```

**Autonomous loops (the Everyday-Agents thesis — quiet until a real decision):**
1. Morning check-in → med confirm → mood scan → memory moment → escalate only on threshold.
2. Welfare sweep: every elder message is a heartbeat; silence past threshold → nudge → urgent + call. Nights excluded.
3. Alert acknowledgment: unconfirmed attention/urgent re-fires until a human taps "I'm on it".
4. Double-dose guard: same-day re-log refused, Ruth stopped firmly, attempt written to family trail.
5. Evening digest: adherence/mood/alerts/tasks → WhatsApp + email + saved report.

**Fallbacks (demo never dies):** no AWS creds → rule-based replies + word-chunked SSE;
no DB → in-memory store; no Twilio → WhatsApp voice; no WhatsApp → dashboard escalation.
Every channel degrades one step down, never silent.
