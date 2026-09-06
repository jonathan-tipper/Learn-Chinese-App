# Learn Chinese App (v0.2)

An agentic, personalised Mandarin coach. v0.2 turns the v0.1 scaffold into a coach that
actually remembers you, plans your week, and streams its answers:

- **Streaming tutor with real conversation memory** — the answer streams token by token
  while the structured lesson (key points, examples, exercise, review items) is still being
  generated from the same model call. The tutor now sees the full conversation so far, your
  coach style, level, goals, long-term memories, weak areas, review load and today's plan.
- **Memory Curator agent** — after each turn a cheap model call extracts durable facts about
  you (life context, goals, struggles) into long-term memory. No more `remember x: y`
  required (though it still works). Everything remains visible and deletable on `/memory`.
- **Rolling 7-day Curriculum Planner** — a persisted weekly plan built from your profile,
  session summaries, weak areas and due cards. Today's item drives the chat focus, shows on
  Home, and is ticked off when you finish a session. `/plan` shows the whole week.
- **Character library** — `/characters` lists every hanzi you have met and builds a card on
  demand: per-character radical, components, mnemonic, common words, example sentence and a
  usage tip. Cards are AI-generated once and cached for everyone.
- **Sessions that count** — sessions are closed automatically when abandoned, durations come
  from real activity, and a model-written summary feeds continuity and the planner. Streaks
  and minutes on Home/Progress now reflect what you actually did.
- **Answer-safe review hints** — new cards carry a cloze of the sentence the word appeared in
  ("Fill the gap: 请给我一杯＿＿。") and the topic it came up under; legacy malformed cards are
  repaired on read.
- **One LLM client** (`server/llm/venice.ts`) with streaming, real token usage, per-model cost
  estimates, and Venice-specific fixes (thinking disabled by default, no injected system
  prompt, recovery when answers land in `reasoning_content`).

The PRD-defined v0.1 scope is still all here:

- Next.js App Router web foundation
- API routes for sessions, onboarding, chat, SRS, memory, progress, and TTS
- Storage adapter with Supabase persistence (fallback to in-memory when env is missing)
- Graph runtime with memory/profile/session context loading
- Venice LLM integration for all tutor text reasoning
- Supabase SQL migrations with RLS policy drafts
- UI pages for onboarding, chat, memory transparency, review, and progress

## Local run

```bash
npm install
npm run dev
```

Then open the local URL printed by Next.js.

## Environment

Copy `.env.example` to `.env.local` and fill the values you need:

- Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_DB_SCHEMA` (optional, defaults to `learn_chinese`)
  - `ALLOW_DEV_AUTH_FALLBACK` (optional, defaults to `true` outside production and `false` in production)
  - `LANGGRAPH_POSTGRES_URL` (optional, for LangGraph checkpoint persistence in Postgres)
- Venice (required):
  - `VENICE_API_KEY`
  - `VENICE_BASE_URL`
  - `VENICE_SIMPLE_MODEL`
  - `VENICE_COMPLEX_MODEL`
  - `VENICE_TTS_MODEL` (audio fallback)
  - `VENICE_TTS_VOICE` (audio fallback)
  - `SESSION_BUDGET_ENABLED` (defaults to `true`)
  - `SESSION_BUDGET_MAX_TOKENS` (defaults to `12000` estimated tokens per session)
  - `SESSION_BUDGET_WARNING_RATIO` (defaults to `0.8`)
  - `SESSION_BUDGET_ESTIMATED_USD_PER_1K_TOKENS` (defaults to `0.001`; an estimate, not billing data)
- ElevenLabs (primary TTS provider):
  - `ELEVENLABS_API_KEY`
  - `ELEVENLABS_VOICE_ID`
  - `ELEVENLABS_MODEL_ID`

## Authentication setup

- Login page: `/login`
- Providers supported: Supabase OAuth (`google`, `github`) and Supabase email/password.
- In Supabase dashboard, enable the providers you want under Authentication > Providers.
- Add your deployed URL and local URL (`http://localhost:3000`) to Supabase Authentication URL allow list.

## Database migrations

Migrations live in `supabase/migrations`. Apply them in order with the Supabase CLI
(`supabase db push`) or by pasting them into the SQL editor. Everything degrades gracefully
when a table lags the code (a `[store] … unavailable` warning is logged once), but these are
required for the v0.2 features to persist:

