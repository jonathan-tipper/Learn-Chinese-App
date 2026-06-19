import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      // ── Google Fonts CSS ─────────────────────────────────────────────────
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "google-fonts-stylesheets",
        },
      },
      // ── Google Fonts files (immutable) ───────────────────────────────────
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-webfonts",
          expiration: { maxAgeSeconds: 365 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // ── TTS audio — cache so replays work offline ────────────────────────
      {
        urlPattern: /\/api\/voice\/tts/,
        handler: "CacheFirst",
        options: {
          cacheName: "tts-audio",
          expiration: { maxEntries: 50, maxAgeSeconds: 30 * 24 * 60 * 60 },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      // ── Static pages — network first, cached for offline ─────────────────
      {
        urlPattern: /^\/(|review|progress|memory)$/,
        handler: "NetworkFirst",
        options: {
          cacheName: "pages",
          networkTimeoutSeconds: 60,
          expiration: { maxAgeSeconds: 24 * 60 * 60 },
        },
      },
      // ── AI chat & session routes — always require live connection ─────────
      {
        urlPattern: /\/api\//,
        handler: "NetworkOnly",
      },
    ],
  },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
