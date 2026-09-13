# Submission checklist -- Agents for Humans (deadline Sep 14, 2026 @ 5pm PDT)

Track: **Everyday Agents** ("runs quietly in the background and only pings you when there's a real decision to make" = our thesis, say it verbatim in the video).

## Devpost submission items
- [x] Public repo URL: `github.com/Garinmckayl/kinship`
- [x] MIT license in repo (LICENSE)
- [x] Prior-work disclosure added: no Title AI source code or assets were reused
- [x] Repo verified public and GitHub recognizes the **MIT License**
- [x] README (problem / who / why / run / deploy)
- [x] Architecture diagram (ARCHITECTURE.md, mermaid renders on GitHub)
- [ ] Demo video <= 5 min -- current cut is ~4:03 and covers: (1) problem, (2) intended users, (3) why it matters + working demo
- [ ] Text description on Devpost (see DEVPOST_DESCRIPTION.md)
- [ ] AWS Builder ID (create at builder.aws.com, paste into submission)
- [x] Live demo: `https://kinship.arcumet.com` (HTTP 200 verified Sep 13, 2026)
- [ ] Bonus post 1: publish `BUILDER_AWS_POST.md`, then add its public URL to Devpost
- [ ] Bonus post 2: publish `BUILDER_AWS_POST_2_STRANDS.md`, then add its public URL to Devpost
- [ ] Bonus post 3: publish `BUILDER_AWS_POST_3_NOVA_ACT.md`, then add its public URL to Devpost
- [ ] Confirm every post title contains the exact phrase **Agents for Humans**

## Demo script

See `DEMO_VIDEO_SCRIPT.md` and `kinship-demo/SCRIPT.md`; the current rendered composition is approximately 4:03.

Quick summary:
- **Beat 0** (0:00-0:45): Compound-risk detection hook -- five weak signals combine into one urgent escalation.
- **Beat 1** (0:45-1:15): Problem statement with stats.
- **Beat 2** (1:15-2:15): Morning with Eleanor -- live voice, med confirmation, double-dose save.
- **Beat 3** (2:15-3:15): Compound risk live demo -- signals stack in the dashboard, agent reasons, escalation fires.
- **Beat 4** (3:15-3:55): Scam interceptor + caregiver chat rapid-fire.
- **Beat 5** (3:55-4:15): Architecture + AgentCore.
- **Beat 6** (4:15-4:30): Close -- "Dignity for elders. Absolute peace of mind for their children."

## Score boosters (from judging criteria)
- [x] **AgentCore deployed** -- `arn:aws:bedrock-agentcore:us-west-2:451870923073:runtime/elderlove_guardian-2ee2NC41zV` (READY, invocation-tested). ECR: `elderlove-guardian:latest`. NOTE: bills while live -- teardown after judging if desired.
- [ ] **$50 AWS credits** -- claim via Resources tab form.
- [ ] Vercel env vars set (DATABASE_URL, AUTH_SECRET, AWS x3, ELEVENLABS x2, PUBLIC_BASE_URL, REPORT_SECRET, ...)

## Suggested video beats (4 min)
1. 0:00-0:45 Compound-risk detection hook (the truck).
2. 0:45-1:15 Problem: elders alone, missed meds, silence kills. Who: Eleanor, 79. Why: 58M->84M, $300B non-adherence.
3. 1:15-2:15 Morning call -- real voice loop, med confirmed, memory moment, double-dose save.
4. 2:15-3:15 Compound risk live -- signals stack, agent reasons, escalation fires, Sarah taps "I'm on it".
5. 3:15-3:55 Scam interceptor + caregiver chat rapid-fire.
6. 3:55-4:15 Architecture + AgentCore diagram.
7. 4:15-4:30 Close: "Dignity for elders. Absolute peace of mind for their children."
