import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "public/sw.js",
      "public/swe-worker-*.js",
      "public/workbox-*.js",
      "public/worker-*.js"
    ]
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-page-custom-font": "off",
      "react-hooks/set-state-in-effect": "off"
    }
  }
]);
