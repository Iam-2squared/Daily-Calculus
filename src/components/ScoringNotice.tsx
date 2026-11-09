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
  wrongDayBlocked = false,
  answerCorrect = false,
  awardDuplicate = false,
  awardUnavailable = false,
}: {
  status?: ScoringStatus;
  awardBlocked?: boolean;
  paused?: boolean;
  frozenAt?: string | null;
  awardPaused?: boolean;
  wrongDayBlocked?: boolean;
  awardPending?: boolean;
  answerCorrect?: boolean;
  awardDuplicate?: boolean;
  awardUnavailable?: boolean;
}) {
  const duplicateNotice = awardDuplicate ? (
    <p className="scoring-duplicate">
      この問題は今日すでに回答したため、今回は加点されません。
    </p>
  ) : null;
  const unavailableNotice = awardUnavailable ? (
    <p className="scoring-unavailable">
      出題方式を更新しました。新しい問題で挑戦してください。
    </p>
  ) : null;
  const wrongDayNotice = wrongDayBlocked ? (
    <div className="scoring-wrong-day">
      <p className="scoring-wrong-day-message">
        {answerCorrect
          ? "正解です。この問題は今日すでに間違えたため、轟は加算されません。"
          : "この問題は今日は加点されません。"}
      </p>
    </div>
  ) : null;
  const recordedNotice =
    awardPaused || awardBlocked || (wrongDayBlocked && answerCorrect) ? (
      <p className="scoring-recorded">
        この問題を今日解き直しても加点されません。
      </p>
    ) : null;
  const nextDayNotice =
    !awardUnavailable &&
    (wrongDayBlocked || awardDuplicate || recordedNotice) ? (
      <p className="scoring-next-day">
        翌日（日本時間0:00以降）は、通常の加点条件が適用されます。
      </p>
    ) : null;
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
        {wrongDayNotice}
        {recordedNotice}
        {duplicateNotice}
        {unavailableNotice}
        {nextDayNotice}
      </div>
    );
  }
  if (
    !status?.locked &&
    !awardBlocked &&
    !wrongDayBlocked &&
    !awardDuplicate &&
    !awardUnavailable
  )
    return null;

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
          <p>その日に未回答の別々の問題が対象です。</p>
        </>
      )}
      {awardBlocked && (
        <p className="scoring-award-blocked">
          正解ですが、3連続正解に届いていないため今回は加点されません。
        </p>
      )}
      {wrongDayNotice}
      {recordedNotice}
      {duplicateNotice}
      {unavailableNotice}
      {nextDayNotice}
    </div>
  );
}
