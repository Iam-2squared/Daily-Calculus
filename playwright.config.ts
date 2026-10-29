import { defineConfig } from "@playwright/test";
const testDatabase = `data/e2e-${process.pid}-${Date.now()}.sqlite`;
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3100", trace: "retain-on-failure" },
  webServer: {
    command: `npm run build && PORT=3100 COOKIE_SECURE=false DATABASE_PATH=${testDatabase} npm start`,
    url: "http://127.0.0.1:3100/api/session",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
