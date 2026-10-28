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
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import type { AnswerResult, Problem, Stats, User } from "../shared/types";
import { LEVELS } from "../shared/types";
import { api, EMPTY_STATS } from "./api";
import { MathText } from "./components/Math";
import {
  AccountView,
  ArchiveView,
  CalendarView,
  KnowledgeView,
  RankingView,
} from "./components/Views";

type Page =
  "today" | "knowledge" | "calendar" | "ranking" | "archive" | "account";
const NAV = [
  { id: "today", label: "今日の微積", en: "DAILY PRACTICE", icon: BookOpen },
  { id: "knowledge", label: "微積のノート", en: "THE NOTEBOOK", icon: Leaf },
  {
    id: "calendar",
    label: "学習のあしあと",
    en: "YOUR PROGRESS",
    icon: CalendarDays,
  },
  { id: "ranking", label: "ランキング", en: "LEADERBOARD", icon: Trophy },
  { id: "archive", label: "過去問に挑戦", en: "THE ARCHIVE", icon: History },
  { id: "account", label: "アカウント", en: "YOUR ACCOUNT", icon: UserRound },
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
  const [page, setPage] = useState<Page>(
    (location.hash.slice(1) as Page) || "today",
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
  }, [refreshStats]);
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
    setToast(`${next.username}さん、ようこそ。今日から、少しずつ。`);
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
            <small>DAILY CALCULUS</small>
          </span>
        </a>
        <div className="sidebar-caption">日常に、ひとさじの数学を。</div>
        <div className="nav-caption">YOUR DAILY ROUTINE</div>
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
          <div className="sidebar-note">
            <span className="note-formula">∫ little things dt</span>
            <p>
              小さな積み重ねが、
              <br />
              大きな変化になる。
            </p>
            <span className="little-line" />
          </div>
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
              <strong>{user?.username || "あなたの学びを記録"}</strong>
              <small>{user ? "マイアカウント" : "無料ではじめる"}</small>
            </span>
            <ChevronRight size={16} />
          </button>
          <div className="sidebar-footer">
            <span className="online-dot" /> A LITTLE FURTHER, EVERY DAY.
          </div>
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
              {...{ user, stats, problems, date, loading, error }}
              onSolve={setActiveProblem}
              onNavigate={navigate}
              onRetry={loadDaily}
            />
          )}
          {page === "knowledge" && <KnowledgeView />}
          {page === "calendar" && <CalendarView stats={stats} />}
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
            <span>日々、思考を積み重ねる。</span>
            <span>© {new Date().getFullYear()} DAILY CALCULUS</span>
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
            { id: "today", label: "今日の微積", icon: BookOpen },
            { id: "knowledge", label: "ノート", icon: Leaf },
            { id: "calendar", label: "学習記録", icon: CalendarDays },
            { id: "ranking", label: "ランキング", icon: Trophy },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`mobile-bottom-link ${page === id ? "active" : ""}`}
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

function CalculusGraph() {
  return (
    <div className="hero-graph" aria-hidden="true">
      <div className="graph-caption">THE BEAUTY OF CHANGE</div>
      <svg viewBox="0 0 490 310">
        <defs>
          <pattern
            id="grid"
            width="30"
            height="30"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M 30 0 L 0 0 0 30"
              fill="none"
              stroke="#dce4dd"
              strokeWidth="0.6"
            />
          </pattern>
          <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6c9b78" stopOpacity=".22" />
            <stop offset="100%" stopColor="#6c9b78" stopOpacity=".05" />
          </linearGradient>
        </defs>
        <rect width="490" height="310" fill="url(#grid)" />
        <path
          d="M64 250 H454 M100 280 V24"
          fill="none"
          stroke="#9eafa2"
          strokeWidth="1"
        />
        <path d="M450 247l5 3-5 3M97 29l3-6 3 6" fill="none" stroke="#9eafa2" />
        <path
          d="M164 250 V235 C228 207 242 130 326 111 V250Z"
          fill="url(#area)"
        />
        <path
          d="M47 262 C105 255 128 254 164 235 C228 207 242 130 326 111 S398 91 447 34"
          fill="none"
          stroke="#315c42"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M160 275L331 86"
          stroke="#95ac88"
          strokeWidth="1.3"
          strokeDasharray="5 5"
        />
        <path d="M246 250V166" stroke="#96a996" strokeDasharray="3 4" />
        <circle
          cx="246"
          cy="166"
          r="5"
          fill="#fbfcf8"
          stroke="#315c42"
          strokeWidth="2"
        />
        <circle cx="164" cy="235" r="3.3" fill="#315c42" />
        <circle cx="326" cy="111" r="3.3" fill="#315c42" />
        <g
          fill="#7c8c7d"
          fontFamily="Georgia,serif"
          fontSize="13"
          fontStyle="italic"
        >
          <text x="459" y="268">
            x
          </text>
          <text x="83" y="22">
            y
          </text>
          <text x="83" y="268">
            O
          </text>
          <text x="160" y="269">
            a
          </text>
          <text x="324" y="269">
            b
          </text>
          <text x="359" y="79" fill="#315c42" fontSize="18">
            f(x)
          </text>
          <text x="260" y="154">
            f′(x)
          </text>
        </g>
      </svg>
      <div className="graph-equation">
        <MathText>{String.raw`\int_a^b f(x)\,dx`}</MathText>
        <span>変化を知り、積み重ねる。</span>
      </div>
      <span className="graph-index">FIG. 01 — A CONTINUOUS JOURNEY</span>
    </div>
  );
}

