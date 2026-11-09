import type { BankContent, BankTemplate, Random } from "./core.js";
import { factorial, fraction, term } from "./core.js";
import { pickDistractors } from "./choice-options.js";

interface Question {
  title: string;
  topic: string;
  prompt: string;
  formula: string;
  answer: string;
  wrong: readonly string[];
  hint: string;
  explanation: string[];
  steps: string[];
  minutes?: number;
}
const content = (random: Random, q: Question): BankContent => ({
  title: q.title,
  topic: q.topic,
  prompt: q.prompt,
  formula: q.formula,
  choices: pickDistractors(q.answer, matchingForm(q.answer, q.wrong), random),
  hint: q.hint,
  explanation: q.explanation,
  explanationFormulas: q.steps,
  estimatedMinutes: q.minutes ?? 10,
});
const derivative = (
  id: string,
  build: (random: Random) => BankContent,
  application = false,
): BankTemplate => ({
  id: `advanced-d-${id}`,
  subject: "differentiation",
  application,
  build,
});
const integral = (
  id: string,
  build: (random: Random) => BankContent,
  application = false,
): BankTemplate => ({
  id: `advanced-i-${id}`,
  subject: "integration",
  application,
  build,
});
const pi = (numerator: number, denominator = 1) =>
  term(numerator, "\\pi", denominator);

// Keep simplified integer/fraction notation consistent with the correct option.
// Parameter values and all question mathematics are inherited unchanged from v2.
function matchingForm(answer: string, pool: readonly string[]): string[] {
  const fractionForm = answer.includes("\\frac");
  const sign = answer.startsWith("-");
  return pool.filter(
    (choice) =>
      choice.includes("\\frac") === fractionForm &&
      choice.startsWith("-") === sign,
  );
}
type Rational = readonly [number, number];
function rationalErrors(
  n: number,
  d: number,
  mistakes: readonly Rational[],
): string[] {
  const answer = fraction(n, d);
  const candidates: string[] = mistakes
    .filter(([a, b]) => b > 0 && a !== 0 && Math.sign(a) === Math.sign(n))
    .map(([a, b]) => fraction(a, b));
  const authored = [...new Set(matchingForm(answer, candidates))].filter(
    (candidate) => candidate !== answer,
  );
  if (authored.length >= 6) return authored;
  if (!answer.includes("\\frac")) {
    const magnitude = Math.abs(n / d),
      sign = Math.sign(n);
    for (const offset of [-3, -2, -1, 1, 2, 3, 4, 5, 6]) {
      if (magnitude + offset > 0)
        candidates.push(`${sign * (magnitude + offset)}`);
    }
    candidates.push(`${sign * magnitude * 2}`, `${sign * magnitude * 3}`);
  } else {
    for (const [a, b] of [
      [2, 3],
      [3, 2],
      [3, 4],
      [4, 3],
      [1, 2],
      [2, 1],
      [1, 3],
      [3, 1],
      [1, 4],
      [4, 1],
      [1, 5],
      [5, 1],
      [1, 6],
      [6, 1],
      [1, 7],
      [7, 1],
    ] as const)
      candidates.push(fraction(n * a, d * b));
  }
  return [...new Set(matchingForm(answer, candidates))].filter(
    (candidate) => candidate !== answer,
  );
}
function coefficientErrors(
  n: number,
  d: number,
  expression: string,
  mistakes: readonly Rational[],
): string[] {
  return rationalErrors(n, d, mistakes).map((coefficient) =>
    coefficient === "1"
      ? expression
      : coefficient === "-1"
        ? `-${expression}`
        : `${coefficient}${expression}`,
  );
}
function tangentSquareErrors(a: number): string[] {
  if (a % 4 === 0) {
    const m = a / 4;
    return [
      [7 * m, 2 * m],
      [10 * m, 3 * m],
      [13 * m, 4 * m],
      [16 * m, 5 * m],
      [5 * m, m],
      [6 * m, m],
      [8 * m, 2 * m],
      [9 * m, 2 * m],
    ].map(([integer, coefficient]) => `${integer}-${pi(coefficient)}`);
  }
  return [
    [2 * a, 7],
    [3 * a, 10],
    [5 * a, 16],
    [7 * a, 23],
    [3 * a, 11],
    [4 * a, 15],
    [a, 5],
    [a, 6],
    [a, 7],
    [a, 8],
    [a, 9],
    [a, 11],
    [a, 13],
  ].map(([n, d]) => `${a}-${pi(n, d)}`);
}

