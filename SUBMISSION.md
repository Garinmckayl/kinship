# Submission checklist — Agents for Humans (deadline Sep 14, 2026 @ 5pm PDT)

Track: **Everyday Agents** ("runs quietly in the background and only pings you when there's a real decision to make" = our thesis, say it verbatim in the video).

## Devpost submission items
- [x] Public repo URL: `github.com/Garinmckayl/elderai`
- [x] MIT license in repo (LICENSE)
- [x] README (problem / who / why / run / deploy)
- [x] Architecture diagram (ARCHITECTURE.md, mermaid renders on GitHub)
- [ ] Demo video ≤5 min — MUST cover: (1) problem, (2) who it's for, (3) why it matters + working demo
- [ ] Text description on Devpost (mirror README top + track sentence)
- [ ] AWS Builder ID (create at builder.aws.com, paste into submission)
- [ ] Live demo link (Vercel URL — scores Technical points)
- [ ] Bonus: builder.aws.com post titled with "Agents for Humans" (bonus points)

## Three-minute demo script

`[0:00-0:25]` “Every elder companion app is a clinical nagging machine. Kinship gives seniors agency, safety, and a real voice.”

`[0:25-1:15]` On `/elder`, click **Start live voice**. Say: “Kinship, my blood pressure pills are down to the last three.” Interrupt Kinship mid-sentence. Call out that this is ElevenAgents WebRTC with native turn-taking and barge-in, not browser speech synthesis.

`[1:15-2:00]` Open `/demo` and run the pharmacy worker. Call out the DTMF 1 → DTMF 2 → prescription number → confirmation trace. The caregiver output reads: “Lisinopril refill placed at CVS on 4th Ave. Confirmed ready for pickup Thursday 2:00 PM.”

`[2:00-2:35]` Run the pill-tray audit, then trigger the scam interceptor. Read the safety hold and the “caller blocked / no funds transferred” output.

`[2:35-2:50]` In Family view, show the saved caregiver thread and the appointment proposal created by the voice agent’s webhook tool. Tap **Approve & sync** to demonstrate human-in-the-loop control.

`[2:50-3:00]` Close on: “Dignity for elders. Absolute peace of mind for their children.”

The fallback path is deterministic and credential-free, but the competition path is live when configured: public ElevenAgents ID for browser voice, ElevenLabs webhook tools for actions, HMAC post-call transcript ingestion, and native Twilio phone integration. Say “mock demo” when presenting the pharmacy and bank actions; only present live external actions when the corresponding opt-in environment flags are enabled.

## Score boosters (from judging criteria)
- [x] **AgentCore deployed** — `arn:aws:bedrock-agentcore:us-west-2:451870923073:runtime/elderlove_guardian-2ee2NC41zV` (READY, invocation-tested). ECR: `elderlove-guardian:latest`. NOTE: bills while live — teardown after judging if desired.
- [ ] **$50 AWS credits** — claim via Resources tab form.
- [ ] Vercel env vars set (DATABASE_URL, AUTH_SECRET, AWS ×3, ELEVENLABS ×2, PUBLIC_BASE_URL, REPORT_SECRET, ...)

## Suggested video beats (4 min)
1. 0:00–0:30 Problem: elders alone, missed meds, silence kills. Who: Ruth, 78. Why: 58M→84M, $300B non-adherence.
2. 0:30–1:30 Morning call — real voice loop, med confirmed, memory moment.
3. 1:30–2:15 Double-dose save — "please stop, put it down" + family trail.
4. 2:15–3:00 Silence drill (20-min window) — urgent fires, family taps "I'm on it".
5. 3:00–3:40 Caregiver chat + dashboard + architecture (10s) + "runs quiet, pings on decisions".
