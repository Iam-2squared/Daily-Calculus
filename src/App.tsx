import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Flame,
  History,
  Leaf,
  LoaderCircle,
  Menu,
  Target,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import type { AnswerResult, Problem, Stats, User } from "../shared/types";
import { LEVELS } from "../shared/types";
import { api, EMPTY_STATS } from "./api";
import { MathText } from "./components/Math";
import { ChallengeView } from "./components/ChallengeView";
import { pointColor } from "./activityColors";
import {
  AccountView,
  ArchiveView,
  CalendarView,
  KnowledgeView,
  RankingView,
} from "./components/Views";

type Page =
  "today" | "knowledge" | "challenge" | "ranking" | "archive" | "account";
const NAV = [
  { id: "today", label: "今日の学習", icon: BookOpen },
  { id: "knowledge", label: "微積の基本知識", icon: Leaf },
  {
    id: "challenge",
    label: "挑戦",
    icon: Target,
  },
  { id: "ranking", label: "ランキング", icon: Trophy },
  { id: "archive", label: "過去問に挑戦", icon: History },
  { id: "account", label: "アカウント", icon: UserRound },
] as const;
const todayLabel = (date: string) =>
  new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${date}T12:00:00+09:00`));
const jstToday = () =>
  new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

export default function App() {
  const [page, setPage] = useState<Page>(() =>
    NAV.some((n) => n.id === location.hash.slice(1))
      ? (location.hash.slice(1) as Page)
      : "today",
  );
  const [user, setUser] = useState<User | null>(null);
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [date, setDate] = useState(jstToday());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [activeProblem, setActiveProblem] = useState<Problem | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => matchMedia("(max-width: 700px)").matches,
  );
  useEffect(() => {
    const query = matchMedia("(max-width: 700px)");
    const update = () => {
      setIsMobile(query.matches);
      if (!query.matches) setMobileOpen(false);
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobileOpen || !isMobile) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("#main-sidebar .nav-link")?.focus(),
    );
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", close);
    return () => {
      cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileOpen, isMobile]);
  const [toast, setToast] = useState("");
  const refreshStats = useCallback(async () => {
    setStats(await api.stats());
  }, []);
  const loadDaily = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [daily, currentStats] = await Promise.all([
        api.problems(),
        api.stats(),
      ]);
      setProblems(daily.problems);
      setDate(daily.date);
      setStats(currentStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    api
      .session()
      .then((s) => setUser(s.user))
      .catch(() => {});
    void loadDaily();
  }, [loadDaily]);
  useEffect(() => {
    const sync = () =>
      setPage(
        NAV.some((n) => n.id === location.hash.slice(1))
          ? (location.hash.slice(1) as Page)
          : "today",
      );
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      if (jstToday() !== date) void loadDaily();
    }, 30000);
    return () => clearInterval(timer);
  }, [date, loadDaily]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(next: Page) {
    setPage(next);
    location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function authenticated(next: User) {
    setUser(next);
    setAuthOpen(false);
    await refreshStats();
    setToast("ログインしました。");
  }
  async function logout() {
    try {
      await api.logout();
      setUser(null);
      setStats(EMPTY_STATS);
      setToast("ログアウトしました。");
    } catch (e) {
      setToast(e instanceof Error ? e.message : "ログアウトできませんでした。");
    }
  }
  const nav = NAV.find((n) => n.id === page) || NAV[0];
  return (
    <div className="app-shell">
      <aside
        id="main-sidebar"
        className={`sidebar ${mobileOpen ? "is-open" : ""}`}
        inert={isMobile && !mobileOpen}
      >
        <button
          className="icon-button mobile-menu sidebar-close"
          aria-label="サイドメニューを閉じる"
          onClick={() => setMobileOpen(false)}
        >
          <X size={18} />
        </button>
        <a
          className="brand"
          href="#today"
          onClick={() => navigate("today")}
          aria-label="今日の微積 ホーム"
        >
          <span className="brand-symbol">
            ∫<span>·</span>
          </span>
          <span>
            <strong>今日の微積</strong>
          </span>
        </a>
        <nav>
          {NAV.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={`nav-link ${page === id ? "active" : ""}`}
              aria-current={page === id ? "page" : undefined}
            >
              <Icon size={18} strokeWidth={1.65} />
              <span>{label}</span>
              {page === id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-account"
            onClick={() => {
              if (user) navigate("account");
              else {
                setMobileOpen(false);
                setAuthOpen(true);
              }
            }}
          >
            <span className="avatar">
              {user ? user.username.slice(0, 1) : <UserRound size={18} />}
            </span>
            <span>
              <strong>{user?.username || "アカウント"}</strong>
              <small>{user ? "アカウント情報" : "登録・ログイン"}</small>
            </span>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="メニューを閉じる"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className="main-shell" inert={isMobile && mobileOpen}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="メニュー"
              aria-expanded={mobileOpen}
              aria-controls="main-sidebar"
            >
              <Menu size={22} />
            </button>
            <span className="breadcrumb">ホーム</span>
            <ChevronRight size={13} />
            <strong>{nav.label}</strong>
          </div>
          <div className="topbar-right">
            <span className="topbar-date">
              <CalendarDays size={14} />
              {date.replaceAll("-", " / ")}
            </span>
            <span className="topbar-divider" />
            <button
              className="topbar-user"
              onClick={() => (user ? navigate("account") : setAuthOpen(true))}
            >
              <span className="mini-avatar">
                {user ? user.username.slice(0, 1) : <UserRound size={15} />}
              </span>
              <span>{user?.username || "ログイン"}</span>
              <ChevronRight size={13} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {page === "today" && (
            <Dashboard
              {...{ stats, problems, date, loading, error }}
              onSolve={setActiveProblem}
              onNavigate={navigate}
              onRetry={loadDaily}
            />
          )}
          {page === "knowledge" && <KnowledgeView />}
          {page === "challenge" && (
            <ChallengeView
              user={user}
              onComplete={refreshStats}
              onAccount={() => setAuthOpen(true)}
            />
          )}
          {page === "ranking" && (
            <RankingView user={user} onAccount={() => setAuthOpen(true)} />
          )}
          {page === "archive" && (
            <ArchiveView stats={stats} onSolve={setActiveProblem} />
          )}
          {page === "account" && (
            <AccountView
              user={user}
              stats={stats}
              onAccount={() => setAuthOpen(true)}
              onLogout={logout}
            />
          )}
          <footer className="main-footer">
            <span className="footer-brand">
              ∫ <span>今日の微積</span>
            </span>
            <span>© {new Date().getFullYear()} 今日の微積</span>
          </footer>
        </main>
      </div>
      <nav
        className="mobile-bottom-nav"
        aria-label="メインナビゲーション"
        inert={mobileOpen}
        aria-hidden={mobileOpen || undefined}
      >
        {(
          [
            { id: "today", label: "今日の学習", icon: BookOpen },
            { id: "knowledge", label: "ノート", icon: Leaf },
            { id: "challenge", label: "挑戦", icon: Target },
            { id: "ranking", label: "ランキング", icon: Trophy },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`mobile-bottom-link ${id === "challenge" ? "challenge-nav-link" : ""} ${page === id ? "active" : ""}`}
            aria-current={page === id ? "page" : undefined}
            onClick={() => navigate(id)}
          >
            <Icon size={20} strokeWidth={1.65} />
            <span>{label}</span>
          </button>
        ))}
        <button
          className={`mobile-bottom-link ${mobileOpen || page === "archive" || page === "account" ? "active" : ""}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-expanded={mobileOpen}
          aria-controls="main-sidebar"
          aria-label="その他のメニュー"
        >
          <Menu size={20} strokeWidth={1.65} />
          <span>その他</span>
        </button>
      </nav>
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={authenticated}
        />
      )}
      {activeProblem && (
        <ProblemModal
          problem={activeProblem}
          user={user}
          isSolved={stats.solvedIds.includes(activeProblem.id)}
          onClose={() => setActiveProblem(null)}
          onComplete={refreshStats}
          onAccount={() => {
            setActiveProblem(null);
            setAuthOpen(true);
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Dashboard({
  stats,
  problems,
  date,
  loading,
  error,
  onSolve,
  onNavigate,
  onRetry,
}: {
  stats: Stats;
  problems: Problem[];
  date: string;
  loading: boolean;
  error: string;
  onSolve: (p: Problem) => void;
  onNavigate: (p: Page) => void;
  onRetry: () => void;
}) {
  const todayActivity = stats.activity.find((a) => a.date === date);
  const todayPoints = todayActivity?.points ?? 0;
  const tier = pointColor(todayPoints);
  const complete = problems.filter((p) =>
    stats.solvedIds.includes(p.id),
  ).length;
  return (
    <div className="dashboard">
      <header className="dashboard-heading">
        <div>
          <h1>今日の微積</h1>
          <p className="dashboard-date">{todayLabel(date)}</p>
        </div>
      </header>
      <div className="stats-strip surface">
        <div className="stat-item">
          <span className="stat-icon">
            <ChartNoAxesColumnIncreasing size={19} />
          </span>
          <div>
            <span className="stat-label">今日のポイント</span>
            <strong>
              <span
                className="daily-points-value"
                style={
                  tier
                    ? { backgroundColor: tier.color, color: tier.foreground }
                    : undefined
                }
              >
                {todayPoints}
              </span>
              <small>pt</small>
            </strong>
          </div>
        </div>
        <div className="stat-item">
          <span className="stat-icon flame">
            <Flame size={19} />
          </span>
          <div>
            <span className="stat-label">連続学習日数</span>
            <strong>
              {stats.streak}
              <small>日</small>
            </strong>
          </div>
        </div>
        <div className="stat-item">
          <span className="stat-icon">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <span className="stat-label">今日の正解数</span>
            <strong>
              {todayActivity?.count ?? 0}
              <small>問</small>
            </strong>
          </div>
        </div>
      </div>
      <section className="daily-section">
        <div className="section-heading">
          <div className="section-title">
            <h2>今日の3問</h2>
          </div>
          <span className="daily-update">毎日 0:00 更新（日本時間）</span>
        </div>
        {error ? (
          <div className="surface error-state">
            <p>{error}</p>
            <button className="button button-secondary" onClick={onRetry}>
              再読み込み
            </button>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={22} />
            読み込み中
          </div>
        ) : (
          <div className="problem-grid">
            {problems.map((p) => {
              const meta = LEVELS[p.level];
              const done = stats.solvedIds.includes(p.id);
              return (
                <button
                  className={`problem-card ${p.level} ${done ? "solved" : ""}`}
                  key={p.id}
                  onClick={() => onSolve(p)}
                >
                  <div className="problem-card-top">
                    <span className="problem-level">
                      <span className="level-dot" />
                      {meta.name}
                    </span>
                    <span className="points-badge">
                      +{meta.points}
                      <span> pt</span>
                    </span>
                  </div>
                  <div className="problem-formula">
                    <MathText display>
                      {p.formula.split(String.raw`\quad`)[0]}
                    </MathText>
                  </div>
                  <div className="problem-topic">{p.topic}</div>
                  <h3>{p.title}</h3>
                  <div className="problem-card-bottom">
                    <span>
                      {done ? (
                        <>
                          <Check size={14} />
                          正解済み
                        </>
                      ) : (
                        <>
                          <Clock3 size={14} />
                          目安 {p.estimatedMinutes} 分
                        </>
                      )}
                    </span>
                    <span className="problem-arrow">
                      <ArrowRight size={18} />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
        <div className="daily-caption">
          <span>今日の正解 {complete} / 3 問</span>
        </div>
      </section>
      <div className="practice-entry surface">
        <div>
          <h2>追加の問題を解く</h2>
          <p>難易度を選んで練習・タイムアタック</p>
        </div>
        <button
          className="button button-primary"
          onClick={() => onNavigate("challenge")}
        >
          挑戦する
          <ArrowRight size={16} />
        </button>
      </div>
      <section className="today-record-section">
        <div className="section-heading">
          <div className="section-title">
            <h2>学習記録</h2>
          </div>
        </div>
        <CalendarView stats={stats} embedded />
      </section>
    </div>
  );
}
function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    ref.current?.focus();
    return () => {
      document.body.style.overflow = oldOverflow;
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, [onClose]);
  return ref;
}
function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: User) => Promise<void>;
}) {
  const [mode, setMode] = useState<"register" | "login">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useDialog(onClose);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await api.auth(mode, username, password);
      await onSuccess(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        className="auth-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
        tabIndex={-1}
      >
        <button
          className="icon-button modal-close"
          aria-label="閉じる"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="auth-brand-symbol">∫</span>
        <p className="auth-app-name">今日の微積</p>
        <h2 id="auth-title">
          {mode === "register" ? "アカウント作成" : "ログイン"}
        </h2>
        <p className="auth-intro">
          ユーザーネームと数字4桁のパスワードを入力してください。
        </p>
        <div className="auth-tabs">
          <button
            className={mode === "register" ? "selected" : ""}
            onClick={() => {
              setMode("register");
              setError("");
            }}
          >
            アカウント作成
          </button>
          <button
            className={mode === "login" ? "selected" : ""}
            onClick={() => {
              setMode("login");
              setError("");
            }}
          >
            ログイン
          </button>
        </div>
        <form onSubmit={submit}>
          <label htmlFor="username">
            ユーザーネーム<span>ランキングに表示されます</span>
          </label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={2}
            maxLength={20}
            autoComplete="username"
            placeholder="例：積分さん"
          />
          <label htmlFor="password">4桁の数字パスワード</label>
          <input
            id="password"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            minLength={4}
            maxLength={4}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, ""))}
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            placeholder="••••"
          />
          <span className="input-note">
            数字4桁で設定してください。先頭に0も使えます。
          </span>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button button-primary auth-submit" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <>
                {mode === "register" ? "登録する" : "ログインする"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <p className="auth-bottom-note">
          {mode === "register"
            ? "ユーザーネームとパスワードは大切に保管してください。"
            : "登録済みのアカウントでログインします。"}
        </p>
      </div>
    </div>
  );
}
function ProblemModal({
  problem: p,
  user,
  isSolved,
  onClose,
  onComplete,
  onAccount,
}: {
  problem: Problem;
  user: User | null;
  isSolved: boolean;
  onClose: () => void;
  onComplete: () => Promise<void>;
  onAccount: () => void;
}) {
  const [choice, setChoice] = useState<number | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hint, setHint] = useState(false);
  const ref = useDialog(onClose);
  const level = LEVELS[p.level];
  async function answer() {
    if (choice === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await api.answer(p.id, choice);
      setResult(answer);
      if (user && answer.correct) await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "送信できませんでした。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="problem-modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="problem-title"
        tabIndex={-1}
      >
        <div className="problem-modal-header">
          <span className="eyebrow">
            {p.date === jstToday() ? "今日の問題" : "過去問"}
            <span>{p.date.replaceAll("-", ".")}</span>
          </span>
          <button className="icon-button" aria-label="閉じる" onClick={onClose}>
            <X size={21} />
          </button>
        </div>
        <div className="problem-modal-body">
          <div className="solver-meta">
            <span className={`solver-level ${p.level}`}>{level.name}</span>
            <span>{p.topic}</span>
            <span>
              <Clock3 size={13} />
              {p.estimatedMinutes} 分
            </span>
            <span className="solver-points">+{level.points} pt</span>
          </div>
          <h2 id="problem-title">{p.title}</h2>
          <p className="solver-prompt">{p.prompt}</p>
          <div className="solver-formula">
            <MathText display>{p.formula}</MathText>
          </div>
          <div
            className="answer-choices"
            role="group"
            aria-label="解答の選択肢"
          >
            {p.choices.map((option, i) => (
              <button
                key={i}
                onClick={() => !result && setChoice(i)}
                disabled={!!result}
                aria-pressed={choice === i}
                className={`answer-choice ${choice === i ? "chosen" : ""} ${result && i === result.correctIndex ? "correct-choice" : ""} ${result && !result.correct && choice === i ? "wrong-choice" : ""}`}
              >
                <span className="choice-letter">
                  {String.fromCharCode(65 + i)}
                </span>
                <MathText>{option}</MathText>
                {result && i === result.correctIndex ? (
                  <CheckCircle2 size={19} />
                ) : choice === i ? (
                  <span className="choice-dot" />
                ) : null}
              </button>
            ))}
          </div>
          {!result && (
            <>
              <button
                className="hint-toggle"
                onClick={() => setHint(!hint)}
                aria-expanded={hint}
              >
                <CircleHelp size={15} />
                {hint ? "ヒントを閉じる" : "ヒントを見る"}
                <ChevronRight className={hint ? "rotated" : ""} size={14} />
              </button>
              {hint && <div className="hint-box">{p.hint}</div>}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button button-primary answer-submit"
                disabled={choice === null || busy}
                onClick={answer}
              >
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <>
                    答えを確かめる
                    <ArrowRight size={17} />
                  </>
                )}
              </button>
              <p className="solver-footnote">
                {isSolved
                  ? "この問題は正解済みです。復習しても重複加点されません。"
                  : user
                    ? "正解するとポイントが記録されます。"
                    : "お試しで解けます。学習記録の保存にはログインが必要です。"}
              </p>
            </>
          )}
          {result && (
            <div
              className={`answer-result ${result.correct ? "success" : "retry"}`}
              role="status"
            >
              <div className="result-heading">
                {result.correct ? (
                  <CheckCircle2 size={25} />
                ) : (
                  <BookOpen size={25} />
                )}
                <h3>{result.correct ? "正解" : "不正解"}</h3>
                {result.pointsEarned > 0 && (
                  <span>+{result.pointsEarned} pt</span>
                )}
              </div>
              {!result.correct && (
                <p>
                  正解は {String.fromCharCode(65 + result.correctIndex)} です。
                </p>
              )}
              <div className="explanation">
                <span className="eyebrow">解説</span>
                {result.explanation.map((line, i) => (
                  <div key={i}>
                    <p>{line}</p>
                    {result.explanationFormulas[i] && (
                      <MathText display>
                        {result.explanationFormulas[i]}
                      </MathText>
                    )}
                  </div>
                ))}
                {result.explanationFormulas
                  .slice(result.explanation.length)
                  .map((f, i) => (
                    <MathText key={i} display>
                      {f}
                    </MathText>
                  ))}
              </div>
              {result.alreadySolved && (
                <p className="solver-footnote">
                  記録済みの問題のため、今回の加点はありません。
                </p>
              )}
              {!user ? (
                <button
                  className="button button-primary answer-submit"
                  onClick={onAccount}
                >
                  登録・ログイン
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button button-primary answer-submit"
                  onClick={onClose}
                >
                  閉じる
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
