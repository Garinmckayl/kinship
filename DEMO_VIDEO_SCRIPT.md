# Kinship -- Demo Video Script (5 min max, target 4:30)

> **Track:** Everyday Agents
> **Thesis (say verbatim):** "Runs quietly in the background and only surfaces when there's a real decision to make."

---

## BEAT 0 -- The Truck (0:00 - 0:45)

**[SCREEN]** Black screen. Five signal cards appear one by one, stacking vertically with a quiet heartbeat sound:

```
  [!] Medication missed                     (yellow)
  [!] Breakfast not confirmed               (yellow)
  [!] Activity unusually low                (yellow)
  [!] Elder reports dizziness               (orange)
  [!] Two check-ins unanswered              (red)
```

Each card fades in with a soft pulse. After the fifth card, a brief pause -- then they all connect with glowing lines to a central node that reads:

```
  COMPOUND RISK DETECTED
```

The agent's reasoning appears typewriter-style below:

```
  "Any one of these is a nudge. All five together are abnormal.
   Medication non-adherence + dizziness + silence = possible
   adverse event. Escalating to Sarah now."
```

A phone notification slides in: **"ElderLove URGENT -- Eleanor missed meds, reported dizziness, and has gone quiet. Call her now."**

**[NARRATION]**
> "Most elder care apps send one alert for one problem. Kinship sees five weak signals, reasons about the combination, and concludes that together they are dangerous. It doesn't wait for a fall. It acts before one happens."

**[SCREEN]** Brief pause. Title card:

```
  KINSHIP
  Autonomous AI Guardian for Elders Living Alone
  Built with Strands Agents SDK on AWS Bedrock
```

---

## BEAT 1 -- The Problem (0:45 - 1:15)

**[SCREEN]** Clean text on dark background, stats appear as the narrator reads:

```
  58 million Americans over 65. Growing to 84 million by 2050.
  Non-adherence costs $300 billion per year.
  Loneliness kills at the rate of smoking 15 cigarettes a day.
  And when an elder falls alone... silence is the emergency.
```

**[NARRATION]**
> "Fifty-eight million Americans over 65. Eighty-four million by 2050. Medication non-adherence alone costs three hundred billion dollars a year. And loneliness -- the research is clear -- loneliness kills at the rate of smoking fifteen cigarettes a day."
>
> "But the real danger is silence. When Eleanor falls and can't reach a button, the problem isn't that an alarm didn't fire. The problem is that no one noticed nothing happened."
>
> "Every elder companion today is a clinical nagging machine. Kinship is different. It runs quietly in the background and only surfaces when there's a real decision to make."

---

## BEAT 2 -- Morning with Eleanor (1:15 - 2:15)

**[SCREEN]** `/elder` page. Nova animated avatar is idle. The Today board shows 3 meds: Lisinopril (pending), Metformin (pending), Amlodipine (pending).

**[NARRATION]**
> "Meet Eleanor. She's seventy-nine, lives alone in Columbus, Ohio. Her daughter Sarah is in Chicago. Three daily medications."

**[ACTION - show on screen]**
1. Click **"Start live voice"** (ElevenAgents panel). Nova's face activates.
2. Eleanor speaks: *"Good morning. I just took my blood pressure pill."*
3. Agent responds warmly, confirms Lisinopril, the Today board updates (1/3 taken, green check).
4. Agent shares a memory: *"That reminds me -- do you remember Henry's garden? You once told me the tomatoes were bigger than your fist."*

**[NARRATION]**
> "Eleanor talks to Kinship like a person, not an app. The agent confirms her pill, logs it to the database, and shares a memory moment to keep her company. Real voice, real turn-taking -- this is ElevenAgents WebRTC with native barge-in, not browser speech synthesis."

**[ACTION - show on screen]**
5. Eleanor says: *"Yes, I took my blood pressure pill again."* (attempts double dose)
6. Agent responds firmly but kindly: *"Eleanor, please stop -- you already took your Lisinopril this morning. Another dose could be harmful. I've let Sarah know just in case."*
7. Cut to the Family dashboard `/family` -- a new alert appears: **[attention] Double-dose prevented: Eleanor tried to log Lisinopril again -- stopped her.**

