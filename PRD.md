# PRD — “Learn Chinese” (Agentic, Personalized Mandarin Coach) — v0.1 (Web)

## 1) Product vision

A **relationship-based Mandarin coach** that learns the user’s life, goals, and routines, then **proactively teaches Mandarin in-context** through daily conversations, micro-lessons, and review loops—across **mobile + desktop browser** (PWA-ready).

Unlike dictionary/flashcard apps, the “superpower” is:

- **Contextual teaching** (your real life → your Mandarin)
- **Agentic proactivity** (nudges, routines, adaptive plan)
- **Memory + relationship** (it remembers what matters and builds continuity)

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

## 3) Target users & primary persona

**Primary persona:** busy professional who wants Mandarin for real-life use (work, travel, culture), prefers conversational learning, values personalization and momentum over rigid curriculum.

Secondary personas:

- Traveler prepping for a trip
- Heritage learner rebuilding confidence
- Beginner who needs high guidance + encouragement

## 4) Core user journeys (v0.1)

### A) “Daily coach session” (primary journey)

1. User opens app → sees “Today’s session”
2. Coach greets with continuity: “Yesterday we practiced ordering coffee…”
3. 1–2 minute warm-up (review)
4. 5–10 minute guided conversation + micro-lesson
5. Auto-generated review set (SRS) + “one sentence to use today”
6. User finishes → progress updated + plan adjusted

### B) “Ask anything” (tutor mode)

- Q&A on grammar, etymology, usage, example sentences, cultural notes
- “Explain like I’m 5” toggles
- “Give me 10 examples in my domain” (work, family, hobbies)

### C) “Quick practice” (2 minutes)

- 5-card SRS burst
- 1 speaking prompt + TTS playback
- 1 character mini-practice

## 5) Product scope & features (v0.1)

### 5.1 Onboarding & baseline assessment

- Minimal onboarding: goals, time/day, interests, current level (self-report)
- Optional quick diagnostic: recognition + simple production
- User picks “coach vibe”: strict / friendly / playful / concise

**Acceptance:** onboarding < 2 minutes, generates a first-week plan.

### 5.2 Conversational Mandarin Coach (core)

- Chat interface (text-first)
- Coach can:
  - Teach vocabulary/grammar in context
  - Provide pinyin + hanzi + English
  - Offer corrections and “native-like alternatives”
  - Keep a “running lesson thread” per session

**Important:** Coach responses are structured (not walls of text):

- 1–2 key points
- 2–5 examples
- 1 micro-exercise
- “Save to review” actions

### 5.3 Proactive routine + nudges (lightweight in v0.1)

- “Streak-safe” nudges: if no session by evening, show a gentle prompt in-app
- Optional email push later; for v0.1 keep it in-app + optional n8n webhook hook

### 5.4 Memory & relationship system (core differentiator)

Two layers:

**Short-term memory (thread/session continuity)**  
Use LangGraph “thread” persistence + checkpointing so sessions pick up naturally. LangGraph supports built-in persistence via checkpointers, enabling durable state per thread.

**Long-term memory (user model)**

- Store stable facts + preferences + goals + recurring topics:
  - Interests (work themes, hobbies)
  - Learning preferences (“give me fewer explanations, more drills”)
  - Personal vocabulary bank (“words I keep needing”)
- Memory is **editable** (user can view/remove items)

**Acceptance:** user can see a “What I remember about you” page and delete items.

### 5.5 Spaced repetition that’s generated from your life

- Every session yields:
  - 5–20 “review items” (vocab, sentence patterns, characters)
- Daily review queue (SRS)
- Each review item has:
  - prompt, answer, hints, audio, tags (topic, grammar), next_due, ease

### 5.6 Audio (v0.1)

- Text-to-speech via **ElevenLabs** for:
  - Example sentences
  - Dialogue playback
- Optional: browser speech input (Web Speech API) for simple speaking practice
- “Repeat after me” loop with basic feedback (string/phoneme heuristics first)

### 5.7 Writing / characters (v0.1 “basic”)

- Character cards:
  - hanzi, pinyin, meaning, radicals, mnemonic, common words
- Simple practice:
  - “type pinyin → show hanzi”
  - “recognition quiz”
    *(Stroke-order animation can come later.)*

