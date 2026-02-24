# PWA Conversion Plan — Learn Chinese App

## Overview

This plan converts the existing Next.js 16 (App Router) Learn Chinese app into a fully installable Progressive Web App. All existing features, API routes, and UI are left completely untouched. Every change is either a new file or a purely additive modification (adding metadata/config, not removing or altering existing logic).

---

## Current Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth / DB | Supabase |
| AI | LangChain + LangGraph |
| Voice | TTS API route (`/api/voice/tts`) |
| SRS | Spaced-repetition API routes |

---

## What Makes a Valid PWA

To be installable (Chrome, Edge, Safari, Firefox), an app needs:

1. A served **Web App Manifest** linked in `<head>`
2. A registered **Service Worker**
3. Served over **HTTPS** (satisfied in production)
4. At least a **192 × 192** icon declared in the manifest

---

## Chosen Implementation Approach

**Package: `@ducanh2912/next-pwa`**

This is the most actively maintained Next.js PWA wrapper built on Workbox. It:
- Integrates with Next.js App Router out of the box
- Auto-generates and registers the service worker
- Handles route-based caching strategies with minimal config
- Supports Workbox `runtimeCaching` for fine-grained control

---

## Useful PWA Features for This App

| Feature | Why It Matters Here |
|---------|-------------------|
| **Install prompt** | One-tap install on mobile & desktop; core PWA goal |
| **Offline shell** | Static pages (home, progress, review UI) load offline |
| **TTS audio caching** | Cache fetched voice audio so replays work offline |
| **Push notifications** | Evening streak reminders (app already has the evening-nudge card) |
| **Background sync** | Queue SRS grades offline, flush when back online |
| **Standalone display** | Hides browser chrome; feels like a native app |
| **Splash screen** | Native-style launch screen on iOS/Android |
| **Web Share API** | Share progress or streak milestones |

---

## Step-by-Step Implementation Plan

### Step 1 — Install PWA Package

```bash
npm install @ducanh2912/next-pwa
```

No existing dependency is changed or removed.

---

### Step 2 — Create App Icons

**Location:** `public/icons/`

Required sizes and purposes:

| File | Size | Purpose |
|------|------|---------|
| `icon-192.png` | 192 × 192 | Standard manifest icon |
| `icon-512.png` | 512 × 512 | Standard manifest icon (splash) |
| `icon-maskable-192.png` | 192 × 192 | Android adaptive icon (safe-zone masked) |
| `icon-maskable-512.png` | 512 × 512 | Android adaptive icon (full bleed) |
| `apple-touch-icon.png` | 180 × 180 | iOS home screen icon |
| `favicon.ico` | 32 × 32 | Browser tab favicon |

**Design:** Use the app's jade/green color palette (`#2d7d6a` background) with a Chinese character 学 (xué, "to learn") centered in white. Maskable icons add 10% safe-zone padding around the character.

These are created as SVGs first, then exported to PNG via a build script or a one-time generation step.

---

### Step 3 — Create Web App Manifest

**File:** `public/manifest.json`

```json
{
  "name": "Learn Chinese — Mandarin Coach",
  "short_name": "Mandarin Coach",
  "description": "Agentic, relationship-based Mandarin learning coach powered by AI",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#2d7d6a",
  "orientation": "portrait-primary",
  "lang": "en",
  "categories": ["education"],
  "icons": [
    { "src": "/icons/icon-192.png",          "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png",          "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    {
      "name": "Daily Session",
      "short_name": "Chat",
      "url": "/chat",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    },
    {
      "name": "Quick Practice",
      "short_name": "Review",
      "url": "/review",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ],
  "screenshots": []
}
```

**Shortcuts** add long-press quick actions on Android home screen icons.

---

### Step 4 — Update `next.config.mjs`

Wrap the existing (empty) config with the PWA plugin. The existing `nextConfig = {}` is preserved exactly.

```js
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",              // service worker output location
  cacheOnFrontEndNav: true,    // cache navigations
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,        // reload stale pages when connection returns
  swcMinify: true,
  disable: process.env.NODE_ENV === "development", // disable SW in dev
  workboxOptions: {
    disableDevLogs: true,
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {};          // ← original config, untouched

export default withPWA(nextConfig);
```

