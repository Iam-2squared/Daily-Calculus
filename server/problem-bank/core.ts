import type { PrivateProblem, ProblemSubject } from "../../shared/types.js";

export type Random = (minimum: number, maximum: number) => number;
export type BankContent = Omit<
  PrivateProblem,
  "id" | "date" | "level" | "subject" | "dailyCategory" | "correctIndex"
>;
export interface BankTemplate {
  id: string;
  subject: ProblemSubject;
  application: boolean;
  build: (random: Random) => BankContent;
}

export function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
export function fraction(a: number, b = 1): string {
  if (b === 0)
    throw new RangeError("A fraction cannot have a zero denominator");
  if (b < 0) {
    a = -a;
    b = -b;
  }
  const divisor = gcd(a, b);
  a /= divisor;
  b /= divisor;
  if (b === 1) return `${a}`;
  return `${a < 0 ? "-" : ""}\\frac{${Math.abs(a)}}{${b}}`;
}
export function term(a: number, expression: string, denominator = 1): string {
  const coefficient = fraction(a, denominator);
  if (coefficient === "0") return "0";
  if (coefficient === "1") return expression;
  if (coefficient === "-1") return `-${expression}`;
  return `${coefficient}${expression}`;
}
export function xPower(n: number): string {
  return n === 0 ? "1" : n === 1 ? "x" : `x^{${n}}`;
}
export function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 18)
    throw new RangeError("Expected a nonnegative integer no greater than 18");
  let result = 1;
  for (let factor = 2; factor <= n; factor++) result *= factor;
  return result;
}

const MASK_64 = (1n << 64n) - 1n;
export function randomFromSeed(seed: string): Random {
  if (!/^[a-f0-9]{16}$/i.test(seed))
    throw new RangeError("Expected a 16-character hexadecimal seed");
  let state = BigInt(`0x${seed}`);
  return (minimum, maximum) => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK_64;
    let value = state;
    value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK_64;
    value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK_64;
    value ^= value >> 31n;
    const unit = Number(value >> 11n) / 9_007_199_254_740_992;
    return minimum + Math.floor(unit * (maximum - minimum + 1));
  };
}