### 5.8 Progress & insights

- Daily minutes learned
- Streak
- Vocabulary mastered / learning
- Weak areas (tones, measure words, sentence order)
- “Your week in Mandarin” recap (auto-generated)

## 6) Agentic architecture (LangChain + LangGraph)

### 6.1 Why LangGraph here

You want a **stateful, long-running learning relationship**, not a single prompt. LangGraph is explicitly designed for **stateful agent orchestration** and supports persistence/checkpointing for durable state.

### 6.2 Agents (v0.1)

Implement as a **LangGraph graph** with specialized nodes/agents:

1. **Conversation Tutor Agent**
   - Main dialogue, teaching, correction
   - Uses retrieved memory + today’s plan
2. **Curriculum Planner Agent**
   - Maintains a rolling plan (next 7 days)
   - Chooses themes based on user goals + past performance
3. **Memory Curator Agent**
   - Decides what to store long-term (and what not to)
   - Writes structured “memories” to Supabase
   - Supports “forget this” commands
4. **SRS Builder Agent**
   - Converts conversation/lesson into review items
   - Schedules due dates (SM-2-ish heuristic)
5. **Pronunciation Coach Agent** (lightweight v0.1)
   - Generates minimal pairs + tone drills
   - Uses TTS and simple scoring
6. **Safety/Quality Gate**
   - Ensures responses remain appropriate, accurate, and not overconfident
   - Adds “verify” behaviors for uncertain claims

### 6.3 Graph flow (conceptual)

**Input → Route → Retrieve → Teach → Generate practice → Update memory → Persist telemetry**

Example:

- `UserMessage`
- `ContextLoader (today + user profile + last session summary)`
- `MemoryRetrieve (long-term + “recent” items)`
- `Planner (optional, if plan needs updating)`
- `TutorResponse`
- `SRSExtract`
- `MemoryWrite`
- `Persist + Return`

LangChain supports runtime-aware prompting and dynamic prompt middleware patterns; you can inject session context cleanly.

### 6.4 Persistence

- **LangGraph checkpointer** persisted to Postgres (Supabase) to keep “thread” continuity.
- Long-term memory is your own schema (below).

## 7) A2A (agent-to-agent) — how it fits (v0.1 lightly)

If you want agents running as separate services (or later, a multi-agent ecosystem), **A2A** can standardize how they communicate. It’s positioned as an open protocol for agent interoperability; Google announced it in April 2025.  
**v0.1 recommendation:** keep agents in one LangGraph app; add A2A as an interface layer later.

## 8) Venice API (LLM provider)

- Use Venice for LLM calls (text + streaming). Venice provides REST + streaming interfaces and emphasizes privacy/no retention in their positioning/docs.
- **Important product note:** even if the provider is permissive, your app should still implement its own safety/quality constraints (especially for learning content and user data).

## 9) Data model (Supabase Postgres) — suggested tables

### Core

- `profiles` (user_id, goals, level, preferences, timezone, coach_style)
- `sessions` (id, user_id, started_at, ended_at, mode, summary, metrics_json)
- `messages` (id, session_id, role, content, tokens, created_at)

### Memory

- `memories` (id, user_id, type, key, value_json, confidence, source, created_at, updated_at, deleted_at)
- `memory_events` (id, memory_id, action, reason, agent_run_id)

### Learning

- `vocab_items` (id, user_id, hanzi, pinyin, english, tags, source_session_id)
- `srs_cards` (id, user_id, type, prompt, answer, hints, ease, interval, next_due_at, last_result)
- `grammar_points` (id, user_id, title, explanation, examples_json)

### Observability

- `agent_runs` (id, user_id, session_id, graph_name, node_name, input_hash, output_hash, cost_estimate, latency_ms, created_at)

**Storage (Supabase Storage):** audio snippets, optional user uploads.

**Security:** Supabase Auth + RLS on all user-owned tables.

## 10) System architecture (v0.1)

### Frontend

- Next.js App Router
- React + Tailwind + shadcn/ui
- Responsive “chat-first” UI
- PWA-ready (service worker optional later)

### Backend (Next.js serverless routes)

