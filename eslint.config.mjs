import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  {
    ignores: [".next/**", "node_modules/**", "coverage/**"]
  },
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off"
    }
  }
]);
