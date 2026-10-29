import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import type {
  AnswerResult,
  ChallengeMode,
  ChallengeResponse,
  Level,
  Problem,
  TimeAttackRun,
  User,
} from "../../shared/types";
import { LEVELS } from "../../shared/types";
import { api } from "../api";
import { MathText } from "./Math";
import "../challenge.css";

type Phase = "setup" | "active" | "finishing" | "finished";
type Action = "start" | "next" | "answer";
type Totals = {
  answered: number;
  correct: number;
  points: number;
  skipped: number;
};
const emptyTotals = (): Totals => ({
  answered: 0,
  correct: 0,
  points: 0,
  skipped: 0,
});
const modeName = (mode: ChallengeMode) =>
  mode === "practice" ? "通常練習" : "タイムアタック";
const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "通信に失敗しました。もう一度お試しください。";
const expiredError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  error.status === 410;

export function ChallengeView({
  user,
  onComplete,
  onAccount,
}: {
  user: User | null;
  onComplete: () => Promise<void>;
  onAccount: () => void;
}) {
  const [level, setLevel] = useState<Level>("basic");
  const [mode, setMode] = useState<ChallengeMode>("practice");
  const [phase, setPhase] = useState<Phase>("setup");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [run, setRun] = useState<TimeAttackRun | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [totals, setTotals] = useState<Totals>(emptyTotals);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");
  const [retryAction, setRetryAction] = useState<Action | null>(null);
  const [hintOpen, setHintOpen] = useState(false);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [refreshBusy, setRefreshBusy] = useState(false);
  const [finishReason, setFinishReason] = useState<"expired" | "manual">(
    "manual",
  );
  const mounted = useRef(true);
  const generation = useRef(0);
  const requestInFlight = useRef<Action | null>(null);
  const phaseRef = useRef<Phase>("setup");
  const runRef = useRef<TimeAttackRun | null>(null);
  const totalsRef = useRef<Totals>(emptyTotals());
  const serverOffset = useRef(0);
  const finishAfterAnswer = useRef(false);
  const lastUser = useRef(user?.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isCurrent = (id: number) =>
    mounted.current && generation.current === id;

  const finish = useCallback((reason: "expired" | "manual") => {
    if (!mounted.current || phaseRef.current === "finished") return;
    generation.current += 1;
    requestInFlight.current = null;
    finishAfterAnswer.current = false;
    phaseRef.current = "finished";
    setPhase("finished");
    setFinishReason(reason);
    setBusy(null);
    setError("");
    setRetryAction(null);
    setTotals({ ...totalsRef.current });
  }, []);

  const reset = useCallback(() => {
    generation.current += 1;
    requestInFlight.current = null;
    finishAfterAnswer.current = false;
    phaseRef.current = "setup";
    runRef.current = null;
    totalsRef.current = emptyTotals();
    setPhase("setup");
    setProblem(null);
    setRun(null);
    setSelected(null);
    setResult(null);
    setBusy(null);
    setError("");
    setRetryAction(null);
    setHintOpen(false);
    setExplanationOpen(false);
    setRefreshFailed(false);
    setRefreshBusy(false);
    setTotals(emptyTotals());
    setSecondsLeft(180);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, []);
  useEffect(() => {
    if (lastUser.current !== user?.id) {
      lastUser.current = user?.id;
      reset();
    }
  }, [user?.id, reset]);

  const hasExpired = () =>
    runRef.current !== null &&
    Date.now() + serverOffset.current >= runRef.current.endsAt;

  useEffect(() => {
    if (phase !== "active" || !run) return;
    const tick = () => {
      if (phaseRef.current !== "active") return;
      const seconds = Math.max(
        0,
        Math.ceil((run.endsAt - Date.now() - serverOffset.current) / 1000),
      );
      setSecondsLeft(seconds);
      if (seconds === 0) {
        if (requestInFlight.current === "answer") {
          finishAfterAnswer.current = true;
          phaseRef.current = "finishing";
          setPhase("finishing");
        } else finish("expired");
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [phase, run, finish]);

  const showProblem = (data: ChallengeResponse, starting: boolean) => {
    serverOffset.current = data.serverNow - Date.now();
    if (mode === "time-attack") {
      if (!data.run)
        throw new Error(
          "制限時間を取得できませんでした。もう一度開始してください。",
        );
      if (
        !starting &&
        runRef.current &&
        data.run.token !== runRef.current.token
      )
        throw new Error(
          "挑戦の情報が一致しません。終了して再度開始してください。",
        );
      if (starting) {
        runRef.current = data.run;
        setRun(data.run);
      }
      const activeRun = runRef.current!;
      if (data.serverNow >= activeRun.endsAt) {
        finish("expired");
        return;
      }
      setSecondsLeft(
        Math.max(0, Math.ceil((activeRun.endsAt - data.serverNow) / 1000)),
      );
    }
    setProblem(data.problem);
    setSelected(null);
    setResult(null);
    setHintOpen(false);
    setExplanationOpen(mode === "practice");
    setError("");
    setRetryAction(null);
    phaseRef.current = "active";
    setPhase("active");
    window.requestAnimationFrame(() => {
      if (mounted.current && phaseRef.current === "active") {
        headingRef.current?.focus({ preventScroll: true });
        headingRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      }
    });
  };

  const start = async () => {
    if (requestInFlight.current) return;
    const id = ++generation.current;
    requestInFlight.current = "start";
    setBusy("start");
    setError("");
    setRetryAction(null);
    setRefreshFailed(false);
    try {
      const data = await api.startChallenge(level, mode);
      if (!isCurrent(id)) return;
      totalsRef.current = emptyTotals();
      setTotals(emptyTotals());
      runRef.current = null;
      setRun(null);
      showProblem(data, true);
    } catch (err) {
      if (isCurrent(id)) {
        setError(errorMessage(err));
        setRetryAction("start");
      }
    } finally {
      if (isCurrent(id)) {
        requestInFlight.current = null;
        setBusy(null);
      }
    }
  };

  const next = async () => {
    if (requestInFlight.current || phaseRef.current !== "active") return;
    if (hasExpired()) {
      finish("expired");
      return;
    }
    const id = generation.current;
    const skipping = result === null;
    requestInFlight.current = "next";
    setBusy("next");
    setError("");
    setRetryAction(null);
    try {
      const data = await api.nextChallenge(level, mode, runRef.current?.token);
      if (!isCurrent(id)) return;
      if (skipping) {
        totalsRef.current = {
          ...totalsRef.current,
          skipped: totalsRef.current.skipped + 1,
        };
        setTotals({ ...totalsRef.current });
      }
      showProblem(data, false);
    } catch (err) {
      if (!isCurrent(id)) return;
      if (expiredError(err) && mode === "time-attack") finish("expired");
      else {
        setError(errorMessage(err));
        setRetryAction("next");
      }
    } finally {
      if (isCurrent(id)) {
        requestInFlight.current = null;
        setBusy(null);
      }
    }
  };

  const refresh = async () => {
    const id = generation.current;
    setRefreshBusy(true);
    try {
      await onComplete();
      if (isCurrent(id)) setRefreshFailed(false);
    } catch {
      if (isCurrent(id)) setRefreshFailed(true);
    } finally {
      if (isCurrent(id)) setRefreshBusy(false);
    }
  };

  const answer = async () => {
    if (
      !problem ||
      selected === null ||
      result ||
      requestInFlight.current ||
      phaseRef.current !== "active"
    )
      return;
    if (hasExpired()) {
      finish("expired");
      return;
    }
    const id = generation.current;
    requestInFlight.current = "answer";
    setBusy("answer");
    setError("");
    setRetryAction(null);
    try {
      const response = await api.answer(
        problem.id,
        selected,
        runRef.current?.token,
      );
      if (!isCurrent(id)) {
        if (response.correct) {
          try {
            await onComplete();
          } catch {
            /* The view has already been left. */
          }
        }
        return;
      }
      requestInFlight.current = null;
      // Save the accepted response before refreshing the dashboard's statistics.
      totalsRef.current = {
        ...totalsRef.current,
        answered: totalsRef.current.answered + 1,
        correct: totalsRef.current.correct + (response.correct ? 1 : 0),
        points: totalsRef.current.points + response.pointsEarned,
      };
      setTotals({ ...totalsRef.current });
      setResult(response);
      setExplanationOpen(mode === "practice");
      if (finishAfterAnswer.current || hasExpired()) finish("expired");
      if (response.correct) {
        try {
          await onComplete();
        } catch {
          if (isCurrent(id)) setRefreshFailed(true);
        }
      }
    } catch (err) {
      if (!isCurrent(id)) return;
      if (expiredError(err) && mode === "time-attack") finish("expired");
      else {
        setError(errorMessage(err));
        setRetryAction("answer");
      }
    } finally {
      if (isCurrent(id)) {
        requestInFlight.current = null;
        setBusy(null);
        if (finishAfterAnswer.current) finish("expired");
      }
    }
  };

  const retry = () => {
    if (retryAction === "start") void start();
    if (retryAction === "next") void next();
    if (retryAction === "answer") void answer();
  };
  const errorNotice = error ? (
    <div className="challenge-error" role="alert">
      <p>{error}</p>
      {retryAction && (
        <button onClick={retry} disabled={busy !== null}>
          <RotateCcw size={15} />
          再試行
        </button>
      )}
    </div>
  ) : null;
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const active = phase === "active";

  if (phase === "setup")
    return (
      <section className="challenge-view">
        <header className="page-heading">
          <div>
            <h1>挑戦</h1>
            <p className="challenge-description">
              難易度とモードを選んで問題を解けます。
            </p>
          </div>
        </header>
        <div className="surface challenge-setup">
          <fieldset className="challenge-settings" disabled={busy !== null}>
            <legend>難易度</legend>
            <div className="challenge-level-options">
              {(Object.keys(LEVELS) as Level[]).map((l) => (
                <button
                  key={l}
                  className={level === l ? "selected" : ""}
                  aria-pressed={level === l}
                  onClick={() => setLevel(l)}
                >
                  <strong>{LEVELS[l].name}</strong>
                  <span>{LEVELS[l].points} pt / 正解</span>
                  {level === l && <Check size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="challenge-settings" disabled={busy !== null}>
            <legend>モード</legend>
            <div className="challenge-mode-options">
              {(["practice", "time-attack"] as ChallengeMode[]).map((m) => (
                <button
                  key={m}
                  className={mode === m ? "selected" : ""}
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                >
                  {m === "practice" ? (
                    <BookOpen size={21} />
                  ) : (
                    <Clock3 size={21} />
                  )}
                  <span>
                    <strong>{modeName(m)}</strong>
                    <small>
                      {m === "practice"
                        ? "時間制限なし・問題数の制限なし"
                        : "制限時間3分・終了時に結果を表示"}
                    </small>
                  </span>
                  {mode === m && <Check size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
          {errorNotice}
          <button
            className="button button-primary challenge-start"
            onClick={() => void start()}
            disabled={busy !== null}
          >
            {busy === "start" ? (
              <>
                <LoaderCircle size={18} className="spin" />
                問題を読み込んでいます
              </>
            ) : (
              <>
                開始する
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="challenge-rule">
            正解すると基礎1・応用3・難関5ポイントを獲得します。同じ問題の加点は初回のみです。
          </p>
          {!user && (
            <div className="challenge-guest">
              <p>ログインするとポイントと学習記録が保存されます。</p>
              <button onClick={onAccount}>
                登録・ログイン
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </section>
    );

  if (phase === "finished")
    return (
      <section className="challenge-view">
        <header className="page-heading">
          <div>
            <h1>{modeName(mode)}の結果</h1>
            <p className="challenge-description">
              {LEVELS[level].name} ·{" "}
              {finishReason === "expired" ? "制限時間終了" : "終了"}
            </p>
          </div>
        </header>
        <div className="surface challenge-summary">
          <div className="challenge-summary-icon">
            {mode === "time-attack" ? (
              <Clock3 size={30} />
            ) : (
              <CheckCircle2 size={30} />
            )}
          </div>
          <h2>
            {mode === "time-attack" && finishReason === "expired"
              ? "タイムアタック終了"
              : "練習結果"}
          </h2>
          <RunTotals totals={totals} user={user} />
          <p className="challenge-summary-extra">
            回答数 {totals.answered} 問
            {totals.skipped > 0 && ` / スキップ ${totals.skipped} 問`}
            {totals.answered > 0 &&
              ` / 正答率 ${Math.round((totals.correct / totals.answered) * 100)}%`}
          </p>
          {!user && (
            <p className="challenge-rule">
              ゲストのためポイントは加算されません。
            </p>
          )}
          <div className="challenge-summary-actions">
            <button
              className="button button-primary"
              onClick={() => void start()}
              disabled={busy !== null}
            >
              {busy === "start" ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <RotateCcw size={17} />
              )}
              もう一度挑戦
            </button>
            <button
              className="button button-secondary"
              onClick={reset}
              disabled={busy !== null}
            >
              <ArrowLeft size={17} />
              設定に戻る
            </button>
          </div>
          {errorNotice}
          {!user && (
            <button className="challenge-account-link" onClick={onAccount}>
              登録・ログイン
              <ArrowRight size={15} />
            </button>
          )}
        </div>
      </section>
    );

  return (
    <section
      className={`challenge-view ${mode === "time-attack" ? "challenge-timed" : ""}`}
    >
      <header className="challenge-run-heading">
        <div>
          <h1>{modeName(mode)}</h1>
          <p>
            <span>{LEVELS[level].name}</span> 正解で {LEVELS[level].points} pt
          </p>
        </div>
        {mode === "time-attack" && (
          <div
            className={`challenge-timer ${secondsLeft <= 30 ? "urgent" : ""}`}
            role="timer"
            aria-label={`残り${Math.floor(secondsLeft / 60)}分${secondsLeft % 60}秒`}
          >
            <Clock3 size={18} />
            <span>{clock}</span>
          </div>
        )}
        <button
          className="challenge-end"
          onClick={() => finish("manual")}
          disabled={busy === "answer" || phase === "finishing"}
        >
          <X size={16} />
          終了する
        </button>
      </header>
      <RunTotals totals={totals} user={user} />
      {!user && (
        <p className="challenge-active-note">
          ゲスト練習：正解数は表示されます。ポイントの保存にはログインが必要です。
        </p>
      )}
      {phase === "finishing" && (
        <div className="challenge-finishing" role="status">
          <LoaderCircle size={18} className="spin" />
          <p>制限時間終了。送信済みの回答を確認しています。</p>
        </div>
      )}
      <article
        className="surface challenge-problem"
        aria-busy={busy === "next" || phase === "finishing"}
      >
        {problem && (
          <>
            <div className="challenge-problem-meta">
              <span>
                第 {totals.answered + totals.skipped + (result ? 0 : 1)} 問
              </span>
              <span>{problem.topic}</span>
            </div>
            <h2 ref={headingRef} tabIndex={-1}>
              {problem.title}
            </h2>
            <p className="challenge-prompt">{problem.prompt}</p>
            <div className="challenge-formula">
              <MathText display>{problem.formula}</MathText>
            </div>
            <div
              className="challenge-choices"
              role="group"
              aria-label="回答の選択肢"
            >
              {problem.choices.map((choice, index) => (
                <button
                  key={`${problem.id}-${index}`}
                  className={`answer-choice challenge-choice ${selected === index ? "selected" : ""} ${result && index === result.correctIndex ? "correct" : ""} ${result && !result.correct && selected === index ? "incorrect" : ""}`}
                  aria-pressed={selected === index}
                  disabled={!!result || busy !== null || !active}
                  onClick={() => setSelected(index)}
                >
                  <span className="challenge-choice-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <MathText>{choice}</MathText>
                  {result && index === result.correctIndex && (
                    <CheckCircle2 size={18} />
                  )}
                </button>
              ))}
            </div>
            {mode === "practice" && !result && (
              <>
                <button
                  className="challenge-hint-toggle"
                  onClick={() => setHintOpen((v) => !v)}
                  aria-expanded={hintOpen}
                >
                  <CircleHelp size={16} />
                  ヒント{hintOpen ? "を閉じる" : "を見る"}
                  <ChevronDown
                    size={15}
                    className={hintOpen ? "challenge-chevron-up" : ""}
                  />
                </button>
                {hintOpen && <p className="challenge-hint">{problem.hint}</p>}
              </>
            )}
            {errorNotice}
            {!result ? (
              <div className="challenge-answer-actions">
                <button
                  className="button button-primary"
                  onClick={() => void answer()}
                  disabled={selected === null || busy !== null || !active}
                >
                  {busy === "answer" ? (
                    <>
                      <LoaderCircle size={17} className="spin" />
                      判定中
                    </>
                  ) : (
                    <>
                      回答する
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
                {mode === "practice" && (
                  <button
                    className="button button-secondary"
                    onClick={() => void next()}
                    disabled={busy !== null || !active}
                  >
                    {busy === "next" ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : null}
                    スキップ
                  </button>
                )}
              </div>
            ) : (
              <div className="challenge-answer-result">
                <div
                  className={`challenge-result-label ${result.correct ? "correct" : "incorrect"}`}
                  role="status"
                >
                  {result.correct ? (
                    <CheckCircle2 size={22} />
                  ) : (
                    <X size={22} />
                  )}
                  <strong>{result.correct ? "正解" : "不正解"}</strong>
                  {result.pointsEarned > 0 && (
                    <span>+{result.pointsEarned} pt</span>
                  )}
                  {!result.correct && (
                    <p>
                      正解は {String.fromCharCode(65 + result.correctIndex)}{" "}
                      です。
                    </p>
                  )}
                </div>
                {result.alreadySolved && (
                  <p className="challenge-rule">
                    正解済みのため、今回の加点はありません。
                  </p>
                )}
                <button
                  className="challenge-explanation-toggle"
                  onClick={() => setExplanationOpen((v) => !v)}
                  aria-expanded={explanationOpen}
                >
                  解説{explanationOpen ? "を閉じる" : "を見る"}
                  <ChevronDown
                    size={16}
                    className={explanationOpen ? "challenge-chevron-up" : ""}
                  />
                </button>
                {explanationOpen && (
                  <div className="challenge-explanation">
                    {result.explanation.map((line, index) => (
                      <div key={index}>
                        <p>{line}</p>
                        {result.explanationFormulas[index] && (
                          <MathText display>
                            {result.explanationFormulas[index]}
                          </MathText>
                        )}
                      </div>
                    ))}
                    {result.explanationFormulas
                      .slice(result.explanation.length)
                      .map((formula, index) => (
                        <MathText key={index} display>
                          {formula}
                        </MathText>
                      ))}
                  </div>
                )}
                <button
                  className="button button-primary challenge-next"
                  onClick={() => void next()}
                  disabled={busy !== null || !active}
                >
                  {busy === "next" ? (
                    <>
                      <LoaderCircle size={17} className="spin" />
                      次の問題を読み込んでいます
                    </>
                  ) : (
                    <>
                      次の問題
                      <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </div>
            )}
            {refreshFailed && (
              <div className="challenge-refresh-note" role="status">
                <p>
                  回答結果は保存されています。学習記録の表示を更新できませんでした。
                </p>
                <button onClick={() => void refresh()} disabled={refreshBusy}>
                  {refreshBusy && <LoaderCircle size={15} className="spin" />}
                  記録を再読み込み
                </button>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}

function RunTotals({ totals, user }: { totals: Totals; user: User | null }) {
  return (
    <div className="challenge-totals">
      <div>
        <span>正解数</span>
        <strong>
          {totals.correct}
          <small>問</small>
        </strong>
      </div>
      <div>
        <span>回答数</span>
        <strong>
          {totals.answered}
          <small>問</small>
        </strong>
      </div>
      <div>
        <span>{user ? "獲得ポイント" : "ポイント（ゲスト）"}</span>
        <strong>
          {totals.points}
          <small>pt</small>
        </strong>
      </div>
    </div>
  );
}
