# PRD — "Learn Chinese" (Agentic, Personalized Mandarin Coach) — v0.1 (Web)

---

## Implementation status

> Last updated: 2026-03-13 | Branch: `claude/review-prd-scope-cGqli`

| Symbol | Meaning |
|--------|---------|
| ✅ | Fully implemented and working |
| 🔶 | Partially implemented — works but incomplete |
| ❌ | Not yet implemented |

### Quick summary

| Area | Status | Notes |
|------|--------|-------|
| Platform foundation | ✅ | Next.js 16, Supabase Auth, Tailwind, shadcn/ui |
| Data model + RLS | ✅ | All tables live; RLS enforced; 7 migrations |
| Chat tutor (streaming) | ✅ | LangGraph + Venice; SSE streaming; structured response |
| Onboarding | ✅ | <2 min; goals, level, style, interests; 7-day plan stub |
| Memory system | ✅ | remember/forget commands; Memory page; audit trail |
| SRS + review loop | ✅ | SM-2 scheduling; offline grade queue; PWA cached |
| Audio / TTS | ✅ | ElevenLabs primary; Venice fallback; play buttons in chat + review |
| PWA / offline | ✅ | Service worker; install prompt; background sync |
| Push notifications | ✅ | Web Push API; VAPID; Supabase subscription storage |
| Home page live stats | ✅ | Streak, due cards, goal fetched from API (not hardcoded) |
| Continuity preview | ✅ | Fetches real last-session data from `/api/progress/continuity` |
| Weekly AI recap | ✅ | Venice-generated "Your week in Mandarin" on progress page |
| Progress / insights | 🔶 | Stats live; weak areas dynamic; weekly targets shown; no D7 metric |
| Curriculum Planner Agent | 🔶 | Node exists in graph but is a stub — no real rolling plan |
| Character practice | 🔶 | Pinyin-input quiz in review; no dedicated character card UI with radicals/mnemonics |
| Pronunciation coach | 🔶 | Web Speech API mic input exists; no minimal-pair drills or scoring |
| Cost guardrails | ❌ | No token budgets or per-session spend limits implemented |
| HSK alignment | ❌ | Deferred to post-v0.1 (non-goal) |
| Native app | ❌ | Deferred — browser/PWA only |

---

## 1) Product vision

A **relationship-based Mandarin coach** that learns the user's life, goals, and routines, then **proactively teaches Mandarin in-context** through daily conversations, micro-lessons, and review loops—across **mobile + desktop browser** (PWA-ready).

Unlike dictionary/flashcard apps, the "superpower" is:

- **Contextual teaching** (your real life → your Mandarin)
- **Agentic proactivity** (nudges, routines, adaptive plan)
- **Memory + relationship** (it remembers what matters and builds continuity)

---

## 2) Goals, non-goals

### Goals (v0.1)

- Deliver a **daily guided learning loop** (5–15 minutes/day) that feels like a conversation with a coach.
- Maintain **continuity across days** using short-term + long-term memory.
- Cover core modalities: **reading + speaking/listening (basic) + writing (basic)**.
- Provide **spaced repetition** that is automatically generated from conversations + lessons.

### Non-goals (v0.1)

- Perfect HSK-aligned courseware (we can map later).
- Native Android app (browser only, PWA-compatible).
- Advanced ASR pronunciation scoring (start lightweight; improve later).

---

## 3) Target users & primary persona

**Primary persona:** busy professional who wants Mandarin for real-life use (work, travel, culture), prefers conversational learning, values personalization and momentum over rigid curriculum.

Secondary personas:

- Traveler prepping for a trip
- Heritage learner rebuilding confidence
- Beginner who needs high guidance + encouragement

---

## 4) Core user journeys (v0.1)

### A) "Daily coach session" (primary journey)

1. ✅ User opens app → sees "Today's session"
2. ✅ Coach greets with continuity from last real session (`/api/progress/continuity`)
3. ✅ 1–2 minute warm-up (review)
4. ✅ 5–10 minute guided conversation + micro-lesson
5. ✅ Auto-generated review set (SRS) + "one sentence to use today"
6. 🔶 User finishes → progress updated — plan is not dynamically adjusted (Planner is a stub)

