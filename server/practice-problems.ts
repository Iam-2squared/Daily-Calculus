import type { Level, PrivateProblem } from "../shared/types.js";

type Content = Omit<PrivateProblem, "id" | "date" | "level" | "correctIndex">;
type Random = (minimum: number, maximum: number) => number;
const MASK_64 = (1n << 64n) - 1n;

/** SplitMix64 uses every seed bit and has a stable, platform-independent sequence. */
function randomFromSeed(seed: string): Random {
  if (!/^[0-9a-f]{16}$/i.test(seed))
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
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
function fraction(a: number, b = 1): string {
  const divisor = gcd(a, b);
  a /= divisor;
  b /= divisor;
  if (b === 1) return `${a}`;
  return `${a < 0 ? "-" : ""}\\frac{${Math.abs(a)}}{${b}}`;
}
function term(a: number, expression: string, denominator = 1): string {
  return `${a === denominator ? "" : fraction(a, denominator)}${expression}`;
}
function xPower(n: number): string {
  return n === 1 ? "x" : `x^{${n}}`;
}
function factorial(n: number): number {
  return n <= 1 ? 1 : n * factorial(n - 1);
}

function basic(template: number, random: Random): Content {
  const k = random(2, 12),
    n = random(2, 6),
    a = random(1, 5);
  const candidate = random(1, 9);
  // Unequal sine/cosine coefficients keep all symbolic distractors distinct.
  const b = candidate === k ? candidate + 1 : candidate;
  switch (template) {
    case 0: {
      const answer = k * n * a ** (n - 1) + b;
      return {
        title: "多項式の微分係数",
        topic: "微分係数",
        estimatedMinutes: 3,
        prompt: `次の関数について、x = ${a} における微分係数を求めてください。`,
        formula: `f(x)=${k}x^{${n}}+${term(b, "x")}`,
        choices: [`${answer}`, `${answer - b}`, `${answer + b}`, `${-answer}`],
        hint: "それぞれの項を微分してから、指定された x の値を代入します。",
        explanation: [
          "べき関数の微分公式を使い、一次の項の導関数を加えます。",
          `導関数に x = ${a} を代入します。`,
        ],
        explanationFormulas: [
          `f'(x)=${k * n}${xPower(n - 1)}+${b}`,
          `f'(${a})=${k * n}\\cdot ${a}^{${n - 1}}+${b}=${answer}`,
        ],
      };
    }
    case 1: {
      const lower = a - 1,
        upper = a + random(1, 3);
      const numerator = k * (upper ** (n + 1) - lower ** (n + 1));
      return {
        title: "べき関数の定積分",
        topic: "定積分",
        estimatedMinutes: 3,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{${lower}}^{${upper}}${k}x^{${n}}\\,dx`,
        choices: [
          fraction(numerator, n + 1),
          fraction(numerator, n + 2),
          `${numerator}`,
          fraction(-numerator, n + 1),
        ],
        hint: "原始関数に上端を代入した値から、下端を代入した値を引きます。",
        explanation: [
          "べき関数を積分すると、指数が1つ増え、その指数で係数を割ります。",
          "上下の端点の値の差を取ります。",
        ],
        explanationFormulas: [
          `\\left[${term(k, `x^{${n + 1}}`, n + 1)}\\right]_{${lower}}^{${upper}}=${fraction(k, n + 1)}\\left(${upper}^{${n + 1}}-${lower}^{${n + 1}}\\right)=${fraction(numerator, n + 1)}`,
        ],
      };
    }
    case 2:
      return {
        title: "三角関数の微分",
        topic: "三角関数の微分",
        estimatedMinutes: 3,
        prompt: "次の関数の導関数を選んでください。",
        formula: `f(x)=${k}\\sin x+${term(b, "\\cos x")}`,
        choices: [
          `${k}\\cos x-${term(b, "\\sin x")}`,
          `${k}\\sin x+${term(b, "\\cos x")}`,
          `-${k}\\cos x+${term(b, "\\sin x")}`,
          `${k}\\cos x+${term(b, "\\sin x")}`,
        ],
        hint: "sin x の導関数は cos x、cos x の導関数は −sin x です。",
        explanation: [
          "各項を微分します。cos x を微分するときの負の符号に注意します。角度はラジアンです。",
        ],
        explanationFormulas: [`f'(x)=${k}\\cos x-${term(b, "\\sin x")}`],
      };
    case 3:
      return {
        title: "対数関数の微分係数",
        topic: "対数関数の微分",
        estimatedMinutes: 3,
        prompt: `x = ${a + 1} における微分係数を求めてください。log は自然対数です。`,
        formula: `f(x)=${k}\\log x`,
        choices: [
          fraction(k, a + 1),
          fraction(-k, a + 1),
          fraction(k + a + 1, a + 1),
          fraction(k + 2 * (a + 1), a + 1),
        ],
        hint: "自然対数の導関数は 1/x です。係数を掛けてから x の値を代入します。",
        explanation: ["定数倍の微分と、自然対数の微分公式を使います。"],
        explanationFormulas: [
          `f'(x)=\\frac{${k}}{x}`,
          `f'(${a + 1})=${fraction(k, a + 1)}`,
        ],
      };
    case 4:
      return {
        title: "べき関数の不定積分",
        topic: "不定積分",
        estimatedMinutes: 3,
        prompt: "次の不定積分を求めてください。C は積分定数です。",
        formula: `\\int ${k}x^{${n}}\\,dx`,
        choices: [
          `${term(k, `x^{${n + 1}}`, n + 1)}+C`,
          `${term(k + n + 1, `x^{${n + 1}}`, n + 1)}+C`,
          `-${term(k, `x^{${n + 1}}`, n + 1)}+C`,
          `${term(k, `x^{${n}}`, n + 1)}+C`,
        ],
        hint: "指数を1つ増やし、新しい指数で係数を割ります。",
        explanation: [
          "べき関数の積分公式を使います。不定積分には積分定数 C を加えます。",
        ],
        explanationFormulas: [
          `\\int ${k}x^{${n}}\\,dx=${term(k, `x^{${n + 1}}`, n + 1)}+C`,
        ],
      };
    default:
      return {
        title: "三角関数の定積分",
        topic: "定積分",
        estimatedMinutes: 4,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_0^{\\pi}\\left(${k}\\sin x+${b}\\right)\\,dx`,
        choices: [
          `${2 * k}+${term(b, "\\pi")}`,
          `${k}+${term(b, "\\pi")}`,
          `${2 * k}-${term(b, "\\pi")}`,
          `${-2 * k}+${term(b, "\\pi")}`,
        ],
        hint: "sin x の原始関数は −cos x です。定数の項も忘れずに積分します。",
        explanation: ["項ごとに積分します。cos 0 = 1、cos π = −1 を使います。"],
        explanationFormulas: [
          `\\left[-${k}\\cos x+${term(b, "x")}\\right]_0^{\\pi}=${2 * k}+${term(b, "\\pi")}`,
        ],
      };
  }
}

function applied(template: number, random: Random): Content {
  const k = random(2, 5),
    n = random(2, 4),
    a = random(1, 3),
    b = random(1, 6);
  switch (template) {
    case 0: {
      const answer = n * k * (k * a + b) ** (n - 1);
      return {
        title: "合成関数の微分係数",
        topic: "合成関数の微分",
        estimatedMinutes: 5,
        prompt: `次の関数について、x = ${a} における微分係数を求めてください。`,
        formula: `f(x)=(${k}x+${b})^{${n}}`,
        choices: [`${answer}`, `${answer / k}`, `${2 * answer}`, `${-answer}`],
        hint: "外側を微分した結果に、内側の一次関数の導関数を掛けます。",
        explanation: [
          "合成関数の微分公式を使います。内側の関数の微分を掛け忘れないようにします。",
          `導関数に x = ${a} を代入します。`,
        ],
        explanationFormulas: [
          `f'(x)=${n * k}(${k}x+${b})^{${n - 1}}`,
          `f'(${a})=${n * k}\\cdot ${k * a + b}^{${n - 1}}=${answer}`,
        ],
      };
    }
    case 1: {
      const exponent = k * a;
      return {
        title: "部分積分による定積分",
        topic: "部分積分",
        estimatedMinutes: 7,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_0^{${a}}xe^{${k}x}\\,dx`,
        choices: [
          `\\frac{${term(exponent - 1, `e^{${exponent}}`)}+1}{${k * k}}`,
          `\\frac{${term(exponent - 1, `e^{${exponent}}`)}-1}{${k * k}}`,
          `\\frac{${term(exponent - 1, `e^{${exponent}}`)}+1}{${k}}`,
          `\\frac{${term(exponent + 1, `e^{${exponent}}`)}+1}{${k * k}}`,
        ],
        hint: "x を微分する側、指数関数を積分する側にして部分積分します。",
        explanation: [
          "部分積分を1回行い、残った指数関数の積分を計算します。",
          "上端と下端を代入して整理します。",
        ],
        explanationFormulas: [
          `\\int xe^{${k}x}\\,dx=\\frac{xe^{${k}x}}{${k}}-\\frac{e^{${k}x}}{${k * k}}+C`,
          `\\int_0^{${a}}xe^{${k}x}\\,dx=\\frac{${term(exponent - 1, `e^{${exponent}}`)}+1}{${k * k}}`,
        ],
      };
    }
    case 2: {
      const numerator = k * a ** 3;
      return {
        title: "曲線と x 軸の間の面積",
        topic: "面積と定積分",
        estimatedMinutes: 5,
        prompt: "次の曲線と x 軸で囲まれる部分の面積を求めてください。",
        formula: `y=${k}x(${a}-x)\\quad(0\\le x\\le ${a})`,
        choices: [
          fraction(numerator, 6),
          fraction(numerator, 3),
          fraction(numerator, 2),
          `${numerator}`,
        ],
        hint: "指定された区間では関数の値は0以上です。式を展開して定積分します。",
        explanation: [
          "曲線が x 軸より上にあるため、この区間での定積分が面積になります。",
        ],
        explanationFormulas: [
          `S=\\int_0^{${a}}(${k * a}x-${k}x^2)\\,dx`,
          `=\\left[${term(k * a, "x^2", 2)}-${term(k, "x^3", 3)}\\right]_0^{${a}}=${fraction(numerator, 6)}`,
        ],
      };
    }
    case 3: {
      const delta = k * a ** 3;
      return {
        title: "三次関数の最小値",
        topic: "関数の最小値",
        estimatedMinutes: 6,
        prompt: `区間 0 ≦ x ≦ ${2 * a} における、次の関数の最小値を求めてください。`,
        formula: `f(x)=${k}x^3-${3 * k * a * a}x+${b}`,
        choices: [
          `${b - 2 * delta}`,
          `${b}`,
          `${b + 2 * delta}`,
          `${b - delta}`,
        ],
        hint: "導関数が0になる区間内の点と、両端での関数値を比較します。",
        explanation: [
          `区間内で導関数が0になるのは x = ${a} です。`,
          "停留点と両端での値を比較して、最小値を求めます。",
        ],
        explanationFormulas: [
          `f'(x)=${3 * k}(x-${a})(x+${a})`,
          `f(0)=${b},\\quad f(${a})=${b - 2 * delta},\\quad f(${2 * a})=${b + 2 * delta}`,
        ],
      };
    }
    case 4: {
      const factor = k * a ** (k - 1),
        inside = b + a ** (k * n);
      return {
        title: "微積分の基本定理",
        topic: "微積分の基本定理",
        estimatedMinutes: 5,
        prompt: `次の関数について、F′(${a}) を求めてください。`,
        formula: `F(x)=\\int_0^{x^{${k}}}(${b}+t^{${n}})\\,dt`,
        choices: [
          `${factor * inside}`,
          `${inside}`,
          `${2 * factor * inside}`,
          `${-factor * inside}`,
        ],
        hint: "上端を被積分関数に代入し、上端の関数の導関数を掛けます。",
        explanation: ["微積分の基本定理と合成関数の微分を組み合わせます。"],
        explanationFormulas: [
          `F'(x)=(${b}+x^{${k * n}})${k}x^{${k - 1}}`,
          `F'(${a})=${inside}\\cdot ${factor}=${inside * factor}`,
        ],
      };
    }
    default: {
      const numerator = k * ((a * a + b) ** (n + 1) - b ** (n + 1));
      return {
        title: "置換積分による定積分",
        topic: "置換積分",
        estimatedMinutes: 6,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_0^{${a}}${2 * k}x(x^2+${b})^{${n}}\\,dx`,
        choices: [
          fraction(numerator, n + 1),
          fraction(numerator, n + 2),
          `${numerator}`,
          fraction(-numerator, n + 1),
        ],
        hint: `t = x² + ${b} と置くと、dt = 2x dx になります。積分区間も置き換えます。`,
        explanation: [
          `t = x² + ${b} と置換すると、べき関数の積分になります。`,
          "置換後の端点を代入して計算します。",
        ],
        explanationFormulas: [
          `I=${k}\\int_{${b}}^{${a * a + b}}t^{${n}}\\,dt`,
          `=${fraction(k, n + 1)}\\left(${a * a + b}^{${n + 1}}-${b}^{${n + 1}}\\right)=${fraction(numerator, n + 1)}`,
        ],
      };
    }
  }
}

function advanced(template: number, random: Random): Content {
  const k = random(2, 8),
    n = random(1, 5),
    a = random(1, 5),
    b = random(1, 7);
  switch (template) {
    case 0:
      return {
        title: "指数関数の極限",
        topic: "極限",
        estimatedMinutes: 8,
        prompt: "次の極限値を求めてください。",
        formula: `\\lim_{x\\to0}\\frac{${a}(e^{${k}x}-1-${k}x)}{x^2}`,
        choices: [
          fraction(a * k * k, 2),
          `${a * k * k}`,
          fraction(a * k, 2),
          fraction(-a * k * k, 2),
        ],
        hint: "指数関数を原点のまわりで2次まで展開します。定数項と1次の項は消えます。",
        explanation: [
          "指数関数の2次までの展開を代入します。o(x²) は x² で割ると0に近づく項を表します。",
          "分母の x² と約分し、残る係数を求めます。",
        ],
        explanationFormulas: [
          `e^{${k}x}=1+${k}x+${term(k * k, "x^2", 2)}+o(x^2)`,
          `\\lim_{x\\to0}\\frac{${a}(e^{${k}x}-1-${k}x)}{x^2}=${fraction(a * k * k, 2)}`,
        ],
      };
    case 1: {
      const numerator = a * factorial(n),
        denominator = k ** (n + 1);
      return {
        title: "指数関数の広義積分",
        topic: "広義積分・部分積分",
        estimatedMinutes: 10,
        prompt: "次の広義積分の値を求めてください。",
        formula: `\\int_0^{\\infty}${term(a, xPower(n))}e^{-${k}x}\\,dx`,
        choices: [
          fraction(numerator, denominator),
          fraction(numerator, k ** n),
          fraction(numerator, denominator * k),
          fraction(-numerator, denominator),
        ],
        hint: "部分積分で x の指数を1つずつ下げます。指数関数の減衰により、無限大での端点の項は0になります。",
        explanation: [
          "上端を有限の値で計算してから極限を取ります。部分積分を繰り返すと、指数が1つ下がるごとに係数 n/k が掛かります。",
          "最後に残る指数関数の積分は 1/k です。",
        ],
        explanationFormulas: [
          `I_m=\\int_0^{\\infty}x^me^{-${k}x}\\,dx,\\quad I_m=\\frac{m}{${k}}I_{m-1},\\quad I_0=\\frac1{${k}}`,
          `\\int_0^{\\infty}${term(a, xPower(n))}e^{-${k}x}\\,dx=\\frac{${a}\\cdot ${n}!}{${k}^{${n + 1}}}=${fraction(numerator, denominator)}`,
        ],
      };
    }
    case 2: {
      const arctan = a === 1 ? "\\frac{\\pi}{4}" : `\\arctan ${a}`;
      const angleTerm = (coefficient: number) =>
        a === 1
          ? term(coefficient, "\\pi", 4)
          : term(coefficient, `\\arctan ${a}`);
      return {
        title: "偶関数と奇関数の積分",
        topic: "偶関数・奇関数",
        estimatedMinutes: 8,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{-${a}}^{${a}}\\frac{${term(b, `x^{${2 * n + 1}}`)}+${k}x^2}{1+x^2}\\,dx`,
        choices: [
          `${2 * k * a}-${angleTerm(2 * k)}`,
          `${2 * k * a}+${angleTerm(2 * k)}`,
          `${k * a}-${angleTerm(2 * k)}`,
          `${2 * k * a}-${angleTerm(k)}`,
        ],
        hint: "奇関数の項の積分は0です。残る x²/(1+x²) を 1 − 1/(1+x²) に分けます。",
        explanation: [
          "分子の奇数べきの項は奇関数なので、原点に対称な区間での積分は0になります。残りは偶関数です。",
          "逆正接の原始関数を使って計算します。",
        ],
        explanationFormulas: [
          `I=${2 * k}\\int_0^{${a}}\\left(1-\\frac1{1+x^2}\\right)\\,dx`,
          `=${2 * k}\\left(${a}-${arctan}\\right)=${2 * k * a}-${angleTerm(2 * k)}`,
        ],
      };
    }
    case 3:
      return {
        title: "置換による広義積分",
        topic: "置換積分・広義積分",
        estimatedMinutes: 8,
        prompt: "次の広義積分の値を求めてください。",
        formula: `\\int_0^{\\infty}\\frac{${k}}{x^2+${a * a}}\\,dx`,
        choices: [
          term(k, "\\pi", 2 * a),
          term(k, "\\pi", a),
          term(k, "\\pi", 4 * a),
          term(-k, "\\pi", 2 * a),
        ],
        hint: `x = ${a}t と置換し、逆正接の原始関数を使います。`,
        explanation: [
          "置換後の積分を逆正接で表し、上端を無限大へ近づけます。arctan t は t → ∞ で π/2 に近づきます。",
        ],
        explanationFormulas: [
          `I=${fraction(k, a)}\\int_0^{\\infty}\\frac1{1+t^2}\\,dt=${fraction(k, a)}\\cdot\\frac{\\pi}{2}=${term(k, "\\pi", 2 * a)}`,
        ],
      };
    case 4: {
      const denominator = (n + 1) ** 2;
      return {
        title: "対数を含む広義積分",
        topic: "部分積分・広義積分",
        estimatedMinutes: 9,
        prompt: "次の広義積分の値を求めてください。log は自然対数です。",
        formula: `\\int_0^1 ${term(a, xPower(n))}\\log x\\,dx`,
        choices: [
          fraction(-a, denominator),
          fraction(-a, n + 1),
          fraction(a, denominator),
          fraction(-a, (n + 2) ** 2),
        ],
        hint: "下端を正の ε として部分積分し、最後に ε を0へ近づけます。",
        explanation: [
          "対数を微分する側にして部分積分します。",
          "ε の正のべきと log ε の積は0へ近づくので、下端での項は0になります。",
        ],
        explanationFormulas: [
          `\\int ${term(a, xPower(n))}\\log x\\,dx=${term(a, `x^{${n + 1}}`, n + 1)}\\log x-${term(a, `x^{${n + 1}}`, denominator)}+C`,
          `\\int_0^1 ${term(a, xPower(n))}\\log x\\,dx=${fraction(-a, denominator)}`,
        ],
      };
    }
    default: {
      const denominator = (n + 1) ** 3;
      return {
        title: "対数の二乗を含む広義積分",
        topic: "部分積分・広義積分",
        estimatedMinutes: 10,
        prompt: "次の広義積分の値を求めてください。log は自然対数です。",
        formula: `\\int_0^1 ${term(a, xPower(n))}(\\log x)^2\\,dx`,
        choices: [
          fraction(2 * a, denominator),
          fraction(a, denominator),
          fraction(2 * a, (n + 1) ** 2),
          fraction(-2 * a, denominator),
        ],
        hint: "対数の二乗を微分する側に選び、部分積分を2回行います。",
        explanation: [
          "下端を正の ε に置いて部分積分します。ε の正のべきと対数の積は0に近づくため、端点の項は消えます。",
          "1回目の部分積分で対数が1つ減り、残った積分をもう一度部分積分します。",
        ],
        explanationFormulas: [
          `I=-${fraction(2 * a, n + 1)}\\int_0^1 x^{${n}}\\log x\\,dx`,
          `=-${fraction(2 * a, n + 1)}\\left(-\\frac1{${(n + 1) ** 2}}\\right)=${fraction(2 * a, denominator)}`,
        ],
      };
    }
  }
}

/** Stateless generation: identity/deadline/signature validation is owned by the API. */
export function generatePracticeProblem(
  level: Level,
  seed: string,
  date: string,
  id: string,
): PrivateProblem {
  const random = randomFromSeed(seed);
  const template = random(0, 5);
  const builders = { basic, applied, advanced };
  if (!Object.hasOwn(builders, level))
    throw new RangeError("Unknown problem level");
  const content = builders[level](template, random);
  const shuffled = content.choices.map((text, index) => ({
    text,
    correct: index === 0,
  }));
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = random(0, index);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return {
    ...content,
    choices: shuffled.map((choice) => choice.text),
    correctIndex: shuffled.findIndex((choice) => choice.correct),
    level,
    date,
    id,
  };
}