---

### Step 5 — Update `app/layout.tsx` Metadata (Additive Only)

Add PWA-required tags to the existing `<head>` block. No existing lines are removed or changed.

Additions:
- `<link rel="manifest" href="/manifest.json" />`
- `<meta name="theme-color" content="#2d7d6a" />`
- `<meta name="apple-mobile-web-app-capable" content="yes" />`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default" />`
- `<meta name="apple-mobile-web-app-title" content="Mandarin Coach" />`
- `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />`
- Viewport meta with `viewport-fit=cover` for iPhone notch support

Also update the Next.js `metadata` export to include `themeColor` and `viewport` (Next.js 13+ way to inject these properly without duplication).

---

### Step 6 — Create Offline Fallback Page

**File:** `app/offline/page.tsx` (new file, no existing files touched)

A simple, styled page shown when the user navigates to a page not in the cache while offline. Uses existing UI components (Card, Button) so it matches the app's design language automatically.

Content:
- "You're offline" message in Chinese (离线 / Lí xiàn) + English
- Explanation that AI chat needs a connection
- "Try quick practice" button (review page is cached)
- Auto-reload when connection returns

---

### Step 7 — Service Worker Caching Strategies

Configured inside the `next-pwa` `workboxOptions.runtimeCaching` array in `next.config.mjs`. This controls what gets cached and how.

| Resource | Strategy | Rationale |
|----------|----------|-----------|
| Static Next.js assets (`/_next/static/**`) | **Cache First** (auto by next-pwa) | Immutable build artifacts |
| Google Fonts CSS | **Stale While Revalidate** | Update fonts in background |
| Google Fonts files | **Cache First**, 365-day TTL | Font files never change |
| TTS audio (`/api/voice/tts`) | **Cache First**, LRU 50 entries, 30-day TTL | Replay vocab audio offline |
| Pages (`/`, `/review`, `/progress`, `/memory`) | **Network First**, 60s timeout | Fresh data preferred, fallback to cache |
| AI API routes (`/api/chat`, `/api/session/**`) | **Network Only** | Always requires live connection |
| SRS routes (`/api/srs/**`) | **Network First** | Online preferred; background-sync queues when offline |

---

### Step 8 — Push Notifications (Study Reminders)

The app already shows an evening nudge card on the home page. This step makes it work as a real push notification so users get reminded even when the app is closed.

#### 8a — VAPID Key Setup

Generate a VAPID key pair (one-time, stored as environment variables):

```bash
npx web-push generate-vapid-keys
```

Add to `.env.local` (and production environment):
```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<public_key>
VAPID_PRIVATE_KEY=<private_key>
VAPID_SUBJECT=mailto:admin@example.com
```

#### 8b — Supabase Table

New table `push_subscriptions` (migration file added to `supabase/`):

```sql
create table push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;
create policy "users manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id);
```

#### 8c — New API Routes (no existing routes touched)

- `app/api/push/subscribe/route.ts` — Save a push subscription for the authenticated user
- `app/api/push/send/route.ts` — Send a push notification (server-side, callable from a cron job or Supabase Edge Function)

#### 8d — Frontend Component (Additive)

**File:** `components/notification-permission.tsx`

A small, unobtrusive banner that appears after the first completed session, requesting notification permission. Uses existing Card/Button components. Integrated into `app/layout.tsx` as a new child element (additive) — placed after existing children.

---

### Step 9 — Install Prompt Component

**File:** `components/install-prompt.tsx` (new file)

Listens for the browser's `beforeinstallprompt` event and shows a dismissible banner:

```
┌─────────────────────────────────────┐
│  Add to Home Screen                 │
│  Get streak reminders & offline use │
│  [Install]  [Not now]               │
└─────────────────────────────────────┘
```

- Respects user's dismissal (persisted in `localStorage`)
- Not shown if already installed (`window.matchMedia('(display-mode: standalone)')`)
- Integrated into `app/layout.tsx` additively (single new JSX line)

---

### Step 10 — Background Sync for SRS Grades

