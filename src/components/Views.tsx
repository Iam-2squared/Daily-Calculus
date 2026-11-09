import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Flame,
  LogOut,
  Medal,
  Search,
  Sprout,
  Trash2,
  Trophy,
  UserRound,
} from "lucide-react";
import type {
  Leaderboard,
  Level,
  Problem,
  Stats,
  User,
} from "../../shared/types";
import { DAILY_CATEGORIES, LEVELS } from "../../shared/types";
import { api } from "../api";
import { compactPointIncome, formatPointIncome } from "../../shared/currency";
import { KgsLinkPanel } from "./KgsLinkPanel";
import { lessons } from "../lessons";
import { MathText } from "./Math";
import { POINT_COLORS, pointColor, pointRange } from "../activityColors";
import "../views.css";

function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading secondary-page-heading">
      <div>
        <h1>{title}</h1>
        <p className="view-intro">{description}</p>
      </div>
    </header>
  );
}
function EmptyState({
  icon: Icon = Sprout,
  title,
  description,
  children,
}: {
  icon?: typeof Sprout;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="view-empty">
      <span className="empty-emblem">
        <Icon size={27} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
function Failure({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="view-failure" role="alert">
      <p>{message}</p>
      <button className="text-button" onClick={onRetry}>
        もう一度読み込む <ArrowRight size={15} />
      </button>
    </div>
  );
}
function dateLabel(date: string, year = false) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "UTC",
    ...(year ? { year: "numeric" as const } : {}),
    month: "long",
    day: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}
function todayKey() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function RankingView({
  user,
  onAccount,
  scoringPaused = false,
}: {
  user: User | null;
  onAccount: () => void;
  scoringPaused?: boolean;
}) {
  const [period, setPeriod] = useState<"all" | "week">("all");
  const [ranking, setRanking] = useState<Leaderboard | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    setRanking(null);
    setError("");
    api
      .rankings(period)
      .then((data) => {
        if (active) setRanking(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [period, revision, user?.id]);
  return (
    <div className="secondary-view">
      <PageHeading
        title="ランキング"
        description="今日の微積の総合・週間の上位25名と自分の順位を表示します。"
      />
      <div className="ranking-layout">
        <section className="surface ranking-surface">
          <div className="ranking-toolbar">
            <div className="segmented-control" aria-label="ランキングの期間">
              <button
                className={period === "all" ? "active" : ""}
                onClick={() => setPeriod("all")}
              >
                総合ランキング
              </button>
              <button
                className={period === "week" ? "active" : ""}
                onClick={() => setPeriod("week")}
              >
                週間ランキング
              </button>
            </div>
            <span className="ranking-top-label">上位25名</span>
          </div>
          <div className="ranking-caption">
            <span>
              {period === "all"
                ? "累計取得額"
                : ranking
                  ? `${dateLabel(ranking.weekStart)}（月）からの獲得額`
                  : "今週の獲得額"}
            </span>
            <span>
              {ranking ? `${ranking.totalUsers} 人が参加中` : "読み込み中…"}
            </span>
          </div>
          {error ? (
            <Failure
              message={error}
              onRetry={() => setRevision((v) => v + 1)}
            />
          ) : !ranking ? (
            <div className="view-loading" role="status">
              ランキングを読み込んでいます…
            </div>
          ) : ranking.entries.length === 0 ? (
            <EmptyState
              icon={Trophy}
              title="ランキングデータがありません"
              description="アカウントを作成すると、ランキングに参加できます。"
            />
          ) : (
            <div className="ranking-table-wrap">
              <table className="ranking-table">
                <thead>
                  <tr>
                    <th>順位</th>
                    <th>ユーザーネーム</th>
                    <th>取得額</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.entries.map((entry) => (
                    <tr
                      key={entry.username}
                      className={entry.isYou ? "ranking-you" : ""}
                    >
                      <td>
                        <span className={`rank-number rank-${entry.rank}`}>
                          {entry.rank <= 3 ? <Medal size={17} /> : null}
                          {String(entry.rank).padStart(2, "0")}
                        </span>
                      </td>
                      <td>
                        <span className="ranking-avatar">
                          {entry.username.slice(0, 1)}
                        </span>
                        <span>{entry.username}</span>
                        {entry.isYou && (
                          <span className="you-label">あなた</span>
                        )}
                      </td>
                      <td>
                        {formatPointIncome(entry.points)}
                        <small>轟</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {ranking?.me && (
            <div className="personal-rank">
              <span className="personal-rank-position">
                {ranking.me.rank}
                <small>位</small>
              </span>
              <div>
                <strong>{ranking.me.username}</strong>
                <span>あなたの{period === "all" ? "総合" : "週間"}順位</span>
              </div>
              <strong>
                {formatPointIncome(ranking.me.points)} <small>轟</small>
              </strong>
            </div>
          )}
          {ranking && !ranking.me && user && (
            <div className="ranking-not-yet">
              <Sprout size={17} />
              <p>
                {scoringPaused
                  ? "まだ順位はありません。現在は加点を停止しています。"
                  : "まだ順位はありません。加点条件を満たした正解がランキングに反映されます。"}
              </p>
            </div>
          )}
        </section>
        <aside className="ranking-aside">
          <div className="points-guide surface">
            <h2>{scoringPaused ? "加点停止中" : "獲得額"}</h2>
            {scoringPaused ? (
              <p className="rule-footnote">
                新しく正解しても轟は加算されません。
              </p>
            ) : (
              <>
                <div className="point-rules">
                  {(Object.keys(LEVELS) as Level[]).map((level) => (
                    <div key={level}>
                      <span className={`level-dot ${level}`} />
                      <span>{LEVELS[level].name}</span>
                      <strong>
                        +{formatPointIncome(LEVELS[level].points)}
                        <small>轟</small>
                      </strong>
                    </div>
                  ))}
                </div>
                <p className="rule-footnote">
                  同じ問題への加点は1回のみ。一度間違えた問題は、その日は加点されません。過去問も加点条件の対象です。
                </p>
              </>
            )}
          </div>
          {!user && (
            <button
              className="button button-primary ranking-join"
              onClick={onAccount}
            >
              登録・ログイン <ArrowRight size={16} />
            </button>
          )}
          <p className="ranking-explainer">
            週間ランキングは毎週月曜日
            0:00（日本時間）に切り替わります。25位より下の場合も、あなた自身の順位を確認できます。
          </p>
        </aside>
      </div>
    </div>
  );
}

export function KnowledgeView() {
  const [selected, setSelected] = useState<string | null>(null);
  const [category, setCategory] = useState("すべて");
  const categories = ["すべて", ...new Set(lessons.map((l) => l.category))];
  const lesson = lessons.find((l) => l.id === selected);
  useEffect(() => {
    if (selected) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [selected]);
  if (lesson)
    return (
      <div className="secondary-view">
        <button
          className="text-button knowledge-back"
          onClick={() => setSelected(null)}
        >
          <ArrowLeft size={16} /> 基本知識の一覧へ
        </button>
        <article className="lesson-article surface">
          <div className="lesson-article-heading">
            <span className="eyebrow">{lesson.category}</span>
            <h1>{lesson.title}</h1>
            <p>{lesson.description}</p>
          </div>
          <div className="lesson-main-formula">
            <MathText display>{lesson.formula}</MathText>
          </div>
          {lesson.content.map((part, index) => (
            <section key={index} className="lesson-section">
              <span className="lesson-section-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{part.title}</h2>
                <p>{part.text}</p>
                {part.formula && (
                  <div className="lesson-step-formula">
                    <MathText display>{part.formula}</MathText>
                  </div>
                )}
              </div>
            </section>
          ))}
        </article>
      </div>
    );
  return (
    <div className="secondary-view">
      <PageHeading
        title="微積の基本知識"
        description="微分・積分の公式と解説を確認できます。"
      />
      <div className="view-filter-row">
        <div className="filter-pills" aria-label="知識のカテゴリ">
          {categories.map((c) => (
            <button
              key={c}
              className={category === c ? "active" : ""}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <span className="muted">
          {
            lessons.filter(
              (l) => category === "すべて" || l.category === category,
            ).length
          }{" "}
          項目
        </span>
      </div>
      <div className="lesson-grid">
        {lessons
          .filter((l) => category === "すべて" || l.category === category)
          .map((l, index) => (
            <button
              className="lesson-card surface"
              key={l.id}
              onClick={() => setSelected(l.id)}
            >
              <div className="lesson-card-top">
                <span>{l.category}</span>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </div>
              <div className="lesson-card-formula">
                <MathText display>{l.formula}</MathText>
              </div>
              <h2>{l.title}</h2>
              <p>{l.description}</p>
              <div className="lesson-card-footer">
                <span>解説を見る</span>
                <ArrowRight size={17} />
              </div>
            </button>
          ))}
      </div>
    </div>
  );
}

export function CalendarView({
  stats,
  embedded = false,
}: {
  stats: Stats;
  embedded?: boolean;
}) {
  const today = todayKey();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  const daysInMonth = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const offset = (monthStart.getUTCDay() + 6) % 7;
  const monthActivity = stats.activity.filter(
    (a) => a.date.startsWith(month) && a.date <= today,
  );
  const currentActivity = stats.activity.find((a) => a.date === selected);
  const currentColor = pointColor(currentActivity?.points ?? 0);
  const monthSolved = monthActivity.reduce((sum, a) => sum + a.count, 0);
  const monthPoints = monthActivity.reduce((sum, a) => sum + a.points, 0);
  const shiftMonth = (delta: number) => {
    const d = new Date(
      Date.UTC(
        monthStart.getUTCFullYear(),
        monthStart.getUTCMonth() + delta,
        1,
      ),
    );
    setMonth(d.toISOString().slice(0, 7));
    setSelected(d.toISOString().slice(0, 10));
  };
  return (
    <div
      id="learning-calendar"
      className={`secondary-view point-calendar ${embedded ? "embedded-calendar" : ""}`}
    >
      {!embedded && (
        <>
          <PageHeading
            title="学習カレンダー"
            description="日ごとの獲得額に応じて、カレンダーが11色に変わります。"
          />
          <div className="calendar-summary">
            <div className="surface calendar-stat">
              <span>
                <Flame size={18} /> 連続学習
              </span>
              <strong>
                {stats.streak}
                <small>日</small>
              </strong>
              <p>正解した日が対象</p>
            </div>
            <div className="surface calendar-stat">
              <span>
                <CheckCircle2 size={18} /> 今月の正解
              </span>
              <strong>
                {monthSolved}
                <small>問</small>
              </strong>
              <p>学習日数：{monthActivity.length} 日</p>
            </div>
            <div className="surface calendar-stat">
              <span>
                <Sprout size={18} /> 今月の獲得額
              </span>
              <strong>
                {formatPointIncome(monthPoints)}
                <small>轟</small>
              </strong>
              <p>獲得した轟の合計</p>
            </div>
          </div>
        </>
      )}
      <div className="calendar-detail-layout">
        <section className="surface full-calendar">
          <div className="full-calendar-header">
            <div>
              <h2>
                {monthStart.getUTCFullYear()}
                <span>年</span> {monthStart.getUTCMonth() + 1}
                <span>月</span>
              </h2>
            </div>
            <div className="calendar-nav">
              <button onClick={() => shiftMonth(-1)} aria-label="前の月">
                <ChevronLeft size={18} />
              </button>
              <button
                className="calendar-today"
                onClick={() => {
                  setMonth(today.slice(0, 7));
                  setSelected(today);
                }}
              >
                今月
              </button>
              <button
                onClick={() => shiftMonth(1)}
                disabled={month >= today.slice(0, 7)}
                aria-label="次の月"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
          <div className="full-calendar-grid">
            {["月", "火", "水", "木", "金", "土", "日"].map((day) => (
              <div key={day} className="calendar-weekday">
                {day}
              </div>
            ))}
            {Array.from({ length: offset }, (_, i) => (
              <div key={`blank-${i}`} className="calendar-blank" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const activity =
                date <= today
                  ? stats.activity.find((a) => a.date === date)
                  : undefined;
              const tier = pointColor(activity?.points ?? 0);
              return (
                <button
                  key={date}
                  onClick={() => setSelected(date)}
                  disabled={date > today}
                  className={`calendar-day ${date === selected ? "selected" : ""} ${date === today ? "today" : ""} ${tier ? "has-activity has-points" : ""}`}
                  style={
                    tier
                      ? {
                          backgroundColor: tier.color,
                          color: tier.foreground,
                          borderColor: tier.color,
                        }
                      : undefined
                  }
                  aria-label={`${dateLabel(date)} ${activity ? `${activity.count}問正解、${formatPointIncome(activity.points)}轟${tier ? `、${tier.name}` : ""}` : "学習記録なし、0轟"}`}
                  aria-pressed={date === selected}
                  aria-current={date === today ? "date" : undefined}
                  title={
                    activity
                      ? `${formatPointIncome(activity.points)}轟・${activity.count}問正解`
                      : "学習記録なし"
                  }
                >
                  <span>{i + 1}</span>
                  {tier && activity ? (
                    <span className="calendar-day-points">
                      {compactPointIncome(activity.points)}
                      <span>轟</span>
                    </span>
                  ) : (
                    <span className="day-placeholder" />
                  )}
                  {date === today && <small>今日</small>}
                </button>
              );
            })}
          </div>
          <div className="point-calendar-legend" aria-label="1日の獲得額と色">
            <p>1日の獲得額</p>
            <div className="point-calendar-colors">
              <span className="point-legend-chip">
                <i className="point-swatch-empty" />
                <span>0轟</span>
              </span>
              {POINT_COLORS.map((tier, index) => (
                <span
                  className="point-legend-chip"
                  key={tier.min}
                  title={`${tier.name}：${pointRange(index)}`}
                >
                  <i
                    style={{ backgroundColor: tier.color }}
                    aria-hidden="true"
                  />
                  <span>{pointRange(index)}</span>
                </span>
              ))}
            </div>
          </div>
        </section>
        <aside className="surface selected-day-detail">
          <p className="eyebrow">選択日の記録</p>
          <h2>{dateLabel(selected)}</h2>
          <span className="selected-date-weekday">
            {new Intl.DateTimeFormat("ja-JP", {
              weekday: "long",
              timeZone: "UTC",
            }).format(new Date(`${selected}T00:00:00Z`))}
          </span>
          {currentActivity ? (
            <>
              <span
                className="selected-day-emblem"
                style={
                  currentColor
                    ? {
                        backgroundColor: currentColor.color,
                        color: currentColor.foreground,
                      }
                    : undefined
                }
              >
                <CheckCircle2 size={39} strokeWidth={1.3} />
              </span>
              <h3>学習済み</h3>
              <p>この日は {currentActivity.count} 問に正解しました。</p>
              <div
                className="selected-day-points point-calendar-badge"
                style={
                  currentColor
                    ? {
                        backgroundColor: currentColor.color,
                        color: currentColor.foreground,
                      }
                    : undefined
                }
              >
                +{formatPointIncome(currentActivity.points)}
                <small>轟</small>
              </div>
              {currentColor && (
                <span className="selected-day-color">
                  この日の色：{currentColor.name}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="selected-day-emblem">
                <Sprout size={39} strokeWidth={1.3} />
              </span>
              <h3>学習記録なし</h3>
              <p>
                {selected === today
                  ? "問題に正解すると、この日に学習記録がつきます。"
                  : "この日の正解記録はありません。"}
              </p>
            </>
          )}
          <div className="day-detail-note">
            色は、その日に獲得した轟で決まります。
            <br />
            日付の切り替わりは日本時間 0:00 です。
          </div>
        </aside>
      </div>
    </div>
  );
}

export function ArchiveView({
  stats,
  onSolve,
}: {
  stats: Stats;
  onSolve: (problem: Problem) => void;
}) {
  const scoringPaused = stats.scoringPaused === true;
  const [level, setLevel] = useState<"all" | Level>("all");
  const [status, setStatus] = useState("all");
  const [problems, setProblems] = useState<Problem[] | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setProblems(null);
    setError("");
    api
      .archive()
      .then((data) => {
        if (active) setProblems(data.problems);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  const filtered =
    problems?.filter(
      (p) =>
        (level === "all" || p.level === level) &&
        (status === "all" ||
          (status === "solved"
            ? stats.solvedIds.includes(p.rewardId ?? p.id)
            : !stats.solvedIds.includes(p.rewardId ?? p.id))),
    ) || [];
  const pages = Math.ceil(filtered.length / 6);
  return (
    <div className="secondary-view">
      <PageHeading
        title="過去問"
        description="過去30日分の問題を選んで解けます。"
      />
      <div className="archive-topline surface">
        <div>
          <BookOpen size={22} strokeWidth={1.4} />
          <p>{scoringPaused ? "過去問の学習" : "過去問の報酬"}</p>
        </div>
        <span>
          {scoringPaused
            ? "加点停止中です。新しく正解しても轟は加算されません。"
            : "加点条件を満たすと、今日の取得額に反映されます。一度間違えた問題は、その日は加点されません。"}
        </span>
      </div>
      <div className="view-filter-row archive-filters">
        <div className="filter-pills" aria-label="過去問の難易度">
          {(["all", "basic", "applied", "advanced"] as const).map((l) => (
            <button
              key={l}
              className={level === l ? "active" : ""}
              onClick={() => {
                setLevel(l);
                setPage(1);
              }}
            >
              {l === "all" ? "すべて" : LEVELS[l].name}
              {l !== "all" && !scoringPaused && (
                <small>+{formatPointIncome(LEVELS[l].points)}轟</small>
              )}
            </button>
          ))}
        </div>
        <label className="archive-status-label">
          <span>学習状況</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">すべて</option>
            <option value="unsolved">未正解</option>
            <option value="solved">正解済み</option>
          </select>
        </label>
      </div>
      {error ? (
        <Failure message={error} onRetry={() => setRevision((v) => v + 1)} />
      ) : !problems ? (
        <div className="view-loading" role="status">
          過去問を読み込んでいます…
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Search}
            title="該当する問題はありません。"
            description="難易度や学習状況の条件を変更してください。"
          />
        </div>
      ) : (
        <>
          <p className="archive-result-count">
            {filtered.length} 問 <span>— 日付の新しい順</span>
          </p>
          <div className="archive-grid">
            {filtered.slice((page - 1) * 6, page * 6).map((p) => (
              <button
                className="surface archive-card"
                key={p.id}
                onClick={() => onSolve(p)}
              >
                <div className="archive-card-top">
                  <span className={`archive-level ${p.level}`}>
                    {p.dailyCategory && "難易度："}
                    {LEVELS[p.level].name}
                    {!scoringPaused && (
                      <small>
                        {stats.solvedIds.includes(p.rewardId ?? p.id)
                          ? "加点なし"
                          : stats.wrongTodayIds?.includes(p.rewardId ?? p.id)
                            ? "今日は加点なし"
                            : `+${formatPointIncome(LEVELS[p.level].points)}轟`}
                      </small>
                    )}
                  </span>
                  <span>{dateLabel(p.date)}</span>
                </div>
                {p.dailyCategory && (
                  <p className="archive-daily-category">
                    {DAILY_CATEGORIES[p.dailyCategory]}
                  </p>
                )}
                <div className="archive-card-formula">
                  <MathText display>{p.formula}</MathText>
                </div>
                <span className="archive-topic">{p.topic}</span>
                <h2>{p.title}</h2>
                <div className="archive-card-bottom">
                  <span
                    className={
                      stats.solvedIds.includes(p.rewardId ?? p.id)
                        ? "archive-solved"
                        : ""
                    }
                  >
                    {stats.solvedIds.includes(p.rewardId ?? p.id) ? (
                      <>
                        <CheckCircle2 size={15} /> 正解済み
                      </>
                    ) : (
                      <>約 {p.estimatedMinutes} 分</>
                    )}
                  </span>
                  <span>
                    解く <ArrowRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {pages > 1 && (
            <div className="archive-pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage((v) => v - 1)}
                aria-label="前のページ"
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {page} <small>/ {pages}</small>
              </span>
              <button
                disabled={page === pages}
                onClick={() => setPage((v) => v + 1)}
                aria-label="次のページ"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AccountView({
  user,
  stats,
  onAccount,
  onLogout,
  onDeleteAccount,
}: {
  user: User | null;
  stats: Stats;
  onAccount: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
}) {
  return (
    <div className="secondary-view">
      <PageHeading
        title="アカウント"
        description="ユーザー情報と学習記録を確認できます。"
      />
      {!user ? (
        <section className="surface account-guest">
          <h2>ログインしていません</h2>
          <p>
            ユーザーネームと4桁の数字パスワードで登録・ログインできます。
            <br />
            {stats.scoringPaused
              ? "ログインすると、学習記録が保存されます。"
              : "ログインすると、学習記録と轟が保存されます。"}
          </p>
          <div className="account-removal-notice" role="note">
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              ログアウトすると、今日の微積のアカウント・学習記録が削除されます。連携済みの轟と連携履歴はKGS11thに残ります。削除後は元に戻せません。
            </p>
          </div>
          <button className="button button-primary" onClick={onAccount}>
            登録・ログイン <ArrowRight size={17} />
          </button>
          <small>問題と基本知識は、登録なしでも利用できます。</small>
        </section>
      ) : (
        <>
          <section className="surface account-profile">
            <div className="account-profile-main">
              <span className="account-avatar">
                {user.username.slice(0, 1)}
              </span>
              <div>
                <p className="eyebrow">ユーザーネーム</p>
                <h2>{user.username}</h2>
                <p>
                  {new Intl.DateTimeFormat("ja-JP", {
                    timeZone: "Asia/Tokyo",
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(new Date(user.createdAt))}{" "}
                  登録
                </p>
              </div>
            </div>
            <button
              type="button"
              className="text-button logout-button"
              onClick={onLogout}
              aria-describedby="account-logout-warning"
            >
              <LogOut size={16} /> 削除してログアウト
            </button>
          </section>
          <div
            className="account-removal-notice"
            id="account-logout-warning"
            role="note"
          >
            <AlertTriangle size={18} aria-hidden="true" />
            <p>
              ログアウトすると、今日の微積のアカウント・学習記録が削除されます。連携済みの轟と連携履歴はKGS11thに残ります。削除後は元に戻せません。
            </p>
          </div>
          <KgsLinkPanel key={user.id} />
          <div className="account-stats">
            <div className="surface">
              <Trophy size={21} strokeWidth={1.5} />
              <span>総取得（微積）</span>
              <strong>
                {formatPointIncome(stats.totalPoints)}
                <small>轟</small>
              </strong>
            </div>
            <div className="surface">
              <CheckCircle2 size={21} strokeWidth={1.5} />
              <span>正解した問題</span>
              <strong>
                {stats.solvedCount.toLocaleString()}
                <small>問</small>
              </strong>
            </div>
            <div className="surface">
              <Flame size={21} strokeWidth={1.5} />
              <span>連続学習</span>
              <strong>
                {stats.streak}
                <small>日</small>
              </strong>
            </div>
          </div>
          <section className="surface account-levels">
            <div>
              <h2>難易度別の正解数</h2>
            </div>
            <div className="account-level-list">
              {(Object.keys(LEVELS) as Level[]).map((level) => (
                <div key={level}>
                  <span className={`level-dot ${level}`} />
                  <span>{LEVELS[level].name}</span>
                  <span className="account-level-track">
                    <i
                      style={{
                        width: `${stats.solvedCount ? (stats.levelCounts[level] / stats.solvedCount) * 100 : 0}%`,
                      }}
                    />
                  </span>
                  <strong>
                    {stats.levelCounts[level]}
                    <small>問</small>
                  </strong>
                </div>
              ))}
            </div>
          </section>
          <div className="account-small-note">
            <UserRound size={18} />
            <p>
              ログインには、登録したユーザーネームと4桁の数字パスワードを使います。学習記録はこのアカウントに保存されます。
            </p>
          </div>
          <section
            className="surface account-delete-section"
            aria-labelledby="account-delete-heading"
          >
            <div>
              <h2 id="account-delete-heading">アカウントの削除</h2>
              <p id="account-delete-description">
                今日の微積のアカウント・学習記録を削除します。連携済みの轟と連携履歴はKGS11thに残ります。削除後は元に戻せません。
              </p>
            </div>
            <button
              type="button"
              className="account-delete-button"
              onClick={onDeleteAccount}
              aria-describedby="account-delete-description"
            >
              <Trash2 size={17} aria-hidden="true" />
              アカウントを削除
            </button>
          </section>
        </>
      )}
    </div>
  );
}
