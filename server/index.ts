import express from "express";
import { resolve } from "node:path";
import { createApp } from "./app.js";

const app = createApp();
if (process.env.NODE_ENV === "production") {
  const dist = resolve("dist");
  app.use(express.static(dist, { maxAge: "1h" }));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(resolve(dist, "index.html"));
  });
}
const port = Number(process.env.PORT || 3001);
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`今日の微積 API: http://localhost:${port}`),
);
function shutdown() {
  server.close(() => {
    app.locals.db?.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
