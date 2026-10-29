export const POINT_COLORS = [
  { min: 1, name: "黄", emoji: "💛", color: "#facc15", foreground: "#422006" },
  { min: 5, name: "橙", emoji: "🧡", color: "#fb923c", foreground: "#431407" },
  { min: 10, name: "赤", emoji: "❤️", color: "#dc2626", foreground: "#ffffff" },
  {
    min: 20,
    name: "ピンク",
    emoji: "🩷",
    color: "#ec4899",
    foreground: "#4a0430",
  },
  { min: 30, name: "紫", emoji: "💜", color: "#7c3aed", foreground: "#ffffff" },
  { min: 50, name: "青", emoji: "💙", color: "#2563eb", foreground: "#ffffff" },
  {
    min: 75,
    name: "水色",
    emoji: "🩵",
    color: "#22d3ee",
    foreground: "#083344",
  },
  {
    min: 100,
    name: "緑",
    emoji: "💚",
    color: "#22c55e",
    foreground: "#052e16",
  },
  {
    min: 150,
    name: "茶",
    emoji: "🤎",
    color: "#92400e",
    foreground: "#ffffff",
  },
  {
    min: 200,
    name: "灰",
    emoji: "🩶",
    color: "#6b7280",
    foreground: "#ffffff",
  },
  {
    min: 300,
    name: "黒",
    emoji: "🖤",
    color: "#18181b",
    foreground: "#ffffff",
  },
] as const;
export function pointColor(points: number) {
  return [...POINT_COLORS].reverse().find((tier) => points >= tier.min) ?? null;
}
export function pointRange(index: number) {
  const tier = POINT_COLORS[index];
  const next = POINT_COLORS[index + 1];
  return next ? `${tier.min}–${next.min - 1}pt` : `${tier.min}pt以上`;
}
