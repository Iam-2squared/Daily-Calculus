import type { Level, PrivateProblem, Problem } from "../shared/types.js";

type Content = Omit<PrivateProblem, "id" | "date" | "level" | "correctIndex">;
const DAY_MS = 86_400_000;
const levels: Level[] = ["basic", "applied", "advanced"];

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : Math.abs(a);
}
function fraction(a: number, b: number): string {
  const g = gcd(a, b);
  a /= g;
  b /= g;
  return b === 1 ? `${a}` : `${a < 0 ? "-" : ""}\\frac{${Math.abs(a)}}{${b}}`;
}
const coefficient = (a: number, b: number) => (a === b ? "" : fraction(a, b));
const power = (x: number, n: number) => x ** n;
const xPower = (n: number) => (n === 1 ? "x" : `x^{${n}}`);

function basic(day: number): Content {
  const n = 2 + (Math.floor(day / 5) % 4);
  const a = 2 + (Math.floor(day / 20) % 3);
  const k = 2 + (Math.floor(day / 60) % 5);
  switch (day % 5) {
    case 0: {
      const answer = n * power(a, n - 1);
      return {
        title: "べき関数の微分係数",
        topic: "微分係数",
        estimatedMinutes: 3,
        prompt: `次の関数について、x = ${a} における微分係数を求めてください。`,
        formula: `f(x) = x^{${n}}`,
        choices: [
          `${answer}`,
          `${n * power(a, n)}`,
          `${power(a, n - 1)}`,
          `${(n + 1) * power(a, n)}`,
        ],
        hint: "べき関数の微分公式で導関数を求めてから、指定された x の値を代入しましょう。",
        explanation: [
          "べき関数は、指数を係数に下ろしてから指数を1つ減らすと微分できます。",
          `得られた導関数に x = ${a} を代入すると、答えが求まります。`,
        ],
        explanationFormulas: [
          `f'(x) = ${n}${xPower(n - 1)}`,
          `f'(${a}) = ${n} \\cdot ${a}^{${n - 1}} = ${answer}`,
        ],
      };
    }
    case 1: {
      const ans = fraction(k, n);
      return {
        title: "べき関数の定積分",
        topic: "定積分",
        estimatedMinutes: 3,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_0^1 ${k}${xPower(n - 1)}\\,dx`,
        choices: [ans, fraction(k + n, n), fraction(k + 2 * n, n), `-${ans}`],
        hint: "まず原始関数を求め、上端の値から下端の値を引きます。",
        explanation: [
          "べき関数の積分では、指数を1つ増やし、その新しい指数で係数を割ります。",
          "原始関数に上端の1と下端の0を代入し、その差を求めます。",
        ],
        explanationFormulas: [
          `\\int ${k}${xPower(n - 1)}\\,dx = ${ans}x^{${n}} + C`,
          `\\left[${ans}x^{${n}}\\right]_0^1 = ${ans}`,
        ],
      };
    }
    case 2:
      return {
        title: "三角関数の微分",
        topic: "三角関数の微分",
        estimatedMinutes: 2,
        prompt: "次の関数の導関数を選んでください。",
        formula: "f(x) = \\cos x",
        choices: ["-\\sin x", "\\sin x", "-\\cos x", "\\cos x"],
        hint: "cos x は x = 0 で最大になり、その直後には減少します。符号にも注目しましょう。",
        explanation: [
          "三角関数の微分の基本公式を使います。cos x を微分すると、符号が負の sin x になります。",
          "角度はラジアンで測ることが前提です。",
        ],
        explanationFormulas: [`\\frac{d}{dx}\\cos x = -\\sin x`],
      };
    case 3:
      return {
        title: "対数関数の微分係数",
        topic: "対数関数の微分",
        estimatedMinutes: 3,
        prompt: `次の関数について、x = ${n} における微分係数を求めてください。`,
        formula: "f(x) = \\log x \\quad (\\log = \\ln)",
        choices: [fraction(1, n), `${n}`, `${n * n}`, fraction(-1, n)],
        hint: "自然対数 log x の導関数は、x の逆数になります。",
        explanation: [
          "自然対数の導関数は 1/x です。",
          `x = ${n} を代入して、微分係数を求めます。`,
        ],
        explanationFormulas: [
          `f'(x) = \\frac{1}{x}`,
          `f'(${n}) = ${fraction(1, n)}`,
        ],
      };
    default:
      return {
        title: "べき関数の不定積分",
        topic: "不定積分",
        estimatedMinutes: 3,
        prompt: "次の不定積分を求めてください。C は積分定数です。",
        formula: `\\int ${k}x^{${n}}\\,dx`,
        choices: [
          `${fraction(k, n + 1)}x^{${n + 1}} + C`,
          `${k}x^{${n + 1}} + C`,
          `${k * n}${xPower(n - 1)} + C`,
          `${fraction(k, n + 1)}x^{${n}} + C`,
        ],
        hint: "答えを微分して、もとの式に戻るか確かめると見通しがよくなります。",
        explanation: [
          "べき関数の積分公式に従い、指数を1つ増やして、新しい指数で割ります。",
          "不定積分では、微分すると0になる任意の定数 C を加えます。",
        ],
        explanationFormulas: [
          `\\int ${k}x^{${n}}\\,dx = ${fraction(k, n + 1)}x^{${n + 1}} + C`,
        ],
      };
  }
}

