import type { Request, Response } from "express";
import { createApp } from "../server/app.ts";

let app: ReturnType<typeof createApp> | undefined;

export default function handler(req: Request, res: Response) {
  try {
    app ??= createApp();
    return app(req, res);
  } catch {
    // A production deployment must never silently use temporary local storage.
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({
      error: "サービスを準備しています。少し時間をおいてお試しください。",
    });
  }
}