### B) "Ask anything" (tutor mode)

- ✅ Q&A on grammar, etymology, usage, example sentences, cultural notes
- ✅ "Give me 10 examples in my domain" (works via free-text prompting)
- ❌ "Explain like I'm 5" explicit toggle not implemented as a UI button

### C) "Quick practice" (2 minutes)

- ✅ 5-card SRS burst
- ✅ 1 speaking prompt + TTS playback
- 🔶 1 character mini-practice — basic pinyin-input quiz exists; no full character card (radicals, mnemonics)

---

## 5) Product scope & features (v0.1)

### 5.1 Onboarding & baseline assessment ✅

- ✅ Minimal onboarding: goals, time/day, interests, current level (self-report)
- ❌ Optional quick diagnostic: recognition + simple production (not implemented)
- ✅ User picks "coach vibe": strict / friendly / playful / concise

**Acceptance:** ✅ onboarding < 2 minutes, generates a first-week plan (stub plan text).

### 5.2 Conversational Mandarin Coach (core) ✅

- ✅ Chat interface (text-first), streaming responses
- ✅ Coach teaches vocabulary/grammar in context with pinyin + hanzi + English
- ✅ Corrections and "native-like alternatives"
- ✅ Running lesson thread per session (LangGraph thread continuity)

Coach response structure: ✅
- ✅ 1–4 key points
- ✅ 1–6 examples (with TTS play buttons)
- ✅ 1 micro-exercise
- ✅ "Save to review" actions (suggested review items)

### 5.3 Proactive routine + nudges 🔶

- ✅ Evening nudge on home page if no session by 18:00
- ✅ Push notification infrastructure (Web Push + VAPID)
- ❌ Email push not implemented (deferred)
- ❌ n8n webhook hook not wired up

### 5.4 Memory & relationship system ✅

**Short-term memory:** ✅ LangGraph Postgres-backed checkpointer per thread
**Long-term memory:** ✅ Supabase `memories` table; interests, preferences, vocab

- ✅ "remember this" / "forget this" in-chat commands
- ✅ `/memory` page — view and delete all stored memories
- ✅ `memory_events` audit trail

**Acceptance:** ✅ user can see "What I remember about you" page and delete items.

### 5.5 Spaced repetition that's generated from your life ✅

- ✅ Every session yields suggested review items (1–10 vocab items)
- ✅ Items auto-saved to `srs_cards` after each chat response
- ✅ SM-2-ish scheduling (`ease`, `interval`, `next_due_at`)
- ✅ Daily review queue via `/api/srs/next`
- ✅ Offline grade queue with background sync (PWA)
- 🔶 `hints` field exists but always set to generic text — not session-specific

### 5.6 Audio (v0.1) ✅

- ✅ TTS via ElevenLabs (primary) with Venice audio fallback
- ✅ TTS play buttons on examples in chat CoachBubble
- ✅ TTS play buttons on SRS review cards
- ✅ Optional Web Speech API mic input for speaking practice
- 🔶 "Repeat after me" loop — mic input works but feedback is basic (no phoneme scoring)

### 5.7 Writing / characters (v0.1 "basic") 🔶

- 🔶 Character cards: hanzi shown in review prompts; pinyin input quiz exists
- ❌ Full character card format: radicals, mnemonic, common words — not implemented
- 🔶 "type pinyin → show hanzi" — basic version exists in `/review`
- ✅ "recognition quiz" — present in review flow

**Next step:** Build a dedicated `/characters` page with structured character cards (hanzi, pinyin, radical breakdown, mnemonic, 3 common words). Stroke-order animation is post-v0.1.

### 5.8 Progress & insights 🔶

- ✅ Daily minutes learned (live from API)
- ✅ Streak (live from API)
- ✅ Vocabulary in learning (live count)
- ✅ Due cards count (live)
- ✅ Weak areas — dynamically derived from SRS card performance (ease, last_result)
- ✅ "Your week in Mandarin" — AI-generated recap via Venice (`/api/progress/weekly-recap`)
- ❌ Vocabulary "mastered" tier (cards with high ease / long interval) — no mastered vs learning split
- ❌ D1/D7 retention metrics not tracked

