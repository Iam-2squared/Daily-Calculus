import type { Random } from "./core.js";

// Generated formulae only: this small reader never evaluates JavaScript or
// accepts a program. It lets the choice sampler reject equivalent expressions
// even when one uses a reduced fraction and another uses a coefficient.
type Expression = { at: (x: number) => number; variable: boolean };
const functions: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sec: (n) => 1 / Math.cos(n),
  log: Math.log,
  exp: Math.exp,
  abs: Math.abs,
};
const commands: Record<string, string> = {
  arctan: "atan",
  arcsin: "asin",
  arccos: "acos",
  ln: "log",
  pi: "pi",
  cdot: "*",
  times: "*",
  left: "",
  right: "",
  quad: "",
  qquad: "",
  vert: "|",
};

function formulaKey(value: string): string {
  return value
    .replace(/\\(?:left|right)/g, "")
    .replace(/\s|\\[,!;]/g, "")
    .replace(/\+C$/, "")
    .replace(/^y=/, "");
}

function expression(value: string): Expression | null {
  const source = value
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\[,!;]/g, "")
    .replace(/\+\s*C\s*$/, "")
    .replace(/^\s*y\s*=/, "")
    .replaceAll("\\dfrac", "\\frac");
  let cursor = 0;
  function argument(): string {
    while (/\s/.test(source[cursor] ?? "") && cursor < source.length) cursor++;
    if (source[cursor] !== "{") {
      if (source[cursor] === "\\") return command();
      const single = source[cursor++];
      if (single === undefined) throw Error("Missing argument");
      return single;
    }
    cursor++;
    const result = expand(true);
    if (source[cursor++] !== "}") throw Error("Unclosed argument");
    return result;
  }
  function command(): string {
    const match = source.slice(cursor).match(/^\\([a-zA-Z]+)/);
    if (!match) throw Error("Unsupported command");
    cursor += match[0].length;
    const name = match[1];
    if (name === "frac") {
      const numerator = argument(),
        denominator = argument();
      return `((${numerator})/(${denominator}))`;
    }
    if (name === "sqrt") {
      let degree = "2";
      if (source[cursor] === "[") {
        const end = source.indexOf("]", ++cursor);
        if (end < 0) throw Error("Unclosed degree");
        degree = source.slice(cursor, end);
        cursor = end + 1;
      }
      return `((${argument()})^(1/(${degree})))`;
    }
    if (Object.hasOwn(functions, name)) return name;
    if (Object.hasOwn(commands, name)) return commands[name];
    throw Error("Unsupported command");
  }
  function expand(group = false): string {
    let result = "";
    while (cursor < source.length && (!group || source[cursor] !== "}")) {
      if (source[cursor] === "\\") result += command();
      else if (source[cursor] === "{") result += `(${argument()})`;
      else result += source[cursor++];
    }
    return result;
  }
  try {
    const expanded = expand()
      .replace(/\s/g, "")
      .replace(/\|([^|]+)\|/g, "abs($1)");
    const tokens =
      expanded.match(
        /\d+(?:\.\d+)?|atan|asin|acos|sinh|cosh|tanh|sin|cos|tan|sec|abs|log|exp|pi|e|x|t|[+\-*/^()]/g,
      ) ?? [];
    if (!tokens.length || tokens.join("") !== expanded) return null;
    let index = 0;
    const constant = (n: number): Expression => ({
      at: () => n,
      variable: false,
    });
    const combine = (
      a: Expression,
      b: Expression,
      fn: (x: number, y: number) => number,
    ): Expression => ({
      at: (x) => fn(a.at(x), b.at(x)),
      variable: a.variable || b.variable,
    });
    function atom(): Expression {
      const token = tokens[index++];
      if (token === "(") {
        const result = sum();
        if (tokens[index++] !== ")") throw Error("Unclosed expression");
        return result;
      }
      if (token === "x" || token === "t")
        return { at: (x) => x, variable: true };
      if (token === "pi") return constant(Math.PI);
      if (token === "e") return constant(Math.E);
      if (Object.hasOwn(functions, token)) {
        let exponent: Expression | undefined;
        if (tokens[index] === "^") {
          index++;
          exponent = unary();
        }
        const value = unary(),
          fn = functions[token];
        const result = {
          at: (x: number) => fn(value.at(x)),
          variable: value.variable,
        };
        return exponent ? combine(result, exponent, (a, b) => a ** b) : result;
      }
      if (!/^\d+(?:\.\d+)?$/.test(token ?? ""))
        throw Error("Unsupported expression");
      return constant(Number(token));
    }
    function unary(): Expression {
      if (tokens[index] === "+") {
        index++;
        return unary();
      }
      if (tokens[index] === "-") {
        index++;
        const value = unary();
        return { at: (x) => -value.at(x), variable: value.variable };
      }
      const value = atom();
      if (tokens[index] === "^") {
        index++;
        return combine(value, unary(), (a, b) => a ** b);
      }
      return value;
    }
    function product(): Expression {
      let value = unary();
      while (
        index < tokens.length &&
        !["+", "-", ")"].includes(tokens[index])
      ) {
        const operator = tokens[index];
        if (operator === "*" || operator === "/") index++;
        const next = unary();
        value = combine(
          value,
          next,
          operator === "/" ? (a, b) => a / b : (a, b) => a * b,
        );
      }
      return value;
    }
    function sum(): Expression {
      let value = product();
      while (tokens[index] === "+" || tokens[index] === "-") {
        const operator = tokens[index++],
          next = product();
        value = combine(
          value,
          next,
          operator === "+" ? (a, b) => a + b : (a, b) => a - b,
        );
      }
      return value;
    }
    const parsed = sum();
    return index === tokens.length ? parsed : null;
  } catch {
    return null;
  }
}