function applied(day: number): Content {
  const n = 2 + (Math.floor(day / 5) % 3);
  const a = 2 + (Math.floor(day / 15) % 3);
  const k = 2 + (Math.floor(day / 45) % 4);
  switch (day % 5) {
    case 0: {
      const result = n * k * power(k + 1, n - 1);
      return {
        title: "合成関数の微分係数",
        topic: "合成関数の微分",
        estimatedMinutes: 5,
        prompt: "次の関数について、x = 1 における微分係数を求めてください。",
        formula: `f(x) = (${k}x + 1)^{${n}}`,
        choices: [
          `${result}`,
          `${n * power(k + 1, n - 1)}`,
          `${result + n}`,
          `${result * (k + 1)}`,
        ],
        hint: "外側のべき関数を微分したあと、内側の一次関数の導関数を掛け忘れないように。",
        explanation: [
          "合成関数の微分公式を使います。外側を微分し、さらに内側の関数の導関数を掛けます。",
          "最後に x = 1 を代入します。",
        ],
        explanationFormulas: [
          `f'(x) = ${n * k}(${k}x+1)^{${n - 1}}`,
          `f'(1) = ${n * k} \\cdot ${k + 1}^{${n - 1}} = ${result}`,
        ],
      };
    }
    case 1:
      return {
        title: "部分積分による定積分",
        topic: "部分積分",
        estimatedMinutes: 7,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_0^1 x e^{${k}x}\\,dx`,
        choices: [
          `\\frac{${k - 1}e^{${k}}+1}{${k * k}}`,
          `\\frac{${k - 1}e^{${k}}-1}{${k * k}}`,
          `\\frac{e^{${k}}-1}{${k}}`,
          `\\frac{${k + 1}e^{${k}}+1}{${k * k}}`,
        ],
        hint: "x を微分する側、指数関数を積分する側に選んで、部分積分を1回使います。",
        explanation: [
          "x を微分し、指数関数を積分するように部分積分します。",
          "残った指数関数の積分を計算し、端点の値を整理します。",
        ],
        explanationFormulas: [
          `\\int_0^1 xe^{${k}x}\\,dx = \\left[\\frac{xe^{${k}x}}{${k}}\\right]_0^1 - \\frac{1}{${k}}\\int_0^1 e^{${k}x}\\,dx`,
          `=\\frac{e^{${k}}}{${k}}-\\frac{e^{${k}}-1}{${k * k}}=\\frac{${k - 1}e^{${k}}+1}{${k * k}}`,
        ],
      };
    case 2:
      return {
        title: "曲線と x 軸の間の面積",
        topic: "面積と定積分",
        estimatedMinutes: 5,
        prompt: "次の曲線と x 軸で囲まれる部分の面積を求めてください。",
        formula: `y = ${k}x(1-x) \\quad (0 \\leq x \\leq 1)`,
        choices: [fraction(k, 6), fraction(k, 2), fraction(k, 3), `${k}`],
        hint: "この区間では関数の値は0以上です。式を展開してから定積分を求めましょう。",
        explanation: [
          "0から1の区間で曲線は x 軸の上にあるので、定積分の値がそのまま面積です。",
          "式を展開し、項ごとに積分します。",
        ],
        explanationFormulas: [
          `S=\\int_0^1(${k}x-${k}x^2)\\,dx`,
          `=\\left[${fraction(k, 2)}x^2-${fraction(k, 3)}x^3\\right]_0^1=${fraction(k, 6)}`,
        ],
      };
    case 3:
      return {
        title: "三次関数の最小値",
        topic: "関数の最小値",
        estimatedMinutes: 6,
        prompt: `区間 0 ≦ x ≦ ${2 * a} における、次の関数の最小値を求めてください。`,
        formula: `f(x) = x^3 - ${3 * a * a}x`,
        choices: [`${-2 * a ** 3}`, "0", `${-(a ** 3)}`, `${2 * a ** 3}`],
        hint: "導関数が0になる点と、区間の両端での値を比べてみましょう。",
        explanation: [
          `導関数が0になるのは x = ±${a} です。このうち指定された区間に含まれるのは正の方だけです。`,
          "停留点と両端での値を比較すると、最小値がわかります。",
        ],
        explanationFormulas: [
          `f'(x)=3x^2-${3 * a * a}=3(x-${a})(x+${a})`,
          `f(0)=0,\\quad f(${a})=${-2 * a ** 3},\\quad f(${2 * a})=${2 * a ** 3}`,
        ],
      };
    default:
      return {
        title: "微積分の基本定理",
        topic: "微積分の基本定理",
        estimatedMinutes: 5,
        prompt: "次の関数について、F′(1) を求めてください。",
        formula: `F(x) = \\int_0^{x^{${k}}}(1+t^{${n}})\\,dt`,
        choices: [`${2 * k}`, `${k}`, `${k * (n + 1)}`, `${2 * k * n}`],
        hint: "積分の上端が x ではなく x のべきになっています。基本定理と合成関数の微分を組み合わせましょう。",
        explanation: [
          "積分の上端を関数とみなし、微積分の基本定理と連鎖律を適用します。",
          "上端の式を被積分関数に代入したものに、上端の導関数を掛けます。",
        ],
        explanationFormulas: [
          `F'(x)=\\left(1+x^{${k * n}}\\right)${k}x^{${k - 1}}`,
          `F'(1)=(1+1)\\cdot ${k}=${2 * k}`,
        ],
      };
  }
}