---

## 6) Agentic architecture (LangChain + LangGraph)

### 6.1 Why LangGraph here ✅

Stateful, long-running learning relationship using LangGraph for orchestration and Postgres checkpointing for durable per-thread state.

### 6.2 Agents (v0.1)

| Agent | Status | Notes |
|-------|--------|-------|
| **Conversation Tutor Agent** | ✅ | `TutorResponse` node; Venice LLM; structured output |
| **Curriculum Planner Agent** | 🔶 | `Planner` node exists but is a pass-through stub; no real plan generation |
| **Memory Curator Agent** | ✅ | `MemoryWrite` node; "remember/forget" commands; Supabase persistence |
| **SRS Builder Agent** | ✅ | `SRSExtract` integrated in `/api/chat`; SM-2 scheduling |
| **Pronunciation Coach Agent** | 🔶 | Web Speech API input present; no minimal-pair generation or tone scoring |
| **Safety/Quality Gate** | 🔶 | Verify mode toggle affects temperature + prompting; no active claim-tagging |

**Next for Curriculum Planner:** Generate a rolling 7-day topic plan at session start using the user's profile, recent session summaries, and weak areas. Return it in `planSnippet` from `/api/session/start` (currently hardcoded).

### 6.3 Graph flow ✅

`UserMessage → ContextLoader → MemoryRetrieve → Planner (stub) → TutorResponse → SRSExtract → MemoryWrite → SafetyQualityGate → PersistTelemetry`

Fallback graph (`runFallbackGraph`) used when LangGraph/Postgres unavailable — same node sequence without stateful checkpointing.

### 6.4 Persistence ✅

- ✅ LangGraph `PostgresSaver` checkpointer (falls back to `MemorySaver`)
- ✅ Long-term memory in `learn_chinese.memories` Supabase table

---

## 7) A2A (agent-to-agent) ❌

Deferred. Agents are all within one LangGraph app. A2A interface layer is post-v0.1.

---

## 8) Venice API (LLM provider) ✅

- ✅ Venice used for all LLM calls (text + streaming)
- ✅ Model selection: simple vs complex routing based on message length/intent
- ✅ Custom model override via UI settings panel
- ✅ Venice Audio used as TTS fallback when ElevenLabs unavailable

---

## 9) Data model (Supabase Postgres)

All tables live in the `learn_chinese` schema with RLS enforced.

### Core ✅

- ✅ `profiles` — user_id, goals, level, preferences (interests, minutesPerDay, model prefs), timezone, coach_style
- ✅ `sessions` — id, user_id, started_at, ended_at, mode, summary, metrics_json
- ✅ `messages` — id, session_id, role, content, created_at

### Memory ✅

- ✅ `memories` — id, user_id, type, key, value_json, confidence, created_at, updated_at, deleted_at (soft delete)
- ✅ `memory_events` — id, memory_id, action, reason, agent_run_id

### Learning 🔶

- ❌ `vocab_items` — table defined in schema but not actively written to (SRS cards used instead)
- ✅ `srs_cards` — id, user_id, type, prompt, answer, hints, tags, ease, interval, next_due_at, last_result
- ❌ `grammar_points` — table defined but not written to

### Observability ✅

- ✅ `agent_runs` — id, user_id, session_id, node_name, latency_ms, cost_estimate, created_at

### Storage ❌

- ❌ Supabase Storage bucket for audio snippets not configured

---

## 10) System architecture (v0.1) ✅

### Frontend ✅

- ✅ Next.js 16 App Router, React 19, TypeScript
- ✅ Tailwind CSS + shadcn/ui + Radix UI
- ✅ Mobile-first responsive chat UI
- ✅ PWA with service worker, install prompt, offline fallback page

### Backend — API routes ✅