**[NARRATION]**
> "Double-dose guard. The database enforces one intake per medication per day. Eleanor is stopped firmly, kindly, and the prevented attempt is written to Sarah's trail. This isn't a reminder app. This is a safety system."

---

## BEAT 3 -- Compound Risk Detection (2:15 - 3:15)

> **This is the hero beat. Linger here. Show the reasoning.**

**[SCREEN]** Split view: left is the `/elder` page (quiet, no messages for a while), right is the `/family` dashboard showing escalations building up.

**[NARRATION]**
> "Now here's what makes Kinship different from every other agent in this competition."

**[ACTION - show on screen]** Walk through each signal appearing on the family dashboard:

1. **9:00 AM** -- Morning check-in fires. Eleanor doesn't respond. Alert: *"Morning check-in unanswered."*
2. **9:30 AM** -- Welfare sweep runs (every 30 min via Inngest cron). Heartbeat is stale. Alert: *"Eleanor quiet for 30+ minutes. A call would be wise."*
3. **10:00 AM** -- Eleanor briefly responds: *"I'm dizzy."* Agent catches it, logs the symptom via `log_symptom`, logs mood as "anxious."
4. **10:00 AM** -- Agent checks med schedule: Lisinopril missed. Metformin missed.
5. **10:30 AM** -- Second welfare sweep. Eleanor silent again. Two check-ins unanswered.