function advanced(day: number): Content {
  const n = 2 + (Math.floor(day / 5) % 4);
  const k = 2 + (Math.floor(day / 20) % 4);
  switch (day % 5) {
    case 0:
      return {
        title: "指数関数の極限",
        topic: "極限",
        estimatedMinutes: 8,
        prompt: "次の極限値を求めてください。",
        formula: `\\lim_{x\\to 0}\\frac{e^{${k}x}-1-${k}x}{x^2}`,
        choices: [
          fraction(k * k, 2),
          `${k * k}`,
          fraction(k, 2),
          fraction(-k * k, 2),
        ],
        hint: "指数関数の原点での展開を2次の項まで考えるか、ロピタルの定理を2回使えます。",
        explanation: [
          "指数関数を x = 0 のまわりで2次まで展開します。定数項と1次の項は分子から消えます。",
          "残る2次の係数が、求める極限です。o(x²) は x² で割ると0に近づく項を表します。",
        ],
        explanationFormulas: [
          `e^{${k}x}=1+${k}x+${fraction(k * k, 2)}x^2+o(x^2)`,
          `\\lim_{x\\to0}\\frac{e^{${k}x}-1-${k}x}{x^2}=${fraction(k * k, 2)}`,
        ],
      };
    case 1:
      return {
        title: "指数関数の広義積分",
        topic: "広義積分",
        estimatedMinutes: 9,
        prompt: "次の広義積分の値を求めてください。",
        formula: `\\int_0^{\\infty}xe^{-${k}x}\\,dx`,
        choices: [
          fraction(1, k * k),
          fraction(1, k),
          fraction(1, k ** 3),
          `${k * k}`,
        ],
        hint: "上端を R として部分積分し、最後に R を無限大へ近づけます。指数関数の減衰は x の増加より速くなります。",
        explanation: [
          "まず有限区間で部分積分を行います。",
          "上端を無限大へ近づけると、R を含む指数減衰項は0に収束します。",
        ],
        explanationFormulas: [
          `\\int_0^R xe^{-${k}x}\\,dx=-\\frac{R e^{-${k}R}}{${k}}+\\frac{1-e^{-${k}R}}{${k * k}}`,
          `\\int_0^{\\infty}xe^{-${k}x}\\,dx=${fraction(1, k * k)}`,
        ],
      };
    case 2:
      return {
        title: "偶関数と奇関数の積分",
        topic: "偶関数・奇関数",
        estimatedMinutes: 8,
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{-1}^1\\frac{x^5+${k}x^2}{1+x^2}\\,dx`,
        choices: [
          `${2 * k}-${coefficient(k, 2)}\\pi`,
          `${k}-${coefficient(k, 2)}\\pi`,
          `${2 * k}+${coefficient(k, 2)}\\pi`,
          "0",
        ],
        hint: "分子を2つの項に分けて、偶関数と奇関数を見つけます。残った分数は 1 と逆正接の導関数に分けられます。",
        explanation: [
          "x⁵/(1+x²) は奇関数なので、原点に対称な区間での積分は0です。残る項は偶関数です。",
          "x²/(1+x²) を 1 − 1/(1+x²) と変形し、逆正接の積分を使います。",
        ],
        explanationFormulas: [
          `I= ${2 * k}\\int_0^1\\left(1-\\frac{1}{1+x^2}\\right)\\,dx`,
          `=${2 * k}\\left[x-\\arctan x\\right]_0^1=${2 * k}-${coefficient(k, 2)}\\pi`,
        ],
      };
    case 3:
      return {
        title: "置換による広義積分",
        topic: "置換積分・広義積分",
        estimatedMinutes: 9,
        prompt: "次の広義積分の値を求めてください。",
        formula: `\\int_0^{\\infty}\\frac{1}{x^2+${n * n}}\\,dx`,
        choices: [
          `\\frac{\\pi}{${2 * n}}`,
          `\\frac{\\pi}{${n}}`,
          `\\frac{\\pi}{${4 * n}}`,
          fraction(1, n),
        ],
        hint: `x = ${n}t と置いて、逆正接の導関数の形にしましょう。`,
        explanation: [
          `x = ${n}t と置換します。dx にも係数がかかることに注意します。`,
          "逆正接の原始関数を使い、上端を無限大へ近づけます。",
        ],
        explanationFormulas: [
          `I=\\frac{1}{${n}}\\int_0^{\\infty}\\frac{1}{1+t^2}\\,dt`,
          `=\\frac{1}{${n}}\\lim_{R\\to\\infty}\\left[\\arctan t\\right]_0^R=\\frac{\\pi}{${2 * n}}`,
        ],
      };
    default:
      return {
        title: "対数を含む広義積分",
        topic: "部分積分・広義積分",
        estimatedMinutes: 10,
        prompt: "次の広義積分の値を求めてください。log は自然対数を表します。",
        formula: `\\int_0^1 x^{${n}}\\log x\\,dx`,
        choices: [
          fraction(-1, (n + 1) ** 2),
          fraction(-1, n + 1),
          fraction(1, (n + 1) ** 2),
          fraction(-1, n ** 2),
        ],
        hint: "下端を ε > 0 に置いてから部分積分します。x の正のべきに log x を掛けた極限が0になることを使いましょう。",
        explanation: [
          "下端で対数が発散するため、下端を正の数 ε として部分積分します。",
          "ε を0に近づけると、ε の正のべきと log ε の積は0に収束します。したがって積分は有限の値になります。",
        ],
        explanationFormulas: [
          `\\int_{\\varepsilon}^1 x^{${n}}\\log x\\,dx=\\left[\\frac{x^{${n + 1}}\\log x}{${n + 1}}-\\frac{x^{${n + 1}}}{${(n + 1) ** 2}}\\right]_{\\varepsilon}^1`,
          `\\lim_{\\varepsilon\\to0+}\\int_{\\varepsilon}^1 x^{${n}}\\log x\\,dx=${fraction(-1, (n + 1) ** 2)}`,
        ],
      };
  }
}

/** Valid Gregorian date keys, independent of the server's local timezone. */
function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

export function getProblems(date: string): PrivateProblem[] {
  if (!validDate(date)) throw new Error("Invalid problem date");
  // Daily deterministic content. No browser timezone or random source affects answers.
  const epoch = Math.floor(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
  const day = ((epoch % 1800) + 1800) % 1800;
  const builders = { basic, applied, advanced };
  return levels.map((level, i) => {
    const content = builders[level](day + i * 7);
    const shift = (day + i) % 4;
    const choices = [
      ...content.choices.slice(shift),
      ...content.choices.slice(0, shift),
    ];
    return {
      ...content,
      choices,
      correctIndex: (4 - shift) % 4,
      id: `${date}:${level}`,
      date,
      level,
    };
  });
}

export function getProblem(id: string): PrivateProblem | null {
  const [date, level, ...extra] = id.split(":");
  if (extra.length || !validDate(date) || !levels.includes(level as Level))
    return null;
  return getProblems(date).find((p) => p.level === level) ?? null;
}

export function publicProblem(problem: PrivateProblem): Problem {
  const {
    correctIndex: _answer,
    explanation: _explanation,
    explanationFormulas: _formulas,
    ...safe
  } = problem;
  return safe;
}