- ✅ `POST /api/chat` — LangGraph streaming tutor
- ✅ `POST /api/session/start|end`
- ✅ `GET /api/srs/next` + `POST /api/srs/grade`
- ✅ `GET /api/memory/list` + `DELETE /api/memory/delete`
- ✅ `POST /api/voice/tts`
- ✅ `GET /api/profile` _(added)_
- ✅ `GET /api/progress/summary`
- ✅ `GET /api/progress/continuity` _(added)_
- ✅ `GET /api/progress/weekly-recap` _(added)_
- ✅ `GET /api/models`
- ✅ `POST /api/push/subscribe` + `POST /api/push/send`

### Agent runtime ✅

- ✅ LangGraph in TypeScript; Postgres-backed checkpointer; SSE streaming to UI

---

## 11) UX requirements (v0.1)

- ✅ Mobile-first chat UI
- ✅ "Today's session" CTA always visible on home page
- ✅ One-tap: "Save to review", "More examples", "Quiz me" in chat
- ✅ TTS play buttons on chat examples and review cards
- ✅ Dedicated Memory page (trust feature)
- ✅ Fast startup: skeleton rendered immediately; streaming starts quickly
- ❌ "Explain like I'm 5" toggle not implemented as a UI control

---

## 12) Quality, safety, and trust

- ✅ Pinyin + hanzi + meaning shown in all responses
- 🔶 Verify mode toggle in settings panel — affects temperature and prompting; active claim-tagging not yet implemented
- ✅ Memory transparency + deletion
- ❌ Cost guardrails — **not implemented**. No token budgets per session/day; no spend alerts. This is a gap to address before any production traffic.

**Next step for cost guardrails:** Add a `maxTokensPerSession` config in profile preferences; track cumulative token usage in `agent_runs`; return a soft warning when approaching limit.

---

## 13) Success metrics (v0.1)

Metrics defined but **not yet instrumented**:

- ❌ D1/D7 retention tracking
- ❌ % users completing 3+ sessions/week
- ❌ Avg session duration reported to analytics
- ✅ Review completion rate — gradeable in `srs_cards.last_result`
- ❌ Self-reported confidence surveys

**Next step:** Add a lightweight analytics event layer (can be as simple as structured `agent_runs` rows) to start capturing D1/D7 before user testing.

---

## 14) Delivery plan

| Milestone | Description | Status |
|-----------|-------------|--------|
| **M1** | Core chat tutor + sessions + basic persistence | ✅ Done |
| **M2** | Memory system + "remember/forget" UI | ✅ Done |
| **M3** | SRS generation + daily review loop | ✅ Done |
| **M4** | Audio TTS + simple speaking prompts | ✅ Done |
| **M5** | Weekly recap + insights | ✅ Done |
| **M6** | PWA + offline + push notifications | ✅ Done |
| **M7** | Live home page stats + dynamic continuity preview | ✅ Done |
| **M8** | Curriculum Planner Agent (real rolling plan) | ❌ Next |
| **M9** | Character card UI (radicals, mnemonic, common words) | ❌ Next |
| **M10** | Cost guardrails + token budgeting | ❌ Next |
| **M11** | Analytics instrumentation (D1/D7 retention) | ❌ Next |
| **M12** | vocab_items + grammar_points active usage | ❌ Backlog |
| **M13** | HSK curriculum alignment | ❌ Backlog |

---

## 15) Assumptions (explicit, so we can refine later)

- v0.1 is **text-first**; audio is TTS + optional simple mic input. ✅ Holds.
- We prioritize **relationship continuity** over perfect pedagogy coverage. ✅ Holds.
- We keep everything browser-based; native comes later. ✅ Holds.

---

## 16) Implementation plan (execution-ready)

### 16.1 Workstream A — Platform foundation ✅ COMPLETE

**Outcomes achieved:**
- ✅ Next.js App Router baseline (TypeScript, Tailwind, shadcn/ui)
- ✅ Supabase Auth + Postgres connection
- ✅ Shared API validation (`zod`), error handling, request correlation

**Remaining:**
- ❌ Standardised request correlation IDs not added
- ❌ Metrics hooks for token/cost tracking per request not added