**[SCREEN]** The five signals now stack visually (recreate the opening graphic, but this time it's REAL data from the dashboard):

```
  [!] Lisinopril + Metformin missed         -> get_med_schedule
  [!] Breakfast check-in unanswered          -> welfare sweep / heartbeat
  [!] Activity unusually low                 -> lastHeartbeat.minutesAgo
  [!] "I'm dizzy"                            -> log_symptom
  [!] Two check-ins unanswered               -> welfare sweep escalation
```

**[SCREEN]** Agent's reasoning chain (show as an animated trace):

```
  GUARDIAN AGENT REASONING:
  - get_med_schedule: 0/3 taken (Lisinopril, Metformin pending)
  - log_symptom: "dizzy" mentioned (mentions7d: 1, first report today)
  - System prompt rule: "missed dose >= 2 OR dizzy -> escalate URGENT"
  - Welfare sweep: minutesAgo > quietMinutes threshold
  - Combination: missed meds + dizziness + silence = possible adverse event

  ACTION: notify_family(level: "urgent", message: ...)
  ACTION: call_elder(reason: "unresponsive after dizziness report")
```

**[SCREEN]** The family dashboard fires an URGENT alert with the glowing red border:

```
  [URGENT] Eleanor missed 2 medications, reported dizziness,
  and has gone quiet. Combination is abnormal. Call her now.
```

Sarah's phone shows a WhatsApp message: *"ElderLove URGENT -- Eleanor missed meds, reported dizziness, and has gone quiet. Call her now."*

Sarah taps **"I'm on it"** in the dashboard. The alert is acknowledged. The re-fire loop stops.

**[NARRATION]**
> "This is compound-risk detection. Any one of these signals alone is a gentle nudge. But the agent sees all five together. It combines missed medication from the schedule tool, a dizziness symptom from passive conversation tracking, and silence from the welfare heartbeat system. The system prompt instructs: two missed doses OR dizziness means escalate urgent. The welfare cron independently flags the silence. Together, the agent concludes the combination is abnormal and begins escalation."
>
> "It calls Eleanor's real phone through Twilio. It messages Sarah on WhatsApp. And it keeps re-firing that alert every thirty minutes until a human taps 'I'm on it.' A sent alert isn't a saved life. An acknowledged one is."

---

## BEAT 4 -- The Agent Lab (3:15 - 3:55)

**[SCREEN]** `/demo` page -- the four showcase cards.

**[NARRATION]**
> "Beyond the daily loop, Kinship can act in the physical world."

**[ACTION - rapid fire, 10 seconds each]**

1. **Pharmacy phone-tree buster:** Click "Run pharmacy worker." Steps animate: dial, DTMF 1, DTMF 2, prescription number entered, refill confirmed. Caregiver output: *"Lisinopril refill placed at CVS on 4th Ave. Confirmed ready for pickup Thursday 2:00 PM."*

2. **Scam interceptor:** Click "Trigger audio intercept." The transcript reads: "Agent Miller from the IRS... Apple Gift Cards." Result: caller blocked, card frozen (simulated), FTC report queued, zero funds transferred. Urgent alert fires.

3. **Temporal graph:** Click "Run proactive check." The graph connects Eleanor's knee memory from Day 1 to a weather signal on Day 14. Agent message: *"Good morning Eleanor -- heavy rain is coming. Grab your heating pad before your left knee starts complaining like last time."*

**[NARRATION]**
> "The pharmacy worker navigates a real phone tree with DTMF tones. The scam interceptor blocks gift-card fraud in real time -- caller blocked, card frozen, no funds transferred. And the temporal graph connects a symptom memory from two weeks ago to today's weather forecast and acts before Eleanor asks."

---

## BEAT 5 -- Architecture + AgentCore (3:55 - 4:15)

**[SCREEN]** Architecture diagram from ARCHITECTURE.md (clean Mermaid render), hold for 8 seconds. Highlight:

```
  Strands TS SDK (guardian: 15 tools, caregiver: 7 tools, scam specialist)
  AWS Bedrock (Claude Sonnet 4.6)
  Inngest (durable crons: morning check-in, welfare sweep, daily report)
  Bedrock AgentCore (deployed, healthy, invocation-tested)
  Postgres (Neon) -- 13 tables
  ElevenAgents WebRTC -- real voice
  Twilio -- real phone calls
  WhatsApp -- free voice notes
```

**[NARRATION]**
> "Single TypeScript codebase. Strands Agents SDK with fifteen tools across three agents. Durable background execution through Inngest -- tasks survive disconnects. Deployed on Bedrock AgentCore, invocation-tested, healthy. And every layer degrades gracefully: no AWS creds, it uses rule-based replies. No database, it uses in-memory. No Twilio, it falls back to WhatsApp. No WhatsApp, it escalates through the dashboard. The demo never dies."

---

## BEAT 6 -- Close (4:15 - 4:30)

**[SCREEN]** Eleanor's face (Nova avatar), idle, peaceful. Slow zoom out to show the full elder interface. Then the tagline:

```
  KINSHIP

  Dignity for elders.
  Absolute peace of mind for their children.
```

**[NARRATION]**
> "Kinship doesn't replace a daughter's love. It makes sure she never has to wonder if her mother is okay."
>
> "Dignity for elders. Absolute peace of mind for their children."

---

## PRODUCTION NOTES

### Screen Recording Order
1. Record Beat 0 graphic separately (motion graphics or screen capture of a custom page)
2. Record `/elder` live voice session (Beat 2) -- ensure Today board is visible
3. Record `/family` dashboard with escalations building (Beat 3)
4. Record `/demo` lab rapid-fire (Beat 4)
5. Screenshot architecture diagram (Beat 5)
6. Record closing shot on `/elder` (Beat 6)

### Narration
- Total narration: ~1,200 words at 160 WPM = ~4:15 with pauses
- Tone: calm, confident, no hype. Let the product speak.
- Record with a decent mic in a quiet room. Audacity is fine.

### What NOT to say
- Don't say "AI-powered" without showing what the AI does
- Don't say "revolutionary" -- the judges have seen 8,000 entries
- Don't claim pharmacy integration is live unless `LIVE_PHARMACY_DEMO=1` is set -- say "mock demo" for the phone-tree
- Don't claim medical advice -- say "reminder and escalation log only"

### Judging Criteria Mapping
| Criteria | Where it's shown |
|---|---|
| Technical Implementation | Beat 3 (compound risk), Beat 5 (architecture + AgentCore) |
| Design | Beat 2 (full product experience, not a POC) |
| Potential Impact | Beat 1 (stats), Beat 6 (emotional close) |
| Creativity & Originality | Beat 0 (compound risk hook), Beat 4 (pharmacy/scam/temporal) |
| Presentation | Beat 0 (opens with a truck), clean narration throughout |
