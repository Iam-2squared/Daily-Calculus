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
  Trash2,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import type {
  AnswerResult,
  Problem,
  ScoringStatus,
  Stats,
  User,
} from "../shared/types";
import { DAILY_CATEGORIES, LEVELS } from "../shared/types";
import { api, EMPTY_STATS } from "./api";
import { MathText } from "./components/Math";
import { ChallengeView } from "./components/ChallengeView";
import { ScoringNotice } from "./components/ScoringNotice";
import { pointColor } from "./activityColors";
import { formatPointIncome } from "../shared/currency";
import {
  AccountView,
  ArchiveView,
  CalendarView,
  KnowledgeView,
  RankingView,
} from "./components/Views";

type Page =
  | "today"
  | "knowledge"
  | "challenge"
  | "ranking"
  | "archive"
  | "account";
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
  const [accountAction, setAccountAction] = useState<
    "logout" | "delete" | null
  >(null);
  const statsVersion = useRef(0);
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
    const version = statsVersion.current;
    const nextStats = await api.stats();
    if (version === statsVersion.current) setStats(nextStats);
  }, []);
  const loadDaily = useCallback(async () => {
    const version = statsVersion.current;
    setLoading(true);
    setError("");
    try {
      const [daily, currentStats] = await Promise.all([
        api.problems(),
        api.stats(),
      ]);
      setProblems(daily.problems);
      setDate(daily.date);
      if (version === statsVersion.current) setStats(currentStats);
    } catch (e) {
      setError(e instanceof Error ? e.message : "読み込みに失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const version = statsVersion.current;
    api
      .session()
      .then((s) => {
        if (version === statsVersion.current) setUser(s.user);
      })
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
    statsVersion.current++;
    setUser(next);
    setAuthOpen(false);
    await refreshStats();
    setToast("ログインしました。");
  }
  const closeAccountAction = useCallback(() => setAccountAction(null), []);
  function accountDeleted() {
    statsVersion.current++;
    setUser(null);
    setStats(EMPTY_STATS);
    setActiveProblem(null);
    setAccountAction(null);
    setToast(
      "アカウントと学習記録を削除しました。連携済みの轟はKGS11thに残ります。",
    );
  }
  const nav = NAV.find((n) => n.id === page) || NAV[0];
  return (
    <div className="app-shell">
      <aside
        id="main-sidebar"
        className={`sidebar ${mobileOpen ? "is-open" : ""}`}
        inert={accountAction !== null || (isMobile && !mobileOpen)}
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
      <div
        className="main-shell"
        inert={accountAction !== null || (isMobile && mobileOpen)}
      >
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
          {page !== "today" && page !== "challenge" && (
            <ScoringNotice
              paused={stats.scoringPaused}
              frozenAt={stats.scoringFrozenAt}
            />
          )}
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
              scoringStatus={stats.scoring}
              scoringPaused={stats.scoringPaused}
              scoringFrozenAt={stats.scoringFrozenAt}
              onComplete={refreshStats}
              onAccount={() => setAuthOpen(true)}
            />
          )}
          {page === "ranking" && (
            <RankingView
              user={user}
              onAccount={() => setAuthOpen(true)}
              scoringPaused={stats.scoringPaused}
            />
          )}
          {page === "archive" && (
            <ArchiveView stats={stats} onSolve={setActiveProblem} />
          )}
          {page === "account" && (
            <AccountView
              user={user}
              stats={stats}
              onAccount={() => setAuthOpen(true)}
              onLogout={() => setAccountAction("logout")}
              onDeleteAccount={() => setAccountAction("delete")}
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
        inert={mobileOpen || accountAction !== null}
        aria-hidden={mobileOpen || accountAction !== null || undefined}
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
      {accountAction && user && (
        <AccountDeletionModal
          action={accountAction}
          username={user.username}
          onClose={closeAccountAction}
          onDeleted={accountDeleted}
        />
      )}
      {activeProblem && (
        <ProblemModal
          problem={activeProblem}
          user={user}
          isSolved={stats.solvedIds.includes(activeProblem.id)}
          scoringStatus={stats.scoring}
          scoringPaused={stats.scoringPaused}
          scoringFrozenAt={stats.scoringFrozenAt}
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
            <span className="stat-label">今日の取得額</span>
            <strong>
              <span
                className="daily-points-value"
                style={
                  tier
                    ? { backgroundColor: tier.color, color: tier.foreground }
                    : undefined
                }
              >
                {formatPointIncome(todayPoints)}
              </span>
              <small>轟</small>
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
      <ScoringNotice
        status={stats.scoring}
        paused={stats.scoringPaused}
        frozenAt={stats.scoringFrozenAt}
      />
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
                  {p.dailyCategory && (
                    <strong className="daily-category">
                      {DAILY_CATEGORIES[p.dailyCategory]}
                    </strong>
                  )}
                  <div className="problem-card-top">
                    <span className="problem-level">
                      <span className="level-dot" />
                      <span>難易度：{meta.name}</span>
                    </span>
                    <span className="points-badge">
                      {stats.scoringPaused ? (
                        "加点停止中"
                      ) : (
                        <>
                          +{formatPointIncome(meta.points)}
                          <span> 轟</span>
                        </>
                      )}
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
        if (!items?.length) {
          e.preventDefault();
          ref.current?.focus();
          return;
        }
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
        <p className="account-lifecycle-note">
          ログアウトすると、今日の微積のアカウント・学習記録が削除されます。連携済みの轟と連携履歴はKGS11thに残ります。削除後は元に戻せません。
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
function AccountDeletionModal({
  action,
  username,
  onClose,
  onDeleted,
}: {
  action: "logout" | "delete";
  username: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const close = useCallback(() => {
    if (!pending.current) onClose();
  }, [onClose]);
  const ref = useDialog(close);
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(".cancel-deletion")?.focus();
  }, [ref]);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await (action === "logout"
        ? api.logout()
        : api.deleteAccount());
      if (!result.accountDeleted)
        throw new Error(
          "アカウントの削除を確認できませんでした。もう一度お試しください。",
        );
      onDeleted();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "削除できませんでした。もう一度お試しください。",
      );
      pending.current = false;
      setBusy(false);
    }
  }
  const label = action === "logout" ? "削除してログアウト" : "アカウントを削除";
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        ref={ref}
        className="account-deletion-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="account-deletion-title"
        aria-describedby="account-deletion-description"
        aria-busy={busy}
        tabIndex={-1}
      >
        <Trash2 size={24} aria-hidden="true" />
        <h2 id="account-deletion-title">{label}しますか？</h2>
        <p className="deletion-username">{username}</p>
        <p id="account-deletion-description">
          今日の微積のアカウント・学習記録を削除し、このアプリのランキングからも削除します。すべての端末でログアウトします。連携済みの轟と連携履歴はKGS11thに残ります。
          <strong>削除後は元に戻せません。</strong>
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="account-deletion-actions">
          <button
            className="button button-secondary cancel-deletion"
            onClick={close}
            disabled={busy}
          >
            キャンセル
          </button>
          <button
            className="button button-danger"
            onClick={remove}
            disabled={busy}
          >
            {busy ? (
              <>
                <LoaderCircle className="spin" size={18} />
                削除中
              </>
            ) : (
              label
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
function ProblemModal({
  problem: p,
  user,
  isSolved,
  scoringStatus,
  scoringPaused,
  scoringFrozenAt,
  onClose,
  onComplete,
  onAccount,
}: {
  problem: Problem;
  user: User | null;
  isSolved: boolean;
  scoringStatus?: ScoringStatus;
  scoringPaused?: boolean;
  scoringFrozenAt?: string | null;
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
  const paused = Boolean(scoringPaused || result?.awardPaused);
  const frozenAt = scoringFrozenAt ?? result?.scoringFrozenAt;
  async function answer() {
    if (choice === null || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await api.answer(p.id, choice);
      setResult(answer);
      if (user) await onComplete();
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
            {p.dailyCategory && (
              <span className="solver-category">
                {DAILY_CATEGORIES[p.dailyCategory]}
              </span>
            )}
            <span className={`solver-level ${p.level}`}>
              難易度：{level.name}
            </span>
            <span>{p.topic}</span>
            <span className="solver-time">
              <Clock3 size={13} />
              {p.estimatedMinutes} 分
            </span>
            <span className="solver-points">
              {paused ? "加点停止中" : `+${formatPointIncome(level.points)} 轟`}
            </span>
          </div>
          <h2 id="problem-title">{p.title}</h2>
          <p className="solver-prompt">{p.prompt}</p>
          <div className="solver-formula">
            <MathText display>{p.formula}</MathText>
          </div>
          {!result && (
            <ScoringNotice
              status={scoringStatus}
              paused={paused}
              frozenAt={frozenAt}
            />
          )}
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
                    ? paused
                      ? "現在は加点を停止しています。正解の学習記録は残ります。"
                      : "正解すると轟が記録されます。"
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
                  <span>+{formatPointIncome(result.pointsEarned)} 轟</span>
                )}
              </div>
              {!result.correct && (
                <p>
                  正解は {String.fromCharCode(65 + result.correctIndex)} です。
                </p>
              )}
              <ScoringNotice
                status={result.scoring}
                awardBlocked={result.awardBlocked}
                paused={paused}
                frozenAt={frozenAt}
                awardPaused={result.correct && paused}
              />
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