function Dashboard({
  user,
  stats,
  problems,
  date,
  loading,
  error,
  onSolve,
  onNavigate,
  onRetry,
}: {
  user: User | null;
  stats: Stats;
  problems: Problem[];
  date: string;
  loading: boolean;
  error: string;
  onSolve: (p: Problem) => void;
  onNavigate: (p: Page) => void;
  onRetry: () => void;
}) {
  const dailyRef = useRef<HTMLElement>(null);
  const dateObj = new Date(`${date}T12:00:00+09:00`);
  const enDate = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Tokyo",
  })
    .format(dateObj)
    .toUpperCase();
  const complete = problems.filter((p) =>
    stats.solvedIds.includes(p.id),
  ).length;
  return (
    <div className="dashboard">
      <div className="dashboard-heading">
        <div>
          <div className="eyebrow">
            <span className="small-green-dash" />
            {enDate}
          </div>
          <h1>
            {user
              ? `${user.username}さん、今日も一歩。`
              : "日々、思考を積み重ねる。"}
          </h1>
        </div>
        <div className="edition">
          <span>YOUR DAILY MATHEMATICS</span>
          <strong>
            {String(dateObj.getFullYear())}
            <span> / </span>
            {String(dateObj.getMonth() + 1).padStart(2, "0")}
          </strong>
        </div>
      </div>
      <section className="hero surface">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span /> A SMALL PRACTICE. A BIG DIFFERENCE.
          </span>
          <h2>
            その一歩が、
            <br />
            未来の<span className="underlined">曲線</span>を描く。
          </h2>
          <p>
            微分する。積分する。考える。
            <br />
            1日ひと問からはじまる、あなたと数学の新しい習慣。
          </p>
          <button
            className="button button-primary"
            onClick={() =>
              dailyRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
            }
          >
            今日の問題を解く
            <ArrowRight size={17} />
          </button>
          <span className="hero-footnote">
            正解よりも、考えた時間があなたの力に。
          </span>
        </div>
        <CalculusGraph />
      </section>
      <div className="stats-strip surface">
        <div className="stat-item">
          <span className="stat-icon">
            <ChartNoAxesColumnIncreasing size={19} />
          </span>
          <div>
            <span className="stat-label">積み重ねたポイント</span>
            <strong>
              {stats.totalPoints}
              <small>pt</small>
            </strong>
          </div>
          <span className="stat-note">TOTAL POINTS</span>
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
          <span className="stat-note">KEEP GOING</span>
        </div>
        <div className="stat-item">
          <span className="stat-icon">
            <CheckCircle2 size={19} />
          </span>
          <div>
            <span className="stat-label">解いた問題</span>
            <strong>
              {stats.solvedCount}
              <small>問</small>
            </strong>
          </div>
          <span className="stat-note">ONE BY ONE</span>
        </div>
      </div>
      <section className="daily-section" ref={dailyRef}>
        <div className="section-heading">
          <div className="section-title">
            <span className="section-number">01</span>
            <h2>今日の微積</h2>
            <span className="section-description">
              今日のあなたに、ちょうどいい挑戦を。
            </span>
          </div>
          <span className="daily-update">
            <span className="online-dot" />
            毎日 0:00 更新 <span className="jst">JST</span>
          </span>
        </div>
        {error ? (
          <div className="surface error-state">
            <p>{error}</p>
            <button className="button button-secondary" onClick={onRetry}>
              もう一度読み込む
            </button>
          </div>
        ) : loading ? (
          <div className="loading-state">
            <LoaderCircle className="spin" size={22} />
            今日の問題を準備しています
          </div>
        ) : (
          <div className="problem-grid">
            {problems.map((p, i) => {
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
                  <div className="problem-category">
                    {String(i + 1).padStart(2, "0")} <span>/</span>{" "}
                    {meta.english}
                  </div>
                  <div className="problem-formula">
                    <MathText display>
                      {p.formula.split(String.raw`\quad`)[0]}
                    </MathText>
                  </div>
                  <div className="problem-topic">{p.topic}</div>
                  <h3>{p.title}</h3>
                  <p>{meta.description}</p>
                  <div className="problem-card-bottom">
                    <span>
                      {done ? (
                        <>
                          <Check size={14} />
                          クリア済み
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
          <span>{todayLabel(date)}</span>
          <span>
            {complete > 0
              ? `今日の達成 ${complete} / 3 問`
              : "まずは1問。自分のペースで。"}
          </span>
        </div>
      </section>
      <div className="dashboard-bottom">
        <section className="progress-preview surface">
          <div className="preview-heading">
            <div>
              <span className="eyebrow">LITTLE BY LITTLE</span>
              <h2>学びのあしあと</h2>
            </div>
            <button
              className="text-link"
              onClick={() => onNavigate("calendar")}
            >
              カレンダーを見る
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="activity-month">
            <strong>
              {dateObj.getMonth() + 1}
              <span>月の積み重ね</span>
            </strong>
            <span>
              {
                stats.activity.filter((a) =>
                  a.date.startsWith(date.slice(0, 7)),
                ).length
              }{" "}
              <small>days</small>
            </span>
          </div>
          <MiniCalendar stats={stats} date={date} />
          <div className="activity-legend">
            <span>今日の1問が、明日の自分につながる。</span>
            <span>
              少<em />
              <em />
              <em />
              <em />多
            </span>
          </div>
        </section>
        <section className="notebook-preview surface">
          <div className="preview-heading">
            <div>
              <span className="eyebrow">BACK TO BASICS</span>
              <h2>微積のノート</h2>
            </div>
            <span className="notebook-icon">
              <BookOpen size={20} strokeWidth={1.5} />
            </span>
          </div>
          <div className="notebook-body">
            <span className="note-tag">
              NOTE 01 <span>微分のきほん</span>
            </span>
            <h3>「変化の瞬間」を、とらえる。</h3>
            <p>
              微分は、ある瞬間の変化の速さ。
              <br />
              曲線にそっと引いた接線が、教えてくれます。
            </p>
            <div className="notebook-formula">
              <MathText>{String.raw`f'(x)=\lim_{h\to 0}\frac{f(x+h)-f(x)}{h}`}</MathText>
            </div>
          </div>
          <button
            className="text-link notebook-link"
            onClick={() => onNavigate("knowledge")}
          >
            基本から読み直す
            <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <div className="ranking-banner">
        <span className="ranking-banner-icon">
          <Trophy size={20} strokeWidth={1.4} />
        </span>
        <div>
          <strong>仲間の積み重ねを、刺激に。</strong>
          <span>基礎 1pt・応用 3pt・難関 5pt。小さな挑戦をランキングに。</span>
        </div>
        <button className="text-link" onClick={() => onNavigate("ranking")}>
          ランキングを見る
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
function MiniCalendar({ stats, date }: { stats: Stats; date: string }) {
  const year = Number(date.slice(0, 4)),
    month = Number(date.slice(5, 7));
  const days = new Date(year, month, 0).getDate();
  const start = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  return (
    <div className="mini-calendar">
      {["月", "火", "水", "木", "金", "土", "日"].map((d) => (
        <span className="mini-day-label" key={d}>
          {d}
        </span>
      ))}
      {Array.from({ length: start }, (_, i) => (
        <span key={`blank-${i}`} />
      ))}
      {Array.from({ length: days }, (_, i) => {
        const key = `${date.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`;
        const a = stats.activity.find((a) => a.date === key);
        return (
          <span
            key={key}
            title={`${key}：${a?.count || 0}問正解`}
            className={`mini-day intensity-${a ? Math.min(a.count, 3) : 0} ${key === date ? "is-today" : ""} ${key > date ? "future" : ""}`}
          >
            {i + 1}
          </span>
        );
      })}
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
        <div className="eyebrow">YOUR OWN LITTLE ROUTINE</div>
        <h2 id="auth-title">
          {mode === "register"
            ? "学びを、あなたの記録に。"
            : "おかえりなさい。"}
        </h2>
        <p className="auth-intro">
          ひと問ずつの積み重ねを、ずっと。
          <br />
          カレンダーとランキングで、成長を楽しもう。
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
                {mode === "register" ? "今日から、はじめる" : "ログインする"}
                <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
        <p className="auth-bottom-note">
          {mode === "register"
            ? "ユーザーネームとパスワードは大切に保管してください。"
            : "また今日も、あなたのペースで。"}
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
            {p.date === jstToday() ? "TODAY’S CALCULUS" : "FROM THE ARCHIVE"}
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
                {hint ? "ヒントを閉じる" : "ちょっとヒントを見る"}
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
                <h3>
                  {result.correct
                    ? "正解。ひとつ、積み重なりました。"
                    : "なるほど、を持ち帰ろう。"}
                </h3>
                {result.pointsEarned > 0 && (
                  <span>+{result.pointsEarned} pt</span>
                )}
              </div>
              {!result.correct && (
                <p>
                  正解は {String.fromCharCode(65 + result.correctIndex)}{" "}
                  です。解き方を一緒に振り返りましょう。
                </p>
              )}
              <div className="explanation">
                <span className="eyebrow">THE WAY TO THE ANSWER</span>
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
                  アカウントを作って、学びを記録
                  <ArrowRight size={17} />
                </button>
              ) : (
                <button
                  className="button button-primary answer-submit"
                  onClick={onClose}
                >
                  今日のページに戻る
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
