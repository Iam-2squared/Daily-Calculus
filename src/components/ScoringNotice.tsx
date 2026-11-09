import type { ScoringStatus } from "../../shared/types";
import "../scoring.css";

export function ScoringNotice({
  status,
  awardBlocked = false,
}: {
  status?: ScoringStatus;
  awardBlocked?: boolean;
}) {
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