- `/api/chat` → runs LangGraph, streams response
- `/api/session/start|end`
- `/api/srs/next` + `/api/srs/grade`
- `/api/memory/list|delete`
- `/api/voice/tts` (ElevenLabs)

### Agent runtime

- **LangGraph in TypeScript/Node** (fits Next.js)
- Postgres-backed persistence + memory store
- Streaming tokens to UI

## 11) UX requirements (v0.1)

- Mobile-first chat UI
- “Today’s session” CTA always visible
- One-tap: “Save to review”, “More examples”, “Quiz me”
- A dedicated **Memory page** (trust feature)
- Fast startup: <1s to show UI skeleton, streaming response begins quickly

## 12) Quality, safety, and trust

- “Show pinyin + hanzi + meaning” defaults; minimize hallucinated etymology by:
  - tagging uncertain claims (“not sure”)
  - offering “verify” mode in advanced settings
- Memory transparency + deletion
- Cost guardrails: token budgets per day/session; fallbacks if model is slow

## 13) Success metrics (v0.1)

- D1 retention, D7 retention
- % users completing 3+ sessions/week
- Avg session duration (target 5–15 mins)
- Review completion rate
- Self-reported confidence improvement weekly

## 14) Delivery plan (suggested)

- **Milestone 1:** Core chat tutor + sessions + basic persistence
- **Milestone 2:** Memory system + “remember/forget” UI
- **Milestone 3:** SRS generation + daily review loop
- **Milestone 4:** Audio TTS + simple speaking prompts
- **Milestone 5:** Weekly recap + insights

## 15) Assumptions (explicit, so we can refine later)

- v0.1 is **text-first**; audio is TTS + optional simple mic input.
- We prioritize **relationship continuity** over perfect pedagogy coverage.
- We keep everything browser-based; native comes later.

## 16) Implementation plan (execution-ready)

### 16.1 Workstream A — Platform foundation (Week 1)

**Outcomes**

- Working Next.js App Router baseline (TypeScript, Tailwind, shadcn/ui)
- Supabase Auth + Postgres connection wired
- Shared API validation and logging

**Tasks**

1. Create app structure for `app/`, `components/`, `lib/`, `server/agents/`, `server/db/`, and `server/api/`.
2. Add environment management for Supabase, Venice, ElevenLabs, and feature flags.
3. Define TypeScript models and zod schemas for `Profile`, `Session`, `Message`, `Memory`, `SrsCard`, `AgentRun`.
4. Add standardized error handling and request correlation IDs.
5. Add metrics hooks for latency and token/cost tracking.

**Exit criteria**

- Developer can run app locally and authenticate.
- Health endpoint + one protected API route verified.

### 16.2 Workstream B — Data model + security (Week 1–2)

**Outcomes**

- All v0.1 tables created and indexed
- RLS policies enforce strict per-user access

**Tasks**

1. Create SQL migrations for all tables in section 9.
2. Add indexes for key queries (recent sessions, due SRS cards, memory listing).
3. Implement RLS policies for each user-owned table.
4. Add Supabase Storage bucket for audio with owner-based policies.

**Exit criteria**

- Unauthorized reads/writes blocked by policy tests.
- DB migration and rollback run successfully.

### 16.3 Workstream C — Agent runtime + chat loop (Week 2–3)

**Outcomes**

- LangGraph-powered streaming tutor experience with session continuity

**Tasks**

1. Implement graph nodes: `ContextLoader`, `MemoryRetrieve`, `Planner`, `TutorResponse`, `SRSExtract`, `MemoryWrite`, `SafetyQualityGate`, `PersistTelemetry`.
2. Configure Postgres-backed checkpointer for per-thread continuity.
3. Implement `/api/chat` streaming route and message persistence.
4. Enforce structured response format:
   - 1–2 key points
   - 2–5 examples
   - 1 micro-exercise
   - explicit “save to review” data

**Exit criteria**

- Returning user resumes context from prior session.
- Chat response streams in under target startup latency in normal conditions.

### 16.4 Workstream D — Onboarding + daily session UX (Week 3)

**Outcomes**

- Users can onboard in <2 minutes and start a guided daily session

**Tasks**

