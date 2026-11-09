import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Link2, LoaderCircle, RefreshCw } from "lucide-react";
import type { KgsLinkStatus } from "../../shared/kgs-types";
import { formatGou } from "../../shared/currency";
import { api } from "../api";

const money = (amount: number | null) =>
  amount === null ? "—" : `${formatGou(amount)}轟`;

/** Remount this component when the Daily account changes. */
export function KgsLinkPanel() {
  const [status, setStatus] = useState<KgsLinkStatus | null>(null);
  const [attendanceNumber, setAttendanceNumber] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    api.kgsLink().then((next) => {
      if (active) setStatus(next);
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : "連携情報を読み込めませんでした。");
    }).finally(() => {
      if (active) setBusy(false);
    });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, []);

  async function update(link = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const submittedPin = pin;
    if (link) setPin("");
    try {
      const next = link
        ? await api.linkKgs(String(Number(attendanceNumber)), submittedPin)
        : status?.linked
          ? await api.syncKgs()
          : await api.kgsLink();
      if (!mounted.current) return;
      setStatus(next);
      if (link) setAttendanceNumber("");
      setNotice(link ? "KGS11thと連携しました。これまでの獲得額も反映されます。" : "連携情報を更新しました。");
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "連携情報を更新できませんでした。");
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(attendanceNumber);
    if ((!Number.isInteger(number) || (number < 1 || number > 40) && number !== 99) || !/^\d{4}$/.test(pin)) {
      setError("KGS11thの番号と4桁のPINを入力してください。");
      return;
    }
    void update(true);
  }

  return (
    <section className="surface kgs-link-panel" aria-labelledby="kgs-link-heading" aria-busy={busy}>
      <div className="kgs-link-heading">
        <span className="kgs-link-emblem"><Link2 size={22} aria-hidden="true" /></span>
        <div>
          <h2 id="kgs-link-heading">KGS11thと連携</h2>
          <p>微積で獲得した轟を、暗記と共通で使えます。</p>
        </div>
      </div>
      {busy && !status && <p className="kgs-link-loading" role="status"><LoaderCircle size={17} className="spin" />連携情報を確認しています…</p>}
      {status?.linked ? (
        <>
          <p className="kgs-link-connected"><CheckCircle2 size={17} aria-hidden="true" /><strong>{status.member?.name}</strong> と連携済み</p>
          <dl className="kgs-wallet-summary">
            <div><dt>保有額（共通）</dt><dd>{money(status.balance)}</dd></div>
            <div><dt>総取得（Gの損益込み）</dt><dd>{money(status.totalIncome)}</dd></div>
            <div><dt>微積で獲得した累計</dt><dd>{money(status.calculusIncome)}</dd></div>
          </dl>
          <p className="kgs-link-note">総取得は暗記・微積・誕生日プレゼントとGの損益の合計です。ガチャで使っても減りません。連携先のアカウントは変更できません。</p>
          {status.syncPending && <p className="kgs-sync-pending" role="status">最新の獲得額は反映待ちです。表示額は前回反映した金額です。時間をおいて更新してください。</p>}
        </>
      ) : status ? (
        <form className="kgs-link-form" onSubmit={submit}>
          <p className="kgs-link-note" id="kgs-link-policy">今使っているKGS11thの番号とPINで連携します。これまでの獲得額も反映されます。連携後は別のアカウントに変更できません。</p>
          <div className="kgs-link-fields">
            <label htmlFor="kgs-attendance-number">KGS11thの番号
              <input id="kgs-attendance-number" name="attendanceNumber" type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{1,2}" maxLength={2} required value={attendanceNumber} onChange={(event) => setAttendanceNumber(event.target.value)} disabled={busy} aria-describedby="kgs-link-policy" />
            </label>
            <label htmlFor="kgs-pin">KGS11thのPIN（4桁）
              <input id="kgs-pin" name="pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} required value={pin} onChange={(event) => setPin(event.target.value)} disabled={busy} />
            </label>
          </div>
          <button type="submit" className="button button-primary" disabled={busy}>
            {busy ? <LoaderCircle size={16} className="spin" /> : <Link2 size={16} />}このアカウントを連携
          </button>
        </form>
      ) : null}
      {error && <p className="kgs-link-error" role="alert">{error}</p>}
      {notice && <p className="kgs-link-notice" role="status">{notice}</p>}
      {(status?.linked || error) && <button type="button" className="text-button kgs-link-refresh" onClick={() => void update()} disabled={busy}>
        {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}連携情報を更新
      </button>}
    </section>
  );
}