When a user grades a flashcard while offline, the grade is queued in IndexedDB. When the connection returns, the service worker flushes the queue to `/api/srs/grade`.

Implementation:
- Service worker registers a `sync` event named `srs-grade-sync`
- A small utility `lib/srs-sync.ts` wraps the existing SRS grade fetch call with a queue fallback
- The existing `app/review/page.tsx` is **not modified** — the utility is drop-in at the network layer

---

## Files Changed / Created Summary

### New Files (zero impact on existing features)

| File | Purpose |
|------|---------|
| `public/manifest.json` | Web App Manifest |
| `public/icons/icon-192.png` | Standard icon |
| `public/icons/icon-512.png` | Standard icon |
| `public/icons/icon-maskable-192.png` | Maskable icon |
| `public/icons/icon-maskable-512.png` | Maskable icon |
| `public/icons/apple-touch-icon.png` | iOS icon |
| `public/favicon.ico` | Favicon |
| `app/offline/page.tsx` | Offline fallback page |
| `components/install-prompt.tsx` | Install banner component |
| `components/notification-permission.tsx` | Push notification opt-in |
| `app/api/push/subscribe/route.ts` | Save push subscription |
| `app/api/push/send/route.ts` | Send push notification |
| `lib/srs-sync.ts` | Background sync queue utility |
| `supabase/migrations/YYYYMMDD_push_subscriptions.sql` | Push subs table |

### Modified Files (additive changes only)

| File | What Changes |
|------|-------------|
| `package.json` | Add `@ducanh2912/next-pwa` and `web-push` dependencies |
| `next.config.mjs` | Wrap config with PWA plugin (existing `nextConfig = {}` preserved) |
| `app/layout.tsx` | Add PWA meta tags to `<head>`, add two new child components |

### Untouched Files (guaranteed)

All existing pages, API routes, components, auth system, AI logic, SRS system, voice/TTS, LangChain integration, Supabase schema — **no changes whatsoever**.

---

## Implementation Order

Execute steps in this order to allow testing at each stage:

1. **Icons** (Step 2) — create the `public/icons/` assets
2. **Manifest** (Step 3) — create `public/manifest.json`
3. **next.config.mjs** (Step 4) — enable the PWA plugin
4. **layout.tsx metadata** (Step 5) — link manifest, add meta tags
5. **Offline page** (Step 6) — create fallback
6. **Caching strategies** (Step 7) — configure Workbox runtime caching
7. **Install prompt** (Step 9) — add the install banner component
8. **Push notifications** (Step 8) — VAPID setup, DB migration, API routes, UI
9. **Background sync** (Step 10) — SRS offline queue

Steps 1–7 (and Step 9) can be fully tested locally after build.
Step 8 requires environment variables and a deployed endpoint for end-to-end testing.

---

## Testing Checklist

After implementation, validate with:

- [ ] Lighthouse PWA audit ≥ 90 (Chrome DevTools)
- [ ] "Install" prompt appears in Chrome address bar
- [ ] App installs successfully on Android (Chrome) and iOS (Safari Add to Home Screen)
- [ ] App installs on desktop (Chrome/Edge)
- [ ] App launches in standalone mode (no browser chrome)
- [ ] Offline: home page, review page, progress page load from cache
- [ ] Offline: chat page shows graceful "needs connection" message
- [ ] TTS audio replays from cache when offline
- [ ] SRS grades queue while offline and sync on reconnect
- [ ] Push notification received when triggered from server
- [ ] Push notification appears even with app closed

---

## Environment Variables to Add

```bash
# .env.local (and production secrets)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<generated>
VAPID_PRIVATE_KEY=<generated>
VAPID_SUBJECT=mailto:your@email.com
```

---

## Notes

- `next-pwa` disables the service worker in `development` mode by default. Test PWA features with `npm run build && npm start`.
- Safari on iOS does not support Web Push until iOS 16.4+. The notification feature degrades gracefully (prompt simply doesn't appear on unsupported browsers).
- The `beforeinstallprompt` event is not fired on iOS Safari — the install prompt component detects this and shows iOS-specific "Add to Home Screen" instructions instead.
- All icon PNGs will be generated from SVG source files committed to the repo, so they can be regenerated at any size.