const samples = [0.23, 0.61, 1.17, 2.31, 4.19, 11.73, 23.41];
function close(a: number, b: number): boolean {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <=
      Math.max(1e-11, 8 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)))
  );
}
type Option = {
  text: string;
  key: string;
  values: number[] | null;
  scalar: number | null;
  primitive: boolean;
  notation: string;
};
function option(text: string): Option {
  const parsed = expression(text);
  const values = parsed ? samples.map((x) => parsed.at(x)) : null;
  const value = parsed && !parsed.variable ? parsed.at(1) : null;
  return {
    text,
    key: formulaKey(text),
    values,
    scalar: value !== null && Number.isFinite(value) ? value : null,
    primitive: /\+\s*C\s*$/.test(text),
    notation: [
      /\\frac/.test(text),
      /\\pi/.test(text),
      /\\(?:log|ln)/.test(text),
      /(?<![A-Za-z])e(?![A-Za-z])/.test(text),
      /\\sqrt/.test(text),
      /\\(?:sin|cos|tan|sec|arc)/.test(text),
    ]
      .map(Number)
      .join(""),
  };
}
function same(a: Option, b: Option, negate = false): boolean {
  const key = negate
    ? b.key.startsWith("-")
      ? b.key.slice(1)
      : `-${b.key}`
    : b.key;
  if (a.key === key) return true;
  if (!a.values || !b.values) return false;
  // Antiderivatives differing only by a constant describe the same family.
  // Compare their changes from a shared finite point, also for sign reversals.
  const anchor =
    a.primitive || b.primitive
      ? samples.findIndex(
          (_, i) =>
            Number.isFinite(a.values![i]) && Number.isFinite(b.values![i]),
        )
      : -1;
  const aOffset = anchor < 0 ? 0 : a.values[anchor];
  const bOffset = anchor < 0 ? 0 : b.values[anchor];
  let finite = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = a.values[i] - aOffset,
      y = (b.values[i] - bOffset) * (negate ? -1 : 1);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!close(x, y)) return false;
    finite++;
  }
  return finite >= 3;
}
function scalar(value: Option): number | null {
  return value.scalar;
}

/** Retain the answer, then sample an authored pool without sign-pair clues. */
export function pickDistractors(
  correct: string,
  pool: readonly string[],
  random: Random,
): string[] {
  const answer = option(correct),
    candidates: Option[] = [];
  for (const text of pool) {
    const candidate = option(text);
    if (
      !text ||
      same(answer, candidate) ||
      same(answer, candidate, true) ||
      candidates.some((other) => same(other, candidate))
    )
      continue;
    candidates.push(candidate);
  }
  if (candidates.length < 3)
    throw new Error(`Insufficient distinct distractors for ${correct}`);
  // Choose among whole valid sets, rather than keeping a preferred first wrong
  // answer. No pair is a sign reversal, including the three wrong answers.
  const sets: Option[][] = [];
  for (let a = 0; a < candidates.length - 2; a++)
    for (let b = a + 1; b < candidates.length - 1; b++)
      for (let c = b + 1; c < candidates.length; c++) {
        const subset = [candidates[a], candidates[b], candidates[c]];
        const choices = [answer, ...subset];
        // An isolated plain number, fraction, or special-function notation
        // must not mark the answer among three differently written options.
        if (!subset.some((candidate) => candidate.notation === answer.notation))
          continue;
        if (
          subset.some((x, i) =>
            subset.slice(i + 1).some((y) => same(x, y, true)),
          )
        )
          continue;
        const negative = choices.filter((x) => x.key.startsWith("-")).length;
        // A unique leading sign must never identify the answer. Zero and domain
        // answers have no sign to balance; their mathematical value is inherent.
        const value = scalar(answer);
        if (
          value !== 0 &&
          ((answer.key.startsWith("-") && negative === 1) ||
            (!answer.key.startsWith("-") && negative === 3))
        )
          continue;
        sets.push(subset);
      }
  if (!sets.length)
    throw new Error(`No unambiguous distractor set for ${correct}`);
  const value = scalar(answer);
  let selected: Option[];
  if (value !== null) {
    const ranks = new Map<number, Option[][]>();
    for (const set of sets) {
      const values = set.map(scalar);
      if (values.some((x) => x === null)) continue;
      const rank = values.filter((x) => x! < value).length;
      const group = ranks.get(rank) ?? [];
      group.push(set);
      ranks.set(rank, group);
    }
    if (ranks.size) {
      const groups = [...ranks.values()];
      const group = groups[random(0, groups.length - 1)];
      selected = group[random(0, group.length - 1)];
    } else selected = sets[random(0, sets.length - 1)];
  } else selected = sets[random(0, sets.length - 1)];
  // The caller separately shuffles all four options, including the answer.
  return [correct, ...selected.map((x) => x.text)];
}
