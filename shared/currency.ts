/** Source points stay unchanged in storage. Convert only when presenting money. */
export const POINT_TO_GOU = 10_000;

const numberFormat = new Intl.NumberFormat("ja-JP");
const compactFormat = new Intl.NumberFormat("ja-JP", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function toGou(sourcePoints: number) {
  return sourcePoints * POINT_TO_GOU;
}

/** A monetary amount already expressed in 轟 (for KGS wallet responses). */
export function formatGou(amount: number) {
  return numberFormat.format(amount);
}

/** An earned amount expressed in the original source point units. */
export function formatPointIncome(sourcePoints: number) {
  return formatGou(toGou(sourcePoints));
}

export function compactPointIncome(sourcePoints: number) {
  return compactFormat.format(toGou(sourcePoints));
}