| Migration | Purpose |
|-----------|---------|
| `20260301000001_cleanup_malformed_srs_cards.sql` | Repairs (rather than deletes) pre-fix review cards |
| `20260711231000_agent_run_usage.sql` | `agent_runs.provider` / `tokens` for spend tracking |
| `20260712230000_learning_events.sql` | First-party retention events |
| `20260906000001_learning_plans.sql` | Persisted 7-day curriculum plans |
| `20260906000002_character_cards.sql` | Shared cache of generated character cards |
| `20260906000003_close_abandoned_sessions.sql` | One-off: closes historical sessions that were never ended |

## Agent graph

`POST /api/chat` runs a LangGraph app (`server/agents/langgraphRuntime.ts`):

```
START → contextLoader → planner → tutorResponse ─┬→ learningPersist ─┬→ END
                                                 └→ memoryCurator ───┘
```

- `contextLoader`: profile, long-term memories, conversation history, weak areas, due cards
- `planner`: today's focus from the persisted plan (`server/agents/curriculumPlanner.ts`)
- `tutorResponse`: streams the answer through a per-run sink, then emits the structured payload
- `learningPersist`: SRS cards with cloze hints and topic tags, vocab items, grammar points
- `memoryCurator`: extracts durable learner facts (`server/agents/memoryCurator.ts`)

Session start closes abandoned sessions (`server/agents/sessionLifecycle.ts`); session end
computes the real duration, writes a model summary, and marks today's plan item complete.

SSE events from `/api/chat`: `delta` (answer text), `structured` (full lesson payload),
`final` (cards created, memories saved, model, budget), `error`.

## Implemented API surface

- `POST /api/onboarding/save` (also generates the first weekly plan)
- `POST /api/session/start` / `POST /api/session/end`
- `POST /api/chat` (SSE)
- `GET /api/plan` (returns today's item; generates when missing or expired) / `POST /api/plan` (replan)
- `GET /api/characters` (studied entries) / `GET /api/characters/{entry}` (card, `?refresh=1` to regenerate)
- `GET /api/srs/next` / `POST /api/srs/grade`
- `GET /api/memory/list` / `DELETE /api/memory/delete`
- `GET /api/progress/summary` / `GET /api/progress/continuity` / `GET /api/progress/weekly-recap`
- `POST /api/voice/tts`
- `GET /api/models`

## Current v0.1 behavior

- Chat supports memory commands:
  - `remember <key>: <value>`
  - `forget <key>`
- Chat UI includes one-tap actions, each handled by the model rather than canned text:
  - Examples, Quiz me, Simpler (explain like I'm five), Roleplay
  - Save to review
- Verify mode can be toggled in chat to append explicit uncertainty guidance.
- Home page shows an evening streak-safe nudge if no session was completed today.
- Chat route streams chunked SSE deltas + final structured payload.
- Chat/onboarding model pickers load options dynamically from Venice `/models` via `GET /api/models`.
- SRS cards are generated from structured tutor output with dedupe + shared scheduling logic.
- TTS uses ElevenLabs first, then falls back to Venice audio if ElevenLabs is not configured.
- Review page includes:
  - due-card SRS burst
  - optional browser speech input prompt
  - character mini-practice (`type pinyin -> check`)

## Quality checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Model choice

All text calls go through Venice. Measured in September 2026 for a ~600-token structured tutor
reply with thinking disabled: `qwen3-235b-a22b-instruct-2507` ≈14s and cheapest with reliable
JSON; `zai-org-glm-4.7` ≈14s; `zai-org-glm-5` ≈22s with the strongest explanations. Reasoning
is disabled for every tutoring call because it doubled latency and often returned the answer in
`reasoning_content`. Swap models with `VENICE_SIMPLE_MODEL` / `VENICE_COMPLEX_MODEL` or per user
in onboarding; pricing for cost estimates lives in `server/llm/venice.ts`.

## Notes

- API auth validates bearer tokens via Supabase Auth. Header-based fallback (`x-user-id`/demo user) is only enabled when `ALLOW_DEV_AUTH_FALLBACK=true`.
- For local UI work without signing in, run with `NEXT_PUBLIC_DEV_AUTH_BYPASS=1` (ignored in production builds); the UI then uses the API's dev fallback demo user. The `.claude/launch.json` entry "Next.js Dev (auth bypass)" does this.
- Supabase storage is automatically used when required env vars are present.
- If you use a shared Supabase project, add `learn_chinese` (or your configured `SUPABASE_DB_SCHEMA`) to API Exposed Schemas in Supabase settings.
