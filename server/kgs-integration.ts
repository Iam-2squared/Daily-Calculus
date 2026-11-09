import { createHash, timingSafeEqual } from "node:crypto";
import type { KgsLinkStatus } from "../shared/kgs-types.js";

const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MONEY = 10_000_000_000_000;
export interface KgsIntegrationOptions {
  identitySecret?: string;
  targetSecret?: string;
  identityUrl?: string;
  targetUrl?: string;
  request?: typeof fetch;
  timeoutMs?: number;
}
export class IntegrationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export function exactKeys(value: unknown, keys: string[]): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function secretValid(value: unknown): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 512 && !/\s/.test(value);
}
function origin(value: string): string {
  const url = new URL(value);
  const localTest = process.env.NODE_ENV === "test" && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !localTest) || url.username || url.password ||
    url.search || url.hash || url.pathname !== "/") throw new Error("Invalid integration origin.");
  return url.origin;
}
function member(value: unknown): value is { id: string; name: string } {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  return typeof m.id === "string" && UUID.test(m.id) && typeof m.name === "string" &&
    m.name.trim() === m.name && Array.from(m.name).length >= 1 && Array.from(m.name).length <= 20;
}
function money(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    value <= MAX_MONEY && value % 100 === 0;
}
export function linkStatus(value: unknown): KgsLinkStatus {
  if (!value || typeof value !== "object") throw new IntegrationError(502, "連携先の応答を確認できませんでした。");
  const s = value as Record<string, unknown>;
  if (typeof s.linked !== "boolean" || s.conversionRate !== 10000 || typeof s.syncPending !== "boolean" ||
    (s.linked ? (!member(s.member) || !money(s.balance) || !money(s.totalIncome) ||
      !money(s.calculusIncome) || s.balance > s.totalIncome)
      : (s.member !== null || s.balance !== null || s.totalIncome !== null || s.calculusIncome !== null))) {
    throw new IntegrationError(502, "連携先の応答を確認できませんでした。");
  }
  return {
    linked: s.linked, conversionRate: 10000,
    member: s.linked ? { id: (s.member as { id: string }).id, name: (s.member as { name: string }).name } : null,
    balance: s.balance as number | null, totalIncome: s.totalIncome as number | null,
    calculusIncome: s.calculusIncome as number | null, syncPending: s.syncPending,
  };
}

/** Server-only adapters. Requests carry identity, never browser-supplied totals. */
export class KgsIntegration {
  private readonly config: KgsIntegrationOptions;
  constructor(options: KgsIntegrationOptions = {}) {
    this.config = {
      identitySecret: process.env.CALCULUS_KGS_INTEGRATION_SECRET,
      targetSecret: process.env.CALCULUS_TARGET_INTEGRATION_SECRET,
      identityUrl: process.env.CALCULUS_KGS_IDENTITY_URL ||
        "https://kgs01-git-codex-kgs01-shared-release-iam-2squareds-projects.vercel.app",
      targetUrl: process.env.CALCULUS_TARGET_URL || "https://kgs-target.vercel.app",
      ...options,
    };
  }
  authorizeSource(supplied: string | undefined): boolean {
    if (!secretValid(this.config.targetSecret) || typeof supplied !== "string" || supplied.length > 1024) return false;
    return timingSafeEqual(createHash("sha256").update(supplied).digest(),
      createHash("sha256").update("Bearer " + this.config.targetSecret).digest());
  }
  private async call(service: "identity" | "target", action: string, body: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    const secret = service === "identity" ? this.config.identitySecret : this.config.targetSecret;
    if (!secretValid(secret)) throw new IntegrationError(503, "KGS連携は準備中です。時間をおいてお試しください。");
    let base: string;
    try { base = origin((service === "identity" ? this.config.identityUrl : this.config.targetUrl)!); }
    catch { throw new IntegrationError(503, "KGS連携は準備中です。時間をおいてお試しください。"); }
    try {
      const response = await (this.config.request || fetch)(
        base + "/api/integrations/calculus/" + action, {
          method: "POST", redirect: "error",
          headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: "Bearer " + secret },
          body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs || this.config.timeoutMs || 5_000),
        });
      if (!response.ok) {
        // Do not relay arbitrary upstream text, keys, credentials or stack traces.
        if (response.status === 401) throw new IntegrationError(401, "出席番号または本人用の暗証番号が違います。");
        if (response.status === 409) throw new IntegrationError(409, "このアカウントはすでに別のアカウントと連携しています。");
        if (response.status === 429) throw new IntegrationError(429, "試行回数が多くなっています。時間をおいてお試しください。");
        throw new IntegrationError(503, "連携先に接続できません。時間をおいてお試しください。");
      }
      const text = await response.text();
      if (text.length > 16_384) throw new Error("Oversized integration response.");
      return JSON.parse(text) as unknown;
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(503, "連携先に接続できません。時間をおいてお試しください。");
    }
  }
  async login(attendanceNumber: string, pin: string): Promise<string> {
    const value = await this.call("identity", "login", { attendanceNumber, pin });
    if (!value || typeof value !== "object" || !("token" in value) ||
      typeof value.token !== "string" || !TOKEN.test(value.token) ||
      !("member" in value) || !member(value.member)) {
      throw new IntegrationError(502, "連携先の応答を確認できませんでした。");
    }
    return value.token;
  }
  async revoke(token: string): Promise<void> {
    // Always attempted by link's finally block. A revoke outage cannot turn an
    // already committed, one-to-one link into an apparent failed transaction.
    try { await this.call("identity", "logout", { token }, Math.min(this.config.timeoutMs || 2_000, 2_000)); }
    catch { /* Tokens also expire and are invalidated by KGS credential changes. */ }
  }
  async status(userId: number): Promise<KgsLinkStatus> {
    return linkStatus(await this.call("target", "status", { userId }));
  }
  async link(userId: number, proofToken: string): Promise<KgsLinkStatus> {
    return linkStatus(await this.call("target", "link", { userId, proofToken }));
  }
  async sync(userId: number, fast = false): Promise<KgsLinkStatus> {
    return linkStatus(await this.call("target", "sync", { userId }, fast ? Math.min(this.config.timeoutMs || 2_000, 2_000) : undefined));
  }
}
