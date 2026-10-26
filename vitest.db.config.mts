// Database security tests. They sign in as the demo accounts against the
// DEVELOPMENT database (npm run db:seed-dev first) and never leave data behind.
//   npm run test:db

import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    env: loadEnv("development", process.cwd(), ""),
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