### 16.2 Workstream B — Data model + security ✅ COMPLETE

**Outcomes achieved:**
- ✅ All v0.1 tables created with 7 Supabase migrations
- ✅ RLS policies enforce per-user access on all tables
- ✅ Indexes for sessions, srs_cards, memories

**Remaining:**
- ❌ Supabase Storage bucket for audio not configured
- ❌ `vocab_items` and `grammar_points` tables defined but not actively used

### 16.3 Workstream C — Agent runtime + chat loop ✅ COMPLETE

**Outcomes achieved:**
- ✅ All graph nodes implemented: `ContextLoader`, `MemoryRetrieve`, `Planner`, `TutorResponse`, `SRSExtract`, `MemoryWrite`, `SafetyQualityGate`, `PersistTelemetry`
- ✅ Postgres-backed `PostgresSaver` checkpointer (with `MemorySaver` fallback)
- ✅ `/api/chat` streaming SSE route + message persistence
- ✅ Structured response format enforced

**Remaining:**
- 🔶 `Planner` node is a stub — does not generate a real rolling plan

### 16.4 Workstream D — Onboarding + daily session UX ✅ COMPLETE

**Outcomes achieved:**
- ✅ Onboarding: goals, time/day, interests, level, timezone, coach style
- ✅ 7-day plan generated (as stub text) at onboarding completion
- ✅ "Today's session" screen with live continuity summary from real last session
- ✅ Session start/end APIs with telemetry

**Remaining:**
- 🔶 `planSnippet` in `/api/session/start` is still hardcoded text — needs Curriculum Planner Agent

### 16.5 Workstream E — Memory transparency + controls ✅ COMPLETE

**Outcomes achieved:**
- ✅ `/memory` page: view and delete all stored memories
- ✅ `/api/memory/list` and `/api/memory/delete`
- ✅ In-chat "remember this" and "forget this" commands
- ✅ `memory_events` log with reasons

### 16.6 Workstream F — SRS + quick practice loop ✅ COMPLETE

**Outcomes achieved:**
- ✅ SRS cards persisted after each chat response
- ✅ `/api/srs/next` and `/api/srs/grade` with SM-2 scheduling
- ✅ Quick practice: 5-card burst, TTS playback, character pinyin quiz
- ✅ Offline grade queue with background sync

**Remaining:**
- 🔶 Card hints are generic ("Recall context from your last session") rather than session-specific

### 16.7 Workstream G — Audio + pronunciation basics ✅ COMPLETE

**Outcomes achieved:**
- ✅ `/api/voice/tts` (ElevenLabs → Venice fallback)
- ✅ TTS play buttons in chat examples and review cards
- ✅ Web Speech API capture + heuristic feedback

**Remaining:**
- 🔶 Pronunciation feedback is surface-level (no phoneme/tone scoring)

### 16.8 Workstream H — Insights, reliability, and release ✅ MOSTLY COMPLETE

**Outcomes achieved:**
- ✅ Progress view: minutes, streak, vocab count, weak areas (dynamic), due cards
- ✅ Weekly recap: AI-generated via Venice (`/api/progress/weekly-recap`)
- ✅ Safety/uncertainty behaviours (verify mode in settings)
- ✅ Fallback behaviour for unavailable LangGraph or Venice

**Remaining:**
- ❌ Budget guardrails / token limits not implemented
- ❌ No auth/RLS automated test suite
- ❌ Analytics event instrumentation missing

---

## 17) API contracts

All routes require `Authorization: Bearer <supabase_access_token>` unless noted.

### POST `/api/session/start` ✅
**Input:** `{ mode: "daily" | "ask" | "quick" }`
**Output:** `{ sessionId, startedAt, planSnippet }`
**Note:** `planSnippet` is currently hardcoded. Will be dynamic once Curriculum Planner Agent is built.

### POST `/api/session/end` ✅
**Input:** `{ sessionId, durationSec, summary? }`
**Output:** `{ ok: true, metrics }`

