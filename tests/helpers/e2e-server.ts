import express from "express";
import { resolve } from "node:path";
import { createApp } from "../../server/app.js";
import { E2E_CHALLENGE_KEY } from "./resolve-challenge.js";

const app = createApp(process.env.DATABASE_PATH || "data/e2e.sqlite", {
  challengeKey: E2E_CHALLENGE_KEY,
  secureCookies: false,
  integration: { identitySecret: "", targetSecret: "" },
});
const dist = resolve("dist");
app.use(express.static(dist));
app.get("/{*path}", (_request, response) =>
  response.sendFile(resolve(dist, "index.html")),
);
const port = Number(process.env.PORT || 3100);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(`Local E2E server: ${port}`),
);
function shutdown() {
  server.close(() => {
    app.locals.db?.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
