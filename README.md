# Learn Chinese App (v0.1)

This repository includes a working v0.1 implementation for the PRD-defined scope:

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

## Implemented API surface (scaffold)

- `POST /api/onboarding/save`
- `POST /api/session/start`
- `POST /api/session/end`
- `POST /api/chat` (SSE)
- `GET /api/srs/next`
- `POST /api/srs/grade`
- `GET /api/memory/list`
- `DELETE /api/memory/delete`
- `GET /api/progress/summary`
- `POST /api/voice/tts`
- `GET /api/models`

## Current v0.1 behavior

- Chat supports memory commands:
  - `remember <key>: <value>`
  - `forget <key>`
- Chat UI includes one-tap actions:
  - More examples
  - Quiz me
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

## Notes

- API auth validates bearer tokens via Supabase Auth. Header-based fallback (`x-user-id`/demo user) is only enabled when `ALLOW_DEV_AUTH_FALLBACK=true`.
- Supabase storage is automatically used when required env vars are present.
- If you use a shared Supabase project, add `learn_chinese` (or your configured `SUPABASE_DB_SCHEMA`) to API Exposed Schemas in Supabase settings.
