export type Level = "basic" | "applied" | "advanced";
export type ProblemSubject = "differentiation" | "integration";
export type ChallengeSubject = ProblemSubject | "all";
export type DailyCategory = "differentiation" | "integration" | "application";
export const DAILY_CATEGORIES: Record<DailyCategory, string> = {
  differentiation: "微分",
  integration: "積分",
  application: "応用",
};
export const CHALLENGE_SUBJECTS: Record<ChallengeSubject, string> = {
  differentiation: "微分",
  integration: "積分",
  all: "全て",
};
export const LEVELS: Record<
  Level,
  { name: string; points: number; english: string; description: string }
> = {
  basic: {
    name: "基礎",
    points: 1,
    english: "BASIC",
    description: "微分・積分の基本問題",
  },
  applied: {
    name: "応用",
    points: 3,
    english: "APPLIED",
    description: "複数の公式を使う応用問題",
  },
  advanced: {
    name: "難関",
    points: 5,
    english: "ADVANCED",
    description: "発展的な微分・積分の問題",
  },
};
export interface Problem {
  id: string;
  // Choice revisions share the original completion receipt and award identity.
  rewardId?: string;
  date: string;
  level: Level;
  subject?: ProblemSubject;
  dailyCategory?: DailyCategory;
  title: string;
  topic: string;
  prompt: string;
  formula: string;
  choices: string[];
  hint: string;
  estimatedMinutes: number;
}
export interface PrivateProblem extends Problem {
  correctIndex: number;
  explanation: string[];
  explanationFormulas: string[];
}
export interface AnswerResult {
  correct: boolean;
  correctIndex: number;
  explanation: string[];
  explanationFormulas: string[];
  pointsEarned: number;
  alreadySolved: boolean;
  scoring?: ScoringStatus;
  awardBlocked?: boolean;
  awardPaused?: boolean;
  scoringFrozenAt?: string | null;
}
export interface ScoringStatus {
  mistakes: number;
  correctStreak: number;
  requiredCorrectStreak: 3;
  locked: boolean;
}
export interface User {
  id: number;
  username: string;
  createdAt: string;
}
export interface Activity {
  date: string;
  count: number;
  points: number;
}
export interface Stats {
  totalPoints: number;
  weeklyPoints: number;
  solvedCount: number;
  streak: number;
  activity: Activity[];
  solvedIds: string[];
  levelCounts: Record<Level, number>;
  scoring?: ScoringStatus;
  scoringPaused?: boolean;
  scoringFrozenAt?: string | null;
}
export interface RankingEntry {
  rank: number;
  username: string;
  points: number;
  isYou: boolean;
}
export interface Leaderboard {
  entries: RankingEntry[];
  me: RankingEntry | null;
  totalUsers: number;
  period: "all" | "week";
  weekStart: string;
}
export interface Lesson {
  id: string;
  category: string;
  title: string;
  description: string;
  formula: string;
  content: { title: string; text: string; formula?: string }[];
}

export type ChallengeMode = "practice" | "time-attack";
export interface TimeAttackRun {
  token: string;
  endsAt: number;
  durationSeconds: number;
}
export interface ChallengeResponse {
  problem: Problem;
  serverNow: number;
  run?: TimeAttackRun;
}
