import type { ScoringStatus } from "../../shared/types";
import "../scoring.css";

function freezeDateLabel(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map(({ type, value: part }) => [type, part]),
  );
  return `${parts.month}月${parts.day}日${Number(parts.hour)}:${parts.minute}`;
}

export function ScoringNotice({
  status,
  awardBlocked = false,
  paused = false,
  frozenAt,
  awardPaused = false,
}: {
  status?: ScoringStatus;
  awardBlocked?: boolean;
  paused?: boolean;
  frozenAt?: string | null;
  awardPaused?: boolean;
}) {
  if (paused || awardPaused) {
    const freezeDate = freezeDateLabel(frozenAt);
    return (
      <div
        className="scoring-notice scoring-paused"
        role="status"
        aria-atomic="true"
      >
        <strong>加点を停止しています</strong>
        <p>
          {freezeDate
            ? `獲得額は${freezeDate}時点の値に固定しています。`
            : "新しく正解しても加算されません。"}
        </p>
        {awardPaused && (
          <p className="scoring-award-paused">
            正解です。現在は加点停止中のため、轟は加算されません。
          </p>
        )}
      </div>
    );
  }
  if (!status?.locked && !awardBlocked) return null;

  const required = status?.requiredCorrectStreak ?? 3;
  const streak = Math.max(0, Math.min(required, status?.correctStreak ?? 0));
  const remaining = required - streak;

  return (
    <div className="scoring-notice" role="status" aria-atomic="true">
      {status?.locked && (
        <>
          <strong>加点再開まで、あと{remaining}問連続正解</strong>
          <p className="scoring-progress">
            連続正解 {streak} / {required}
          </p>
        </>
      )}
      {awardBlocked && (
        <p className="scoring-award-blocked">
          正解ですが、3連続正解に届いていないため今回は加点されません。
        </p>
      )}
    </div>
  );
}
