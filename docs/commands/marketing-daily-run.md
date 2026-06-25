---
description: Run the Arc90 daily marketing automation in draft mode.
---
# /marketing-daily-run

Run the Arc90 marketing automation controller for today.

## Steps
1. Read `docs/marketing-automation.json`.
2. Read `docs/launch-content-pack.md`.
3. Read `marketing/launch-2026-06/01_TikTok_Ads/ARC90 TikTok Ad Plan.md`.
4. Ask `arc90-marketing-automation-orchestrator` to create the daily packet.
5. Keep all Instagram, TikTok, creator outreach, and TikTok ad actions in draft mode unless the user explicitly approves live action.

## Required Output
Return one daily packet:
- Instagram UGC image brief
- Instagram carousel copy
- Instagram caption
- TikTok Higgsfield prompt
- TikTok caption and hashtags
- Three TikTok creator outreach drafts
- Competitor research summary
- TikTok ads recommendation
- Blockers before live posting

## Non-Negotiables
- No automated unsolicited DMs.
- No live posting without OAuth credentials and explicit approval.
- No medical, weight-loss, dosing, treatment, or guaranteed-result claims.
