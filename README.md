# Learn Chinese App (v0.1 scaffold)

This repository includes an implementation scaffold for the PRD-defined v0.1 scope:

- Next.js App Router web foundation
- API routes for sessions, onboarding, chat, SRS, memory, progress, and TTS
- In-memory development store to exercise flows without external dependencies
- LangGraph-compatible tutor runtime placeholder (`server/agents/graph.ts`)
- Supabase SQL migration with table schema + RLS policy drafts
- UI pages for onboarding, chat, memory transparency, review, and progress

## Local run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

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

## Current v0.1 behavior in scaffold

- Chat supports memory commands:
  - `remember <key>: <value>`
  - `forget <key>`
- Chat UI includes one-tap actions:
  - More examples
  - Quiz me
  - Save to review
- Verify mode can be toggled in chat to append explicit uncertainty guidance.
- Home page shows an evening streak-safe nudge if no session was completed today.
- Review page includes:
  - due-card SRS burst
  - optional browser speech input prompt
  - character mini-practice (`type pinyin -> check`)

## Notes

- API authentication currently uses `x-user-id` header fallback to `demo-user` for local development.
- `/api/voice/tts` is a mock endpoint placeholder in this scaffold.
- Replace in-memory storage with Supabase repository layer in production.