### POST `/api/chat` ✅
**Input:** `{ sessionId, message, intent?, verifyMode?, modelSelectionMode?, customModel? }`
**Output:** SSE stream ending with `{ type: "final", structured: TutorStructuredResponse }`

### GET `/api/srs/next` ✅
**Input:** query `{ limit? }`
**Output:** `{ cards: SrsCard[] }`

### POST `/api/srs/grade` ✅
**Input:** `{ cardId, grade: "again" | "hard" | "good" | "easy" }`
**Output:** `{ nextDueAt, ease, interval }`

### GET `/api/memory/list` ✅
**Output:** `{ memories: MemoryItem[] }`

### DELETE `/api/memory/delete` ✅
**Input:** `{ memoryId }`
**Output:** `{ ok: true }`

### POST `/api/voice/tts` ✅
**Input:** `{ text, voiceId?, speed? }`
**Output:** `{ audioBase64, format }` or `{ audioUrl, format }`

### GET `/api/profile` ✅ _(added)_
**Output:** `{ profile: Profile | null }`

### GET `/api/progress/summary` ✅
**Output:** `{ summary: { totalSessions, totalMinutes, streakDays, vocabLearning, dueCards, weakAreas } }`

### GET `/api/progress/continuity` ✅ _(added)_
**Output:** `{ continuity: { sessionDate, when, summary, mode } | null }`

### GET `/api/progress/weekly-recap` ✅ _(added)_
**Output:** `{ recap: string }` — AI-generated or static fallback

### GET `/api/models` ✅
**Output:** `{ models: VeniceModel[] }`

### POST `/api/push/subscribe` ✅
**Input:** `{ subscription: PushSubscription }`
**Output:** `{ ok: true }`

---

## 18) Acceptance checklist (release gate)

### Product

- ✅ User can complete onboarding in under 2 minutes.
- ✅ Daily session provides continuity from prior day (real last-session data).
- ✅ Every completed session generates review items.
- ✅ Quick practice works in under 2 minutes.

### Trust & safety

- ✅ User can view and delete long-term memories.
- 🔶 Tutor marks uncertainty — verify mode lowers temperature and adjusts prompting; explicit "I'm not sure" claim-tagging not yet enforced.
- ✅ "Verify mode" toggle in settings influences response behaviour.

### Performance

- ✅ Chat UI skeleton appears in <1 second.
- ✅ Streaming begins promptly after message submit.
- ✅ SRS due queue query responds within acceptable latency.

### Security

- ✅ RLS blocks cross-user reads/writes.
- ✅ Sensitive routes require authenticated user (Bearer token).
- ✅ Memory delete is auditable via `memory_events`.

---

## 19) Known gaps & recommended next work

Priority order for the next development session:

### P0 — Before production traffic
1. **Cost guardrails** — add per-session token budget; track spend in `agent_runs`; soft-cap with user warning. No spend controls exist today.
2. **Automated RLS tests** — verify cross-user isolation doesn't regress. Currently untested.

### P1 — Core experience completeness
3. **Curriculum Planner Agent** — make `Planner` node generate a real 7-day rolling plan using profile + session summaries + weak areas. Return it in `planSnippet`.
4. **Character card UI** — dedicated `/characters` page: structured card with hanzi, pinyin, radical breakdown, mnemonic, and 3 common words. Stroke-order animation is post-v0.1.
5. **SRS hints — session-specific** — replace generic "Recall context from your last session" hint with the actual sentence from which the card was generated.

### P2 — Analytics & growth
6. **Analytics instrumentation** — D1/D7 retention events; session duration reporting; review completion rate. A simple structured log in `agent_runs` is enough to start.
7. **vocab_items active usage** — write vocab to dedicated table alongside SRS cards so mastered vs learning split becomes possible.
8. **"Mastered" vocab tier** — cards with ease ≥ 3.0 and interval ≥ 21 days considered mastered; surface this on progress page.

### P3 — Backlog
9. HSK curriculum alignment
10. Email/webhook push notifications (n8n)
11. Grammar points active usage
12. Pronunciation scoring (phoneme/tone heuristics)
13. Supabase Storage bucket for audio caching server-side