1. Build onboarding flow for goals, time/day, interests, level, timezone, coach style.
2. Generate initial 7-day plan at onboarding completion.
3. Build “Today’s session” screen with continuity summary.
4. Implement session start/end APIs with telemetry capture.

**Exit criteria**

- First-time user reaches first tutor turn in <2 minutes from signup.

### 16.5 Workstream E — Memory transparency + controls (Week 4)

**Outcomes**

- Trust feature complete: users can view and delete memories

**Tasks**

1. Build “What I remember about you” page.
2. Implement `/api/memory/list` and `/api/memory/delete`.
3. Support in-chat commands for “remember this” and “forget this”.
4. Log memory change reasons in `memory_events`.

**Exit criteria**

- User can remove any memory item and confirm it no longer influences responses.

### 16.6 Workstream F — SRS + quick practice loop (Week 4–5)

**Outcomes**

- Review system generated from real sessions, with daily due queue

**Tasks**

1. Persist SRS cards generated by `SRSExtract` after each session.
2. Implement `/api/srs/next` and `/api/srs/grade` with SM-2-ish scheduling.
3. Build “Quick practice” flow:
   - 5-card burst
   - one speaking prompt with TTS playback
   - one character recognition mini-practice

**Exit criteria**

- Session completion produces new review cards.
- Daily review queue consistently returns due items.

### 16.7 Workstream G — Audio + pronunciation basics (Week 5)

**Outcomes**

- TTS playback works across chat and review items
- Lightweight speaking feedback available where browser supports mic

**Tasks**

1. Implement `/api/voice/tts` (ElevenLabs proxy).
2. Add reusable audio player and playback controls.
3. Add optional Web Speech capture + heuristic feedback mode.

**Exit criteria**

- User can play sentence audio from chat and review cards.

### 16.8 Workstream H — Insights, reliability, and release (Week 6)

**Outcomes**

- v0.1 readiness with progress tracking and operational guardrails

**Tasks**

1. Build progress view (minutes, streak, vocab status, weak areas).
2. Generate weekly recap text (“Your week in Mandarin”).
3. Enforce safety and uncertainty behaviors in tutor output.
4. Add budget guardrails and fallback behavior for slow model responses.
5. Finalize launch checklist for auth/RLS, memory deletion, and API resilience.

**Exit criteria**

- All high-priority acceptance criteria pass.
- No P0 security/privacy gaps remain.

## 17) API contracts (v0.1 draft)

### POST `/api/session/start`

**Input:** `{ mode: "daily" | "ask" | "quick" }`  
**Output:** `{ sessionId, startedAt, planSnippet }`

### POST `/api/session/end`

**Input:** `{ sessionId, durationSec, summary? }`  
**Output:** `{ ok: true, metrics }`

### POST `/api/chat`

**Input:** `{ sessionId, message, intent?, saveToReview? }`  
**Output:** streaming tutor payload + final structured JSON envelope

### GET `/api/srs/next`

**Input:** query `{ limit? }`  
**Output:** `{ cards: SrsCard[] }`

### POST `/api/srs/grade`

**Input:** `{ cardId, grade: "again" | "hard" | "good" | "easy" }`  
**Output:** `{ nextDueAt, ease, interval }`

### GET `/api/memory/list`

**Output:** `{ memories: MemoryItem[] }`

### DELETE `/api/memory/delete`

**Input:** `{ memoryId }`  
**Output:** `{ ok: true }`

### POST `/api/voice/tts`

**Input:** `{ text, voiceId?, speed? }`  
**Output:** `{ audioUrl | audioBase64, format }`

## 18) Acceptance checklist (release gate)

### Product

- User can complete onboarding in under 2 minutes.
- Daily session provides continuity from prior day.
- Every completed session generates review items.
- Quick practice works in under 2 minutes.

### Trust & safety

- User can view and delete long-term memories.
- Tutor marks uncertainty instead of fabricating facts.
- “Verify mode” toggle influences response behavior.

### Performance

- Chat UI skeleton appears in <1 second on typical mobile network.
- Streaming begins promptly after message submit.
- SRS due queue query responds within acceptable latency.

### Security

- RLS blocks cross-user reads/writes.
- Sensitive routes require authenticated user.
- Memory delete is auditable via `memory_events`.