export const advancedTemplates: readonly BankTemplate[] = [
  derivative("exponential-nth", (random) => {
    const k = random(2, 20),
      n = random(3, 8),
      answer = k ** n;
    return content(random, {
      title: "指数関数の高階導関数",
      topic: "高階微分",
      prompt: `次の関数の第${n}次導関数について、x = 0 での値を求めてください。`,
      formula: `f(x)=e^{${k}x}`,
      answer: `${answer}`,
      wrong: [
        `${k ** (n - 1)}`,
        `${k ** (n + 1)}`,
        `${n * k ** (n - 1)}`,
        `${n * k ** n}`,
        `${(k + 1) ** n}`,
        `${(k - 1) ** n}`,
        `${answer + k}`,
        `${answer - k}`,
      ],
      hint: "微分するたびに、指数の中の一次式の係数が掛かります。",
      explanation: [
        "指数関数の微分を繰り返すと、係数が累乗になります。",
        "x = 0 では指数関数の値が1になります。",
      ],
      steps: [`f^{(${n})}(x)=${answer}e^{${k}x}`, `f^{(${n})}(0)=${answer}`],
    });
  }),
  derivative("polynomial-nth", (random) => {
    const n = random(3, 16),
      m = n + 2,
      answer = factorial(m) / factorial(m - n);
    return content(random, {
      title: "べき関数の高階導関数",
      topic: "高階微分",
      prompt: `第${n}次導関数の x = 1 における値を求めてください。`,
      formula: `f(x)=x^{${m}}`,
      answer: `${answer}`,
      wrong: [
        `${factorial(m)}`,
        `${factorial(m - 1)}`,
        `${factorial(m - 2)}`,
        `${answer / m}`,
        `${answer / (m - 1)}`,
        `${(answer * 3) / 2}`,
        `${(answer * 5) / 3}`,
        `${answer + factorial(m - 2)}`,
      ],
      hint: "指数を1ずつ減らしながら、係数として順に掛けます。",
      explanation: [
        "n回の微分で、最初の指数からn個の整数を掛け合わせた係数になります。",
        "残るべき関数に x = 1 を代入します。",
      ],
      steps: [
        `f^{(${n})}(x)=\\frac{${m}!}{${m - n}!}x^{${m - n}}=${answer}x^{${m - n}}`,
        `f^{(${n})}(1)=${answer}`,
      ],
    });
  }),
  derivative("trigonometric-nth", (random) => {
    const k = random(2, 12),
      q = random(1, 2),
      n = 4 * q + 1,
      answer = k ** n;
    return content(random, {
      title: "三角関数の高階導関数",
      topic: "高階微分・周期性",
      prompt: `第${n}次導関数の x = 0 における値を求めてください。`,
      formula: `f(x)=\\sin(${k}x)`,
      answer: `${answer}`,
      wrong: [
        `${k ** (n - 1)}`,
        `${k ** (n - 2)}`,
        `${k ** (n + 1)}`,
        `${(n - 1) * k ** (n - 1)}`,
        `${n * k ** (n - 1)}`,
        `${(k + 1) ** n}`,
        `${(k - 1) ** n}`,
        `${answer + k ** (n - 1)}`,
      ],
      hint: "sin の導関数は4回ごとに元の形に戻ります。",
      explanation: [
        "sin、cos、−sin、−cos の順に形が変わり、微分するたびに内側の係数が掛かります。",
        "微分回数を4で割った余りは1なので、cos の形になります。",
      ],
      steps: [`f^{(${n})}(x)=${answer}\\cos(${k}x)`, `f^{(${n})}(0)=${answer}`],
    });
  }),
  derivative("product-second", (random) => {
    const k = random(2, 30),
      coefficient = k * k + 4 * k + 2;
    return content(random, {
      title: "積で表された関数の第二導関数",
      topic: "積の微分・高階微分",
      prompt: "第二導関数の x = 1 における値を求めてください。",
      formula: `f(x)=x^2e^{${k}x}`,
      answer: term(coefficient, `e^{${k}}`),
      wrong: coefficientErrors(coefficient, 1, `e^{${k}}`, [
        [k * k + 2 * k + 2, 1],
        [k * k + 4 * k, 1],
        [k * k + 2, 1],
        [k * k + 6 * k + 2, 1],
        [k * k + 4 * k + 4, 1],
        [2 * k * k + 4 * k + 2, 1],
        [k * k + 8 * k + 2, 1],
        [(k + 1) ** 2, 1],
      ]),
      hint: "積の微分を2回行い、指数関数を共通因数としてまとめます。",
      explanation: [
        "1回目の微分で生じる2項の両方に、再び積の微分を使います。",
        "中央の項が2回現れることに注意します。",
      ],
      steps: [
        `f'(x)=e^{${k}x}(2x+${k}x^2)`,
        `f''(x)=e^{${k}x}(${k * k}x^2+${4 * k}x+2)`,
        `f''(1)=${term(coefficient, `e^{${k}}`)}`,
      ],
    });
  }),
  derivative("logarithm-second", (random) => {
    const a = random(2, 30),
      numerator = 2 * (a - 1),
      denominator = (a + 1) ** 2;
    return content(random, {
      title: "対数関数の第二導関数",
      topic: "合成関数・商の微分",
      prompt:
        "第二導関数の x = 1 における値を求めてください。log は自然対数です。",
      formula: `f(x)=\\log(x^2+${a})`,
      answer: fraction(numerator, denominator),
      wrong: rationalErrors(numerator, denominator, [
        [2, a + 1],
        [2 * a, denominator],
        [numerator, a + 1],
        [a - 1, denominator],
        [numerator, (a + 1) ** 3],
        [2 * (a + 1), (a + 1) ** 3],
        [numerator, a * a + 1],
        [numerator, (a + 2) ** 2],
        [numerator, a * a],
      ]),
      hint: "1回微分すると分数になります。次に商の微分を使います。",
      explanation: [
        "合成関数の微分により、最初の導関数は 2x/(x²+a) です。",
        "商の微分で分子を整理してから x = 1 を代入します。",
      ],
      steps: [
        `f'(x)=\\frac{2x}{x^2+${a}}`,
        `f''(x)=\\frac{${2 * a}-2x^2}{(x^2+${a})^2}`,
        `f''(1)=${fraction(numerator, denominator)}`,
      ],
    });
  }),
  derivative(
    "implicit-second",
    (random) => {
      const a = random(1, 30);
      return content(random, {
        title: "陰関数の第二導関数",
        topic: "陰関数の微分",
        prompt: `曲線上の点 (${a}, ${a}) における d²y/dx² を求めてください。`,
        formula: `x^2+xy+y^2=${3 * a * a}`,
        answer: fraction(-2, 3 * a),
        wrong: rationalErrors(-2, 3 * a, [
          [-1, 3 * a],
          [-2, a],
          [-3, 2 * a],
          [-2, 3 * a * a],
          [-4, 3 * a],
          [-2, 2 * a + 1],
          [-1, a],
          [-2, 3 * a + 1],
          [-2, 3 * a - 1],
        ]),
        hint: "y を x の関数として2回微分します。まず指定された点で y′ を求めます。",
        explanation: [
          "1回目の微分から、指定された点では y′ = −1 です。",
          "もう一度微分し、y′ と点の座標を代入して y″ を求めます。",
        ],
        steps: [
          "2x+y+(x+2y)y'=0",
          "2+2y'+2(y')^2+(x+2y)y''=0",
          `2+${3 * a}y''=0\\quad\\Rightarrow\\quad y''=${fraction(-2, 3 * a)}`,
        ],
      });
    },
    true,
  ),
  derivative(
    "parametric-second",
    (random) => {
      const a = random(4, 40);
      return content(random, {
        title: "媒介変数で表された曲線の第二導関数",
        topic: "媒介変数の微分",
        prompt: "t = 1 に対応する点で d²y/dx² を求めてください。",
        formula: `x=t^2,\\qquad y=t^3+${a}t`,
        answer: fraction(3 - a, 4),
        wrong: rationalErrors(3 - a, 4, [
          [3 - a, 2],
          [3 - a, 8],
          [-a - 3, 4],
          [3 - 2 * a, 4],
          [1 - a, 4],
          [3 - a, 6],
          [3 - a, 3],
          [3 - a, 5],
          [-3 * a - 1, 4],
        ]),
        hint: "dy/dx を t で微分したあと、dx/dt で割ります。",
        explanation: [
          "dy/dx = (dy/dt)/(dx/dt) を使います。",
          "第二導関数は t による微分だけではなく、さらに dx/dt で割る必要があります。",
        ],
        steps: [
          `\\frac{dy}{dx}=\\frac{3t^2+${a}}{2t}`,
          `\\frac{d^2y}{dx^2}=\\frac{3t^2-${a}}{4t^3}`,
          `\\left.\\frac{d^2y}{dx^2}\\right|_{t=1}=${fraction(3 - a, 4)}`,
        ],
      });
    },
    true,
  ),
  derivative("inverse-second", (random) => {
    const a = random(1, 30),
      d = 1 + 3 * a;
    return content(random, {
      title: "逆関数の第二導関数",
      topic: "逆関数の微分",
      prompt: `f の逆関数を g とします。g″(${a + 1}) を求めてください。`,
      formula: `f(x)=x+${a}x^3`,
      answer: fraction(-6 * a, d ** 3),
      wrong: rationalErrors(-6 * a, d ** 3, [
        [-6 * a, d * d],
        [-3 * a, d ** 3],
        [-6 * a, d ** 4],
        [-2 * a, d ** 3],
        [-6 * a, (d + 1) ** 3],
        [-6 * a, (d - 1) ** 3],
        [-6 * a, d],
        [-12 * a, d ** 3],
        [-6 * a, (a + 1) ** 3],
      ]),
      hint: "f(g(y)) = y を2回微分します。f(1) が指定された y の値になります。",
      explanation: [
        "f′ は常に正なので、逆関数が存在します。",
        "g″(f(x)) = −f″(x)/(f′(x))³ に x = 1 を代入します。",
      ],
      steps: [
        "g''(f(x))=-\\frac{f''(x)}{(f'(x))^3}",
        `f'(1)=${d},\\quad f''(1)=${6 * a}`,
        `g''(${a + 1})=${fraction(-6 * a, d ** 3)}`,
      ],
    });
  }),
  derivative("taylor-product", (random) => {
    const k = random(2, 30);
    return content(random, {
      title: "積のマクローリン展開",
      topic: "テイラー展開",
      prompt: "x = 0 のまわりの展開で、x³ の係数を求めてください。",
      formula: `f(x)=e^{${k}x}\\cos x`,
      answer: fraction(k * (k * k - 3), 6),
      wrong: rationalErrors(k * (k * k - 3), 6, [
        [k ** 3, 6],
        [k * (k * k + 3), 6],
        [k * (k * k - 1), 6],
        [k * (k * k - 3), 3],
        [k * (k * k - 3), 12],
        [k ** 3 - 3, 6],
        [k ** 3 - k, 6],
        [k ** 3 - 6 * k, 6],
        [k * (k * k + 1), 6],
      ]),
      hint: "指数関数と cos の展開を、x³ の項まで掛け合わせます。",
      explanation: [
        "x³ の係数には、指数関数の x³ の項と、指数関数の x の項×cos の x² の項が寄与します。",
        "この2つを加えると求まります。",
      ],
      steps: [
        `e^{${k}x}=1+${k}x+${fraction(k * k, 2)}x^2+${fraction(k ** 3, 6)}x^3+\\cdots`,
        "\\cos x=1-\\frac{x^2}{2}+\\cdots",
        `${fraction(k ** 3, 6)}-${fraction(k, 2)}=${fraction(k * (k * k - 3), 6)}`,
      ],
    });
  }),
  derivative("variable-exponent", (random) => {
    const a = random(2, 30),
      answer = a * a + a;
    return content(random, {
      title: "変数を指数に含む関数の第二導関数",
      topic: "対数微分",
      prompt: "x > 0 とします。f″(1) を求めてください。",
      formula: `f(x)=x^{${a}x}`,
      answer: `${answer}`,
      wrong: [
        `${a * a}`,
        `${a}`,
        `${a * a + 2 * a}`,
        `${a * a - a}`,
        `${2 * a * a + a}`,
        `${a * a + 1}`,
        `${a * a + 2}`,
        `${2 * a * a}`,
        `${(a + 1) ** 2}`,
      ],
      hint: "log f(x) を微分すると、指数と底の両方の変化を扱えます。",
      explanation: [
        "対数微分から f′ = af(log x+1) を得ます。",
        "もう一度微分し、f(1)=1 と log 1=0 を使います。",
      ],
      steps: [
        `f'(x)=${a}f(x)(\\log x+1)`,
        `f''(x)=f(x)\\left(${a * a}(\\log x+1)^2+\\frac{${a}}x\\right)`,
        `f''(1)=${answer}`,
      ],
    });
  }),
  derivative("inverse-sine-third", (random) => {
    const k = random(2, 30),
      answer = k ** 3;
    return content(random, {
      title: "陰関数の第三導関数",
      topic: "陰関数・高階微分",
      prompt: "y(0)=0 を満たす関数 y(x) について、y‴(0) を求めてください。",
      formula: `\\sin y=${k}x`,
      answer: `${answer}`,
      wrong: [
        `${k}`,
        `${k * k}`,
        `${2 * k ** 3}`,
        `${3 * k ** 3}`,
        `${answer + k}`,
        `${answer - k}`,
        `${(k + 1) ** 3}`,
        `${(k - 1) ** 3}`,
        `${3 * k * k}`,
        `${6 * k ** 3}`,
      ],
      hint: "微分した式に x = 0、y = 0 を代入し、順に y′、y″、y‴ を求めます。",
      explanation: [
        "1回目と2回目の微分から、y′(0)=k、y″(0)=0 を得ます。",
        "3回目の微分では、x=0 で −(y′)³+y‴=0 が残ります。",
      ],
      steps: [
        `\\cos y\\,y'=${k}`,
        "-\\sin y\\,(y')^2+\\cos y\\,y''=0",
        `y'''(0)=(y'(0))^3=${answer}`,
      ],
    });
  }),
  derivative("arctangent-second", (random) => {
    const k = random(2, 30),
      numerator = 2 * k ** 3,
      d = 1 + k * k;
    return content(random, {
      title: "逆正接の合成関数の第二導関数",
      topic: "逆三角関数の微分",
      prompt: "f″(1) を求めてください。arctan は逆正接関数です。",
      formula: `f(x)=\\arctan(${k}x)`,
      answer: fraction(-numerator, d * d),
      wrong: rationalErrors(-numerator, d * d, [
        [-numerator, d],
        [-(k ** 3), d * d],
        [-2 * k * k, d * d],
        [-2 * numerator, d * d],
        [-numerator, (d + 1) ** 2],
        [-numerator, (d - 1) ** 2],
        [-numerator, d ** 3],
        [-numerator, k ** 4 + 1],
        [-2 * k, d * d],
      ]),
      hint: "arctan の導関数は 1/(1+x²) です。合成関数の係数にも注意します。",
      explanation: [
        "1回目の微分では内側の係数 k が掛かります。",
        "次に分母の逆数を微分し、さらに内側の微分を掛けます。",
      ],
      steps: [
        `f'(x)=\\frac{${k}}{1+${k * k}x^2}`,
        `f''(x)=-\\frac{${numerator}x}{(1+${k * k}x^2)^2}`,
        `f''(1)=${fraction(-numerator, d * d)}`,
      ],
    });
  }),
  derivative(
    "exponential-maximum",
    (random) => {
      const a = random(2, 10),
        coefficient = a ** a;
      return content(random, {
        title: "べき関数と指数関数の積の最大値",
        topic: "増減と最大値",
        prompt: "x > 0 の範囲で、関数の最大値を求めてください。",
        formula: `f(x)=x^{${a}}e^{-x}`,
        answer: term(coefficient, `e^{-${a}}`),
        wrong: coefficientErrors(coefficient, 1, `e^{-${a}}`, [
          [a ** (a - 1), 1],
          [a ** (a + 1), 1],
          [(a - 1) ** a, 1],
          [(a + 1) ** a, 1],
          [a * a, 1],
          [coefficient + a, 1],
          [coefficient - a, 1],
          [2 * coefficient, 1],
          [coefficient + a ** (a - 1), 1],
          [coefficient - a ** (a - 1), 1],
        ]),
        hint: "導関数を、符号が分かる因数に分解して調べます。",
        explanation: [
          "x>0 では指数関数と x のべきの因数は正です。",
          "導関数の符号は a−x だけで決まるため、x=a で最大になります。",
        ],
        steps: [
          `f'(x)=x^{${a - 1}}e^{-x}(${a}-x)`,
          `\\max f(x)=f(${a})=${term(coefficient, `e^{-${a}}`)}`,
        ],
      });
    },
    true,
  ),
  derivative(
    "closed-cylinder",
    (random) => {
      const a = random(1, 30);
      return content(random, {
        title: "一定体積の円柱の表面積最小化",
        topic: "立体の最適化",
        prompt:
          "上下のふたがある円柱を考えます。表面積が最小となるときの高さ h を求めてください。",
        formula: `V=${pi(2 * a ** 3)},\\qquad S=2\\pi r^2+2\\pi rh`,
        answer: `${2 * a}`,
        wrong: rationalErrors(2 * a, 1, [
          [a, 1],
          [3 * a, 1],
          [4 * a, 1],
          [2 * a - 1, 1],
          [2 * a + 1, 1],
          [3 * a - 1, 1],
          [3 * a + 1, 1],
          [a + 1, 1],
          [a + 2, 1],
          [2 * a - 2, 1],
        ]),
        hint: "体積の条件から h を r で表し、表面積を1変数の関数にします。",
        explanation: [
          "体積一定の条件から h=2a³/r² です。",
          "表面積の導関数が0になる r=a で符号が負から正に変わります。",
        ],
        steps: [
          `S(r)=2\\pi r^2+\\frac{${4 * a ** 3}\\pi}{r}`,
          `S'(r)=4\\pi r-\\frac{${4 * a ** 3}\\pi}{r^2}=0\\quad\\Rightarrow\\quad r=${a}`,
          `h=\\frac{${2 * a ** 3}}{${a * a}}=${2 * a}`,
        ],
      });
    },
    true,
  ),
  derivative(
    "conical-rate",
    (random) => {
      const a = random(2, 30),
        b = random(1, 12),
        coefficient = a * a * b;
      return content(random, {
        title: "円すい容器の水量の変化率",
        topic: "関連する変化率",
        prompt: `水面の半径 r と水深 h が h=2r を満たす円すい容器に水を入れます。h=${2 * a}、dh/dt=${b} の瞬間の dV/dt を求めてください。`,
        formula: "V=\\frac13\\pi r^2h",
        answer: pi(coefficient),
        wrong: coefficientErrors(coefficient, 1, "\\pi", [
          [a * a, 1],
          [2 * a * b, 1],
          [(a * b) ** 2, 1],
          [a * b, 1],
          [2 * coefficient, 1],
          [3 * coefficient, 1],
          [4 * coefficient, 1],
          [coefficient + b, 1],
          [coefficient - b, 1],
          [a ** 3 * b, 1],
        ]),
        hint: "V を h だけで表してから、時間 t で微分します。",
        explanation: [
          "r=h/2 を代入すると、V=πh³/12 です。",
          "連鎖律により、dV/dt=(πh²/4)(dh/dt) になります。",
        ],
        steps: [
          "V=\\frac{\\pi h^3}{12}",
          "\\frac{dV}{dt}=\\frac{\\pi h^2}{4}\\frac{dh}{dt}",
          `\\frac{dV}{dt}=\\frac{\\pi\\cdot${(2 * a) ** 2}}4\\cdot${b}=${pi(coefficient)}`,
        ],
      });
    },
    true,
  ),
  derivative(
    "curvature-radius",
    (random) => {
      const a = random(2, 30);
      return content(random, {
        title: "放物線の曲率半径",
        topic: "曲率と第二導関数",
        prompt: "原点での曲率半径 R を求めてください。",
        formula: `y=${a}x^2,\\qquad R=\\frac{(1+(y')^2)^{3/2}}{|y''|}`,
        answer: fraction(1, 2 * a),
        wrong: rationalErrors(1, 2 * a, [
          [1, a],
          [1, 4 * a],
          [2, a],
          [1, 2 * a * a],
          [1, 2 * a + 1],
          [1, 2 * a - 1],
          [a, 2],
          [1, a * a],
          [1, 4 * a * a],
          [2, 3 * a],
        ]),
        hint: "原点での第一導関数と第二導関数の値を求め、式に代入します。",
        explanation: [
          "原点では接線が水平なので、分子は1です。",
          "第二導関数は一定で、曲率半径はその絶対値の逆数になります。",
        ],
        steps: [
          `y'=${2 * a}x,\\qquad y''=${2 * a}`,
          `R(0)=\\frac{(1+0)^{3/2}}{${2 * a}}=${fraction(1, 2 * a)}`,
        ],
      });
    },
    true,
  ),
  derivative(
    "tangent-triangle",
    (random) => {
      const a = random(1, 20),
        numerator = 32 * a ** 4;
      return content(random, {
        title: "接線と座標軸が囲む三角形",
        topic: "接線と面積",
        prompt: `曲線の x=${2 * a} における接線と、x 軸・y 軸で囲まれる三角形の面積を求めてください。`,
        formula: "y=x^3",
        answer: fraction(numerator, 3),
        wrong: rationalErrors(numerator, 3, [
          [numerator, 6],
          [numerator, 2],
          [2 * numerator, 3],
          [numerator, 9],
          [3 * numerator, 2],
          [16 * a ** 4, 3],
          [8 * a ** 4, 3],
          [64 * a ** 4, 9],
          [32 * a ** 3, 3],
          [32 * a ** 5, 3],
        ]),
        hint: "接線の方程式から、両座標軸との交点を求めます。",
        explanation: [
          "導関数は3x²なので、指定された点での接線が求まります。",
          "x切片とy切片の長さの積を2で割ると、三角形の面積です。",
        ],
        steps: [
          `y=${12 * a * a}x-${16 * a ** 3}`,
          `x\\text{切片}=${fraction(4 * a, 3)},\\qquad y\\text{切片}=-${16 * a ** 3}`,
          `S=\\frac12\\cdot${fraction(4 * a, 3)}\\cdot${16 * a ** 3}=${fraction(numerator, 3)}`,
        ],
      });
    },
    true,
  ),
  derivative("composite-fourth", (random) => {
    const k = random(2, 30),
      answer = 12 * k * k;
    return content(random, {
      title: "合成関数の第四導関数",
      topic: "高階微分・テイラー係数",
      prompt: "第4次導関数の x = 0 における値を求めてください。",
      formula: `f(x)=e^{${k}x^2}`,
      answer: `${answer}`,
      wrong: [
        `${24 * k * k}`,
        `${4 * k * k}`,
        `${6 * k * k}`,
        `${8 * k * k}`,
        `${12 * k ** 4}`,
        `${12 * k}`,
        `${4 * k ** 4}`,
        `${k * k}`,
        `${answer + 4 * k}`,
        `${answer + 24 * k}`,
      ],
      hint: "x⁴ の係数に4!を掛けると、第4次導関数の原点での値になります。",
      explanation: [
        "指数関数の展開に kx² を代入すると、x⁴ の係数は k²/2 です。",
        "テイラー展開の係数は f⁽⁴⁾(0)/4! なので、4!を掛けて戻します。",
      ],
      steps: [
        `e^{${k}x^2}=1+${k}x^2+${fraction(k * k, 2)}x^4+\\cdots`,
        `f^{(4)}(0)=4!\\cdot${fraction(k * k, 2)}=${answer}`,
      ],
    });
  }),
  integral("gamma-moment", (random) => {
    const n = random(2, 6),
      k = random(2, 12),
      numerator = factorial(n);
    return content(random, {
      title: "指数関数を含む広義積分",
      topic: "部分積分・広義積分",
      prompt: "次の広義積分の値を求めてください。",
      formula: `\\int_0^\\infty x^{${n}}e^{-${k}x}\\,dx`,
      answer: fraction(numerator, k ** (n + 1)),
      wrong: rationalErrors(numerator, k ** (n + 1), [
        [numerator, k ** n],
        [numerator, k ** (n + 2)],
        [factorial(n - 1), k ** (n + 1)],
        [factorial(n + 1), k ** (n + 1)],
        [numerator, (k + 1) ** (n + 1)],
        [numerator, (k - 1) ** (n + 1)],
        [numerator, n + k],
        [numerator, k ** (n + 1) * (n + 1)],
        [n * numerator, k ** (n + 1)],
        [numerator, k ** n * (n + 1)],
      ]),
      hint: "べき関数を微分する側に選び、部分積分を繰り返します。",
      explanation: [
        "境界項は、無限大で指数関数の減衰により0になります。",
        "部分積分により指数を1つずつ下げると、階乗と係数の累乗で表せます。",
      ],
      steps: [
        "I_n=\\frac n{k}I_{n-1},\\qquad I_0=\\frac1k",
        `I_{${n}}=\\frac{${n}!}{${k}^{${n + 1}}}=${fraction(numerator, k ** (n + 1))}`,
      ],
    });
  }),
  integral("logarithm-moment", (random) => {
    const n = random(1, 30),
      d = (n + 1) ** 2;
    return content(random, {
      title: "対数関数を含む広義積分",
      topic: "部分積分・端点の極限",
      prompt: "次の広義積分の値を求めてください。log は自然対数です。",
      formula: `\\int_0^1 x^{${n}}\\log x\\,dx`,
      answer: fraction(-1, d),
      wrong: rationalErrors(-1, d, [
        [-1, n + 1],
        [-1, (n + 2) ** 2],
        [-1, n * n],
        [-1, (n + 1) ** 3],
        [-2, d],
        [-1, n * (n + 1)],
        [-1, (n + 1) * (n + 2)],
        [-n, d],
        [-2, (n + 2) ** 2],
      ]),
      hint: "下端を ε > 0 に置き、log x を微分する側に選びます。",
      explanation: [
        "部分積分で残るのは、べき関数だけの積分です。",
        "x の正のべきと log x の積は、x→0+ で0になるため境界項は消えます。",
      ],
      steps: [
        `\\left[\\frac{x^{${n + 1}}\\log x}{${n + 1}}\\right]_0^1-\\frac1{${n + 1}}\\int_0^1x^{${n}}\\,dx`,
        `=-\\frac1{${n + 1}}\\cdot\\frac1{${n + 1}}=${fraction(-1, d)}`,
      ],
    });
  }),
  integral("squared-logarithm", (random) => {
    const n = random(1, 30),
      d = (n + 1) ** 3;
    return content(random, {
      title: "対数の二乗を含む広義積分",
      topic: "部分積分の反復",
      prompt: "次の広義積分の値を求めてください。log は自然対数です。",
      formula: `\\int_0^1 x^{${n}}(\\log x)^2\\,dx`,
      answer: fraction(2, d),
      wrong: rationalErrors(2, d, [
        [1, d],
        [2, (n + 1) ** 2],
        [6, d],
        [2, (n + 2) ** 3],
        [2, n ** 3],
        [2, (n + 1) * (n + 2) * (n + 3)],
        [2, n * (n + 1) * (n + 2)],
        [4, d],
        [n, d],
        [2, (n + 1) ** 4],
      ]),
      hint: "log の二乗を微分すると、log が1つ残ります。部分積分を2回使います。",
      explanation: [
        "最初の部分積分で、log が1つだけの積分に帰着します。",
        "その値 −1/(n+1)² を代入すると正の値になります。",
      ],
      steps: [
        `I=-\\frac2{${n + 1}}\\int_0^1 x^{${n}}\\log x\\,dx`,
        `I=-\\frac2{${n + 1}}\\left(-\\frac1{${(n + 1) ** 2}}\\right)=${fraction(2, d)}`,
      ],
    });
  }),
  integral("sine-even-reduction", (random) => {
    const n = random(2, 8),
      numerator = factorial(2 * n),
      denominator = 2 * 2 ** (2 * n) * factorial(n) ** 2;
    return content(random, {
      title: "正弦の偶数乗の定積分",
      topic: "漸化式と定積分",
      prompt: "次の定積分の値を求めてください。",
      formula: `\\int_0^{\\pi/2}\\sin^{${2 * n}}x\\,dx`,
      answer: pi(numerator, denominator),
      wrong: coefficientErrors(numerator, denominator, "\\pi", [
        [numerator, 2 * denominator],
        [2 * numerator, denominator],
        [3 * numerator, 2 * denominator],
        [2 * numerator, 3 * denominator],
        [numerator * n, denominator],
        [numerator, denominator * n],
        [numerator * (2 * n), denominator * (2 * n + 1)],
        [numerator * (2 * n + 1), denominator * (2 * n)],
      ]),
      hint: "部分積分で、指数を2ずつ下げる漸化式を作れます。",
      explanation: [
        "I_m=(m−1)I_{m−2}/m を繰り返し使います。",
        "最後に I_0=π/2 を使うと、偶数と奇数の積の比になります。",
      ],
      steps: [
        "I_m=\\frac{m-1}{m}I_{m-2},\\qquad I_0=\\frac\\pi2",
        `I_{${2 * n}}=\\frac{${2 * n}!}{2^{${2 * n}}(${n}!)^2}\\cdot\\frac\\pi2=${pi(numerator, denominator)}`,
      ],
    });
  }),
  integral("quadratic-denominator", (random) => {
    const a = random(2, 30);
    return content(random, {
      title: "二次式の逆数の広義積分",
      topic: "逆三角関数・広義積分",
      prompt: "次の広義積分の値を求めてください。",
      formula: `\\int_0^\\infty\\frac{dx}{x^2+${a * a}}`,
      answer: pi(1, 2 * a),
      wrong: coefficientErrors(1, 2 * a, "\\pi", [
        [1, a],
        [1, 4 * a],
        [1, 3 * a],
        [1, a * a],
        [1, 2 * a * a],
        [1, 2 * a + 1],
        [1, 2 * a - 1],
        [1, a + 1],
        [1, a - 1],
        [1, 6 * a],
      ]),
      hint: "x = a tan θ と置くか、arctan の導関数を使います。",
      explanation: [
        "原始関数は (1/a) arctan(x/a) です。",
        "無限大で arctan は π/2 に近づきます。",
      ],
      steps: [
        `\\left[\\frac1{${a}}\\arctan\\frac x{${a}}\\right]_0^\\infty`,
        `=\\frac1{${a}}\\cdot\\frac\\pi2=${pi(1, 2 * a)}`,
      ],
    });
  }),
  integral("quadratic-square", (random) => {
    const a = random(2, 30);
    return content(random, {
      title: "二次式の二乗を分母に持つ広義積分",
      topic: "置換積分・広義積分",
      prompt: "次の広義積分の値を求めてください。",
      formula: `\\int_0^\\infty\\frac{x}{(x^2+${a * a})^2}\\,dx`,
      answer: fraction(1, 2 * a * a),
      wrong: rationalErrors(1, 2 * a * a, [
        [1, a * a],
        [1, 4 * a * a],
        [1, a],
        [1, 2 * a],
        [1, 2 * a * a + 1],
        [1, 2 * a * a - 1],
        [1, 2 * a * a + a],
        [1, 2 * a * a - a],
        [1, (a + 1) ** 2],
        [1, a * a + 1],
      ]),
      hint: "分母の中身を u と置くと、分子の x dx と対応します。",
      explanation: [
        "u=x²+a² と置くと du=2x dx です。",
        "変換後の下端は a²、上端は無限大になります。",
      ],
      steps: [
        `\\frac12\\int_{${a * a}}^\\infty u^{-2}\\,du`,
        `=\\left[-\\frac1{2u}\\right]_{${a * a}}^\\infty=${fraction(1, 2 * a * a)}`,
      ],
    });
  }),
  integral(
    "semicircle-area",
    (random) => {
      const a = random(2, 30);
      return content(random, {
        title: "円弧の下の面積",
        topic: "三角置換と面積",
        prompt:
          "次の曲線と x 軸、y 軸で囲まれた第1象限の部分の面積を求めてください。",
        formula: `y=\\sqrt{${a * a}-x^2}\\quad(0\\le x\\le${a})`,
        answer: pi(a * a, 4),
        wrong: coefficientErrors(a * a, 4, "\\pi", [
          [a * a, 2],
          [a * a, 8],
          [a * a, 3],
          [a * a, 6],
          [2 * a * a, 3],
          [3 * a * a, 8],
          [a, 4],
          [a ** 3, 4],
          [3 * a * a, 16],
        ]),
        hint: "x = a sin θ と置換すると、cos² θ の積分になります。",
        explanation: [
          "面積は円の4分の1で、定積分でも確認できます。",
          "三角置換では、被積分関数と dx の両方から cos θ が現れます。",
        ],
        steps: [
          `S=\\int_0^{${a}}\\sqrt{${a * a}-x^2}\\,dx=${a * a}\\int_0^{\\pi/2}\\cos^2\\theta\\,d\\theta`,
          `S=${a * a}\\cdot\\frac\\pi4=${pi(a * a, 4)}`,
        ],
      });
    },
    true,
  ),
  integral("tangent-square", (random) => {
    const a = random(2, 30);
    return content(random, {
      title: "正接の二乗の定積分",
      topic: "三角関数の恒等式",
      prompt: "次の定積分の値を求めてください。",
      formula: `\\int_0^{\\pi/4}${a}\\tan^2x\\,dx`,
      answer: `${a}-${pi(a, 4)}`,
      wrong: tangentSquareErrors(a),
      hint: "tan² x = sec² x − 1 を使います。",
      explanation: [
        "正接の二乗を、そのままべき関数のように積分することはできません。",
        "恒等式で分けると、原始関数は a(tan x−x) です。",
      ],
      steps: [
        `${a}\\int_0^{\\pi/4}(\\sec^2x-1)\\,dx`,
        `=${a}\\left[\\tan x-x\\right]_0^{\\pi/4}=${a}-${pi(a, 4)}`,
      ],
    });
  }),
  integral("exponential-sine", (random) => {
    const a = random(1, 6),
      exponent = a === 1 ? "\\pi" : `${a}\\pi`,
      d = a * a + 1;
    return content(random, {
      title: "指数関数と正弦の積の定積分",
      topic: "部分積分の連立",
      prompt: "次の定積分の値を求めてください。",
      formula: `\\int_0^\\pi e^{${a}x}\\sin x\\,dx`,
      answer: `\\frac{e^{${exponent}}+1}{${d}}`,
      wrong: [
        d - 1,
        d + 1,
        d - 2,
        d + 2,
        a * a,
        2 * a,
        (a + 1) ** 2,
        (a - 1) ** 2,
        a * a + a + 1,
        2 * d,
        3 * d,
        d + a,
        d - a,
        d + 3,
        d + 4,
        d + 5,
        (a + 2) ** 2,
      ]
        .filter((value) => value > 0)
        .map((value) => `\\frac{e^{${exponent}}+1}{${value}}`),
      hint: "部分積分を2回行うと、もとの積分が再び現れます。",
      explanation: [
        "sin と cos の積分を部分積分で関係付け、もとの積分について解きます。",
        "端点では sin が0、cos が±1になるため整理できます。",
      ],
      steps: [
        `\\int e^{${a}x}\\sin x\\,dx=\\frac{e^{${a}x}(${a}\\sin x-\\cos x)}{${d}}+C`,
        `\\left[\\frac{e^{${a}x}(${a}\\sin x-\\cos x)}{${d}}\\right]_0^\\pi=\\frac{e^{${exponent}}+1}{${d}}`,
      ],
    });
  }),
  integral("logarithm-infinity", (random) => {
    const a = random(3, 30),
      d = (a - 1) ** 2;
    return content(random, {
      title: "無限区間の対数積分",
      topic: "置換と広義積分",
      prompt: "次の広義積分の値を求めてください。log は自然対数です。",
      formula: `\\int_1^\\infty\\frac{\\log x}{x^{${a}}}\\,dx`,
      answer: fraction(1, d),
      wrong: rationalErrors(1, d, [
        [1, a - 1],
        [1, a * a],
        [1, (a + 1) ** 2],
        [1, (a - 1) * (a + 1)],
        [1, (a - 1) ** 3],
        [2, d],
        [1, a * (a - 1)],
        [a - 1, a * a],
        [a, (a - 1) ** 3],
      ]),
      hint: "t = log x と置くと、t と指数関数の積の積分になります。",
      explanation: [
        "x=eᵗ、dx=eᵗdt を代入すると、積分区間は0から無限大になります。",
        "t e^{−(a−1)t} の積分を部分積分で計算します。",
      ],
      steps: [
        `\\int_0^\\infty te^{-${a - 1}t}\\,dt`,
        `=\\frac1{(${a - 1})^2}=${fraction(1, d)}`,
      ],
    });
  }),
  integral("partial-fraction-infinity", (random) => {
    const a = random(2, 30);
    return content(random, {
      title: "部分分数分解を使う広義積分",
      topic: "部分分数・無限区間",
      prompt: "次の広義積分の値を求めてください。",
      formula: `\\int_0^\\infty\\frac{dx}{(x+${a})(x+${2 * a})}`,
      answer: term(1, "\\log 2", a),
      wrong: coefficientErrors(1, a, "\\log 2", [
        [2, a],
        [1, 2 * a],
        [1, a + 1],
        [1, a - 1],
        [1, a * a],
        [a, a + 1],
        [2, a + 1],
        [1, a + 2],
        [3, 2 * a],
        [1, 3 * a],
      ]),
      hint: "2つの対数を別々に極限にせず、対数の比としてまとめます。",
      explanation: [
        "部分分数分解すると、2つの逆数の差になります。",
        "上端で対数の比は log 1=0 に近づき、下端との差が残ります。",
      ],
      steps: [
        `\\frac1{(x+${a})(x+${2 * a})}=\\frac1{${a}}\\left(\\frac1{x+${a}}-\\frac1{x+${2 * a}}\\right)`,
        `\\left[\\frac1{${a}}\\log\\frac{x+${a}}{x+${2 * a}}\\right]_0^\\infty=${term(1, "\\log 2", a)}`,
      ],
    });
  }),
  integral("beta-polynomial", (random) => {
    const m = random(2, 7),
      n = random(2, 7),
      numerator = factorial(m) * factorial(n),
      d = factorial(m + n + 1);
    return content(random, {
      title: "二つのべきの積の定積分",
      topic: "部分積分と階乗",
      prompt: "次の定積分の値を求めてください。",
      formula: `\\int_0^1x^{${m}}(1-x)^{${n}}\\,dx`,
      answer: fraction(numerator, d),
      wrong: rationalErrors(numerator, d, [
        [numerator, factorial(m + n)],
        [numerator, factorial(m + n + 2)],
        [factorial(m - 1) * factorial(n), d],
        [factorial(m) * factorial(n - 1), d],
        [numerator * (m + 1), d],
        [numerator * (n + 1), d],
        [2 * numerator, d],
        [numerator, 2 * d],
        [numerator * (m + n), d],
        [numerator, d * (m + n + 1)],
      ]),
      hint: "部分積分で (1−x) の指数を1ずつ減らす方法があります。",
      explanation: [
        "端点で積の項が0になることを利用して、部分積分を繰り返します。",
        "一般に非負整数 m,n について、積分は m!n!/(m+n+1)! になります。",
      ],
      steps: [
        "\\int_0^1x^m(1-x)^n\\,dx=\\frac{m!n!}{(m+n+1)!}",
        `=\\frac{${m}!${n}!}{${m + n + 1}!}=${fraction(numerator, d)}`,
      ],
    });
  }),
  integral(
    "washer-volume",
    (random) => {
      const a = random(2, 20),
        p = a ** 5;
      return content(random, {
        title: "二つの曲線の間の回転体",
        topic: "回転体・円環法",
        prompt:
          "2つの曲線で囲まれる部分を x 軸のまわりに1回転した立体の体積を求めてください。",
        formula: `y=x^2,\\qquad y=${a}x`,
        answer: pi(2 * p, 15),
        wrong: coefficientErrors(2 * p, 15, "\\pi", [
          [p, 15],
          [2 * p, 5],
          [4 * p, 15],
          [p, 3],
          [p, 5],
          [2 * p, 3],
          [p, 30],
          [8 * p, 15],
          [2 * a ** 4, 15],
          [2 * a ** 6, 15],
        ]),
        hint: "交点から積分区間を決め、外半径の二乗から内半径の二乗を引きます。",
        explanation: [
          "交点は x=0,a で、この区間では ax が外側の半径です。",
          "円環の断面積 π((ax)²−(x²)²) を積分します。",
        ],
        steps: [
          `V=\\pi\\int_0^{${a}}(${a * a}x^2-x^4)\\,dx`,
          `V=\\pi\\left[${fraction(a * a, 3)}x^3-\\frac{x^5}5\\right]_0^{${a}}=${pi(2 * p, 15)}`,
        ],
      });
    },
    true,
  ),
  integral(
    "shell-volume",
    (random) => {
      const a = random(2, 25),
        p = a ** 4;
      return content(random, {
        title: "放物線の下の部分の回転体",
        topic: "回転体・円筒殻法",
        prompt:
          "第1象限で曲線と両座標軸に囲まれる部分を、y 軸のまわりに1回転した立体の体積を求めてください。",
        formula: `y=${a * a}-x^2`,
        answer: pi(p, 2),
        wrong: coefficientErrors(p, 2, "\\pi", [
          [p, 4],
          [p, 1],
          [2 * p, 3],
          [p, 3],
          [3 * p, 4],
          [2 * p, 1],
          [a ** 3, 2],
          [a ** 5, 2],
          [p, 8],
          [3 * p, 2],
        ]),
        hint: "半径 x、高さ a²−x² の薄い円筒殻を考えます。",
        explanation: [
          "円筒殻の体積は、周の長さ×高さ×厚さです。",
          "x=0 から a まで、2πx(a²−x²) を積分します。",
        ],
        steps: [
          `V=2\\pi\\int_0^{${a}}x(${a * a}-x^2)\\,dx`,
          `V=2\\pi\\left[${fraction(a * a, 2)}x^2-\\frac{x^4}4\\right]_0^{${a}}=${pi(p, 2)}`,
        ],
      });
    },
    true,
  ),
  integral(
    "log-cosine-arc",
    (random) => {
      const k = random(2, 30),
        logarithm = "\\log(2+\\sqrt3)";
      return content(random, {
        title: "対数と余弦で表された曲線の長さ",
        topic: "弧長と定積分",
        prompt:
          "指定された区間での曲線の長さを求めてください。log は自然対数です。",
        formula: `y=\\frac1{${k}}\\log(\\cos(${k}x)),\\qquad 0\\le x\\le\\frac\\pi{${3 * k}}`,
        answer: term(1, logarithm, k),
        wrong: coefficientErrors(1, k, logarithm, [
          [2, k],
          [3, k],
          [1, k + 1],
          [1, k - 1],
          [1, k * k],
          [2, k + 1],
          [2, k - 1],
          [k, k + 1],
          [1, 2 * k],
          [1, 3 * k],
        ]),
        hint: "弧長は ∫√(1+(y′)²) dx です。区間内で cos(kx) は正です。",
        explanation: [
          "y′=−tan(kx) なので、弧長の被積分関数は sec(kx) です。",
          "u=kx と置換し、sec の原始関数 log(sec u+tan u) を使います。",
        ],
        steps: [
          `L=\\int_0^{\\pi/${3 * k}}\\sec(${k}x)\\,dx=\\frac1{${k}}\\int_0^{\\pi/3}\\sec u\\,du`,
          `L=\\frac1{${k}}\\left[\\log(\\sec u+\\tan u)\\right]_0^{\\pi/3}=${term(1, logarithm, k)}`,
        ],
      });
    },
    true,
  ),
  integral(
    "gaussian-normalization",
    (random) => {
      const k = random(2, 30),
        answer = `\\frac{${k}}{\\sqrt\\pi}`;
      return content(random, {
        title: "ガウス型密度の正規化定数",
        topic: "広義積分と確率密度",
        prompt:
          "実数全体での積分が1になるように、正の定数 C を求めてください。",
        formula: `p(x)=Ce^{-${k * k}x^2}`,
        answer,
        wrong: [
          1,
          k * k,
          2 * k,
          k + 1,
          k - 1,
          3 * k,
          k * k - 1,
          k * k + 1,
          k + 2,
          k - 2,
          Math.floor(k / 2),
          k + 5,
          4 * k,
        ]
          .filter((value) => value > 0)
          .map((value) => `\\frac{${value}}{\\sqrt\\pi}`),
        hint: "ガウス積分 ∫_{−∞}^{∞} e^{−u²}du = √π を使い、u=kx と置きます。",
        explanation: [
          "変数を k 倍すると、積分の値は1/k倍になります。",
          "密度の積分を1にするには、その積分値の逆数を C に選びます。",
        ],
        steps: [
          `\\int_{-\\infty}^{\\infty}e^{-${k * k}x^2}\\,dx=\\frac{\\sqrt\\pi}{${k}}`,
          `C\\cdot\\frac{\\sqrt\\pi}{${k}}=1\\quad\\Rightarrow\\quad C=${answer}`,
        ],
      });
    },
    true,
  ),
  integral(
    "sphere-surface",
    (random) => {
      const a = random(2, 30),
        coefficient = 4 * a * a;
      return content(random, {
        title: "回転面の表面積",
        topic: "曲面積と定積分",
        prompt:
          "半円を x 軸のまわりに1回転してできる曲面の面積を求めてください。",
        formula: `y=\\sqrt{${a * a}-x^2},\\qquad -${a}\\le x\\le${a}`,
        answer: pi(coefficient),
        wrong: coefficientErrors(coefficient, 1, "\\pi", [
          [a * a, 1],
          [2 * a * a, 1],
          [8 * a * a, 1],
          [6 * a * a, 1],
          [3 * a * a, 1],
          [4 * a, 1],
          [4 * a ** 3, 1],
          [coefficient + 2 * a, 1],
          [coefficient - 2 * a, 1],
          [5 * a * a, 1],
          [12 * a * a, 1],
        ]),
        hint: "回転面の面積は 2π∫y√(1+(y′)²) dx です。端点は極限で扱います。",
        explanation: [
          "区間の内部では y′=−x/√(a²−x²) です。",
          "y√(1+(y′)²)=a と簡単になり、積分は定数の積分になります。",
        ],
        steps: [
          `y\\sqrt{1+(y')^2}=${a}`,
          `S=2\\pi\\int_{-${a}}^{${a}}${a}\\,dx=${pi(coefficient)}`,
        ],
      });
    },
    true,
  ),
  integral(
    "infinite-horn-volume",
    (random) => {
      const a = random(2, 30),
        b = random(2, 20),
        coefficient = b * b;
      return content(random, {
        title: "無限に延びる回転体の体積",
        topic: "回転体と広義積分",
        prompt:
          "曲線と x 軸の間の部分を、x 軸のまわりに1回転した立体の体積を求めてください。",
        formula: `y=\\frac{${b}}x,\\qquad x\\ge${a}`,
        answer: pi(coefficient, a),
        wrong: coefficientErrors(coefficient, a, "\\pi", [
          [2 * coefficient, a],
          [coefficient, 2 * a],
          [b, a],
          [b * b, a * a],
          [b ** 3, a],
          [coefficient, a + 1],
          [coefficient, a - 1],
          [3 * coefficient, 2 * a],
          [2 * coefficient, 3 * a],
          [coefficient, a + 2],
          [coefficient, a + 3],
        ]),
        hint: "断面積を積分します。積分区間が無限でも、体積が有限になる場合があります。",
        explanation: [
          "断面積は πb²/x² です。",
          "x^{-2} の無限区間での積分は収束するので、有限の体積になります。",
        ],
        steps: [
          `V=\\pi\\int_{${a}}^\\infty\\frac{${coefficient}}{x^2}\\,dx`,
          `V=${coefficient}\\pi\\left[-\\frac1x\\right]_{${a}}^\\infty=${pi(coefficient, a)}`,
        ],
      });
    },
    true,
  ),
];
