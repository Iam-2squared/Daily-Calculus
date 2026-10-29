export type Level = "basic" | "applied" | "advanced";
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
  date: string;
  level: Level;
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
