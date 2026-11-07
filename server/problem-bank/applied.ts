import type { BankContent, BankTemplate } from "./core.js";
import { fraction, term } from "./core.js";

// Canonical fractions let us remove equivalent distractors even when a random
// parameter makes a common error coincide with another proposed answer.
function numericChoices(numerator: number, denominator = 1): string[] {
  return [
    ...new Set([
      fraction(numerator, denominator),
      fraction(-numerator, denominator),
      fraction(numerator + denominator, denominator),
      fraction(numerator - denominator, denominator),
      fraction(numerator + 2 * denominator, denominator),
    ]),
  ].slice(0, 4);
}
function piChoices(numerator: number, denominator = 1): string[] {
  return numericChoices(numerator, denominator).map((value) =>
    value === "0"
      ? "0"
      : `${value === "1" ? "" : value === "-1" ? "-" : value}\\pi`,
  );
}
function differentialContent(
  title: string,
  topic: string,
  prompt: string,
  formula: string,
  choices: string[],
  hint: string,
  explanation: string[],
  explanationFormulas: string[],
  estimatedMinutes = 6,
): BankContent {
  return {
    title,
    topic,
    prompt,
    formula,
    choices,
    hint,
    explanation,
    explanationFormulas,
    estimatedMinutes,
  };
}

const differentiationTemplates: readonly BankTemplate[] = [
  {
    id: "applied-d-chain-power",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 6),
        b = random(2, 5),
        n = random(3, 5);
      const answer = n * a * b ** (n - 1);
      return differentialContent(
        "合成されたべき関数の微分係数",
        "合成関数の微分",
        "次の関数の x = 0 における微分係数を求めてください。",
        `f(x)=(${a}x+${b})^{${n}}`,
        numericChoices(answer),
        "外側のべき関数を微分し、内側の一次関数の導関数を掛けます。",
        ["合成関数の微分公式を使います。", "x = 0 を代入して計算します。"],
        [
          `f'(x)=${n * a}(${a}x+${b})^{${n - 1}}`,
          `f'(0)=${n * a}\\cdot${b}^{${n - 1}}=${answer}`,
        ],
      );
    },
  },
  {
    id: "applied-d-polynomial-exponential",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 7),
        b = random(2, 6),
        k = random(2, 5);
      const answer = a + k * b;
      return differentialContent(
        "多項式と指数関数の積の微分",
        "積の微分",
        "次の関数について f′(0) を求めてください。",
        `f(x)=(x^2+${a}x+${b})e^{${k}x}`,
        numericChoices(answer),
        "積の微分を使い、指数関数を微分した項も足します。",
        [
          "多項式の微分と、指数関数の微分をそれぞれ用います。",
          "x = 0 では指数関数の値は1です。",
        ],
        [
          `f'(x)=\\{2x+${a}+${k}(x^2+${a}x+${b})\\}e^{${k}x}`,
          `f'(0)=${a}+${k}\\cdot${b}=${answer}`,
        ],
      );
    },
  },
  {
    id: "applied-d-rational-quotient",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 6),
        c = random(2, 5),
        k = random(1, 7),
        b = a * c + k;
      return differentialContent(
        "一次式どうしの商の微分係数",
        "商の微分",
        "次の関数の x = 0 における微分係数を求めてください。",
        `f(x)=\\frac{${a}x+${b}}{x+${c}}\\quad(x\\ne-${c})`,
        numericChoices(-k, c * c),
        "分子の導関数×分母から、分子×分母の導関数を引きます。",
        [
          "商の微分公式で分子を整理すると定数になります。",
          "分母に x = 0 を代入します。",
        ],
        [
          `f'(x)=\\frac{${a}(x+${c})-(${a}x+${b})}{(x+${c})^2}=\\frac{-${k}}{(x+${c})^2}`,
          `f'(0)=${fraction(-k, c * c)}`,
        ],
      );
    },
  },
  {
    id: "applied-d-logarithmic-chain",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 8);
      return differentialContent(
        "二次式の対数の微分係数",
        "対数関数と合成関数",
        "log は自然対数とします。f′(1) を求めてください。",
        `f(x)=\\log(1+${a}x^2)`,
        numericChoices(2 * a, a + 1),
        "log u の導関数は u′/u です。",
        ["対数の内側の導関数を、内側の式で割ります。", "x = 1 を代入します。"],
        [
          `f'(x)=\\frac{${2 * a}x}{1+${a}x^2}`,
          `f'(1)=\\frac{${2 * a}}{${a + 1}}=${fraction(2 * a, a + 1)}`,
        ],
      );
    },
  },
  {
    id: "applied-d-tangent-chain",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 8);
      return differentialContent(
        "合成された正接関数の微分係数",
        "三角関数の微分",
        "次の関数について f′(0) を求めてください。",
        `f(x)=\\tan\\left(${a}x+\\frac{\\pi}{4}\\right)`,
        numericChoices(2 * a),
        "tan u の導関数は u′/cos²u です。",
        [
          "内側の導関数を掛け、x = 0 を代入します。",
          "cos²(π/4) = 1/2 を使います。",
        ],
        [
          `f'(x)=\\frac{${a}}{\\cos^2(${a}x+\\pi/4)}`,
          `f'(0)=\\frac{${a}}{1/2}=${2 * a}`,
        ],
      );
    },
  },
  {
    id: "applied-d-second-logarithm",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 7);
      return differentialContent(
        "対数関数の二階微分係数",
        "二階微分",
        "log は自然対数とします。f″(0) を求めてください。",
        `f(x)=\\log(x+${a})\\quad(x>-${a})`,
        numericChoices(-1, a * a),
        "一階導関数を求め、さらにもう一度微分します。",
        [
          "対数を1回微分すると逆数になります。",
          "逆数を微分した後、x = 0 を代入します。",
        ],
        [
          `f'(x)=\\frac{1}{x+${a}},\\qquad f''(x)=-\\frac{1}{(x+${a})^2}`,
          `f''(0)=-\\frac{1}{${a * a}}`,
        ],
      );
    },
  },
  {
    id: "applied-d-implicit-ellipse",
    subject: "differentiation",
    application: false,
    build(random) {
      const u = random(2, 7),
        v = random(2, 5),
        a = random(2, 5),
        c = u * u + a * v * v;
      return differentialContent(
        "陰関数の微分係数",
        "陰関数の微分",
        `y を x の関数とみなします。点 (${u}, ${v}) での dy/dx を求めてください。`,
        `x^2+${a}y^2=${c}`,
        numericChoices(-u, a * v),
        "両辺を x で微分します。y² の微分には y′ が掛かります。",
        [
          "y が x によって変わることに注意して、等式の両辺を微分します。",
          "指定された点を代入します。",
        ],
        [
          `2x+${2 * a}y\\frac{dy}{dx}=0\\quad\\Longrightarrow\\quad\\frac{dy}{dx}=-\\frac{x}{${a}y}`,
          `\\left.\\frac{dy}{dx}\\right|_{(${u},${v})}=${fraction(-u, a * v)}`,
        ],
      );
    },
  },
  {
    id: "applied-d-parametric-slope",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 6),
        b = random(2, 8);
      return differentialContent(
        "媒介変数表示の微分係数",
        "媒介変数の微分",
        "次の媒介変数表示について、t = 1 での dy/dx を求めてください。",
        `x=t^2+${a}t,\\qquad y=t^3+${b}t`,
        numericChoices(3 + b, 2 + a),
        "dy/dx は (dy/dt) を (dx/dt) で割って求めます。",
        [
          "x と y をそれぞれ t で微分します。",
          "t = 1 における2つの変化率の比を取ります。",
        ],
        [
          `\\frac{dy}{dx}=\\frac{3t^2+${b}}{2t+${a}}`,
          `\\left.\\frac{dy}{dx}\\right|_{t=1}=${fraction(3 + b, 2 + a)}`,
        ],
      );
    },
  },
  {
    id: "applied-d-moving-integral-bounds",
    subject: "differentiation",
    application: false,
    build(random) {
      const a = random(2, 6);
      return differentialContent(
        "上下端が変数の積分の微分",
        "微積分の基本定理",
        "次の関数について F′(1) を求めてください。",
        `F(x)=\\int_x^{${a}x}t^2\\,dt`,
        numericChoices(a ** 3 - 1),
        "上端の寄与から下端の寄与を引き、それぞれ端点の導関数を掛けます。",
        [
          "微積分の基本定理と連鎖律を両端に適用します。",
          "上端と下端の両方の変化を考慮します。",
        ],
        [
          `F'(x)=(${a}x)^2\\cdot${a}-x^2=(${a ** 3}-1)x^2`,
          `F'(1)=${a ** 3 - 1}`,
        ],
      );
    },
  },
  {
    id: "applied-d-tangent-intercept",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 6),
        b = random(2, 8),
        intercept = b - a * a;
      return differentialContent(
        "接線と y 軸の交点",
        "接線の応用",
        `曲線上の x = ${a} における接線が y 軸と交わる点の y 座標を求めてください。`,
        `y=x^2+${b}`,
        numericChoices(intercept),
        "接点と接線の傾きを求め、接線の式に x = 0 を代入します。",
        [
          "導関数から接線の傾きを求めます。",
          "接線の式を整理すると、定数項が y 切片になります。",
        ],
        [
          `f'(${a})=${2 * a},\\qquad y-(${a * a + b})=${2 * a}(x-${a})`,
          `y=${2 * a}x${intercept < 0 ? "-" : "+"}${Math.abs(intercept)}\\quad\\Longrightarrow\\quad y(0)=${intercept}`,
        ],
      );
    },
  },
  {
    id: "applied-d-normal-gradient",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 7),
        b = random(2, 6);
      return differentialContent(
        "反比例のグラフの法線",
        "法線の応用",
        `曲線上の x = ${b} における法線の傾きを求めてください。法線は、その点で接線に垂直な直線です。`,
        `y=\\frac{${a}}{x}\\quad(x>0)`,
        numericChoices(b * b, a),
        "接線と法線の傾きの積は −1 です。",
        [
          "まず接線の傾きを導関数から求めます。",
          "その傾きの負の逆数が法線の傾きです。",
        ],
        [
          `f'(x)=-\\frac{${a}}{x^2},\\qquad f'(${b})=${fraction(-a, b * b)}`,
          `m_{\\mathrm{normal}}=-\\frac{1}{f'(${b})}=${fraction(b * b, a)}`,
        ],
      );
    },
  },
  {
    id: "applied-d-rectangle-optimization",
    subject: "differentiation",
    application: true,
    build(random) {
      const k = random(3, 10);
      return differentialContent(
        "周長が一定の長方形の最大面積",
        "最大値の応用",
        `周長が ${4 * k} cm の長方形を作ります。面積の最大値を cm² 単位で求めてください。`,
        `A(x)=x(${2 * k}-x)\\quad(0<x<${2 * k})`,
        numericChoices(k * k),
        "一辺を x とすると、もう一辺は周長の半分から x を引いた長さです。",
        [
          "面積の導関数が0となる点を求めます。",
          "導関数が正から負へ変わるため、この点で面積は最大になります。",
        ],
        [
          `A'(x)=${2 * k}-2x=0\\quad\\Longrightarrow\\quad x=${k}`,
          `A_{\\max}=${k}\\cdot${k}=${k * k}`,
        ],
      );
    },
  },
  {
    id: "applied-d-open-box-volume",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 6);
      return differentialContent(
        "正方形から作る箱の最大体積",
        "体積の最適化",
        `一辺 ${6 * a} cm の正方形の紙の四隅から一辺 x cm の正方形を切り取り、折り上げてふたのない箱を作ります。体積の最大値を cm³ 単位で求めてください。`,
        `V(x)=x(${6 * a}-2x)^2\\quad(0<x<${3 * a})`,
        numericChoices(16 * a ** 3),
        "体積を微分し、切り取り幅 x の範囲内にある停留点を調べます。",
        [
          "積の微分を使って因数分解します。",
          "x が指定範囲内で導関数は正から負に変わり、最大体積を与えます。",
        ],
        [
          `V'(x)=(${6 * a}-2x)(${6 * a}-6x)=0\\quad\\Longrightarrow\\quad x=${a}`,
          `V(${a})=${a}(${4 * a})^2=${16 * a ** 3}`,
        ],
        8,
      );
    },
  },
  {
    id: "applied-d-expanding-sphere",
    subject: "differentiation",
    application: true,
    build(random) {
      const radius = random(2, 7),
        speed = random(2, 5),
        answer = 4 * radius * radius * speed;
      return differentialContent(
        "膨張する球の体積の変化率",
        "関連する変化率",
        `球の半径は毎秒 ${speed} cm の速さで増えています。半径が ${radius} cm の瞬間の体積の変化率を cm³/秒 単位で求めてください。`,
        `V=\\frac43\\pi r^3`,
        piChoices(answer),
        "体積を時間 t で微分し、dr/dt を掛けます。",
        [
          "半径も時間の関数であるため、連鎖律を使います。",
          "指定された半径と、半径の増加速度を代入します。",
        ],
        [
          `\\frac{dV}{dt}=4\\pi r^2\\frac{dr}{dt}`,
          `\\frac{dV}{dt}=4\\pi\\cdot${radius}^2\\cdot${speed}=${term(answer, "\\pi")}`,
        ],
      );
    },
  },
  {
    id: "applied-d-sliding-ladder",
    subject: "differentiation",
    application: true,
    build(random) {
      const k = random(2, 6),
        speed = random(2, 6);
      return differentialContent(
        "はしごの上端の速度",
        "幾何と変化率",
        `長さ ${5 * k} m のはしごを垂直な壁に立て掛けます。下端の壁からの距離を x、高さを y とし、下端は壁から毎秒 ${speed} m 離れます。x = ${3 * k} m、y = ${4 * k} m の瞬間の dy/dt を m/秒 単位で求めてください。`,
        `x^2+y^2=${(5 * k) ** 2}`,
        numericChoices(-3 * speed, 4),
        "三平方の定理の等式を時間 t で微分します。高さが減るので答えの符号にも注意します。",
        [
          "はしごの長さは変わらないため、両辺の時間微分で右辺は0になります。",
          "距離と高さ、下端の速度を代入します。",
        ],
        [
          `2x\\frac{dx}{dt}+2y\\frac{dy}{dt}=0\\quad\\Longrightarrow\\quad\\frac{dy}{dt}=-\\frac{x}{y}\\frac{dx}{dt}`,
          `\\frac{dy}{dt}=-\\frac{${3 * k}}{${4 * k}}\\cdot${speed}=${fraction(-3 * speed, 4)}`,
        ],
        7,
      );
    },
  },
  {
    id: "applied-d-motion-acceleration",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 6),
        b = random(2, 5),
        t = random(2, 6),
        answer = 6 * a * t - 2 * b;
      return differentialContent(
        "位置から求める加速度",
        "運動への応用",
        `時刻 t 秒での位置 s(t) が m 単位で与えられています。t = ${t} 秒の加速度を m/秒² 単位で求めてください。`,
        `s(t)=${a}t^3-${b}t^2`,
        numericChoices(answer),
        "位置を時間で1回微分すると速度、2回微分すると加速度になります。",
        ["位置関数の二階導関数を計算します。", "指定された時刻を代入します。"],
        [
          `s'(t)=${3 * a}t^2-${2 * b}t,\\qquad s''(t)=${6 * a}t-${2 * b}`,
          `s''(${t})=${6 * a}\\cdot${t}-${2 * b}=${answer}`,
        ],
      );
    },
  },
  {
    id: "applied-d-average-cost",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 6),
        k = random(3, 9),
        b = random(1, 7),
        fixed = a * k * k;
      return differentialContent(
        "平均費用の最小値",
        "費用の最適化",
        "生産量 q に対する総費用 C(q) を円単位で表します。q は正の実数として扱います。1単位あたりの平均費用 C(q)/q の最小値を求めてください。",
        `C(q)=${a}q^2+${b}q+${fixed}\\quad(q>0)`,
        numericChoices(b + 2 * a * k),
        "総費用ではなく、総費用を生産量で割った平均費用を微分します。",
        [
          "平均費用を整理し、その導関数が0になる生産量を求めます。",
          "この点の前後で導関数は負から正に変わるため、平均費用は最小になります。",
        ],
        [
          `\\overline C(q)=${a}q+${b}+\\frac{${fixed}}q,\\quad\\overline C'(q)=${a}-\\frac{${fixed}}{q^2}=0\\quad\\Longrightarrow\\quad q=${k}`,
          `\\overline C(${k})=${a * k}+${b}+${a * k}=${b + 2 * a * k}`,
        ],
        8,
      );
    },
  },
  {
    id: "applied-d-newton-step",
    subject: "differentiation",
    application: true,
    build(random) {
      const a = random(2, 7),
        k = random(1, 6),
        b = a * a + k;
      return differentialContent(
        "ニュートン法による解の近似",
        "微分と数値計算",
        `方程式 f(x) = 0 の正の解をニュートン法で近似します。初期値 x₀ = ${a} から、1回更新した値 x₁ を求めてください。`,
        `f(x)=x^2-${b},\\qquad x_{n+1}=x_n-\\frac{f(x_n)}{f'(x_n)}`,
        numericChoices(a * a + b, 2 * a),
        "初期値での関数値と導関数の値を更新公式へ代入します。",
        [
          "導関数は 2x です。初期値での関数値は負になります。",
          "接線と x 軸の交点を、新しい近似値として採用します。",
        ],
        [
          `f(${a})=-${k},\\qquad f'(${a})=${2 * a}`,
          `x_1=${a}-\\frac{-${k}}{${2 * a}}=${fraction(a * a + b, 2 * a)}`,
        ],
      );
    },
  },
];

// Integration families are appended below; their ordering is part of the bank.

const integralContent = (
  title: string,
  topic: string,
  prompt: string,
  formula: string,
  choices: string[],
  hint: string,
  explanation: string[],
  explanationFormulas: string[],
  estimatedMinutes = 6,
): BankContent => ({
  title,
  topic,
  prompt,
  formula,
  choices,
  hint,
  explanation,
  explanationFormulas,
  estimatedMinutes,
});

// All callers supply a strictly positive answer. Multiplication by 2, 1/2,
// and -1 gives three distinct wrong values, including for logarithmic answers.
const integralMultiples = (
  numerator: number,
  denominator = 1,
  expression = "",
): string[] => {
  const format = (a: number, b: number) =>
    expression ? term(a, expression, b) : fraction(a, b);
  return [
    format(numerator, denominator),
    format(2 * numerator, denominator),
    format(numerator, 2 * denominator),
    format(-numerator, denominator),
  ];
};

const integrationTemplates: BankTemplate[] = [
  {
    id: "applied-i-substitution-log",
    subject: "integration",
    application: false,
    build(random) {
      const a = random(2, 6),
        b = random(1, 4);
      const expression = `\\log\\!\\left(${fraction(a + b * b, a)}\\right)`;
      return integralContent(
        "分母の微分を使う置換積分",
        "置換積分",
        "次の定積分の値を求めてください。log は自然対数です。",
        `\\int_0^{${b}}\\frac{2x}{x^2+${a}}\\,dx`,
        integralMultiples(1, 1, expression),
        "分母を u と置くと、分子の 2x dx が du になります。",
        [
          `u = x² + ${a} と置換すると、積分は 1/u の積分になります。`,
          "上下端を代入し、対数の差を一つの対数にまとめます。",
        ],
        [
          `u=x^2+${a},\\quad du=2x\\,dx`,
          `\\left[\\log(x^2+${a})\\right]_0^{${b}}=${expression}`,
        ],
      );
    },
  },
  {
    id: "applied-i-substitution-exponential",
    subject: "integration",
    application: false,
    build(random) {
      const a = random(1, 3),
        k = random(2, 5);
      const expression = `\\left(e^{${a * a}}-1\\right)`;
      return integralContent(
        "指数関数の置換積分",
        "置換積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{${a}}${k}x e^{x^2}\\,dx`,
        integralMultiples(k, 2, expression),
        "指数の x² を u と置き、du = 2x dx を使います。",
        [
          "u = x² と置き、係数を調整して eᵘ を積分します。",
          `変換した積分区間は 0 から ${a * a} です。`,
        ],
        [
          `\\int_0^{${a}}${k}xe^{x^2}\\,dx=${fraction(k, 2)}\\int_0^{${a * a}}e^u\\,du`,
          `${fraction(k, 2)}\\left[e^u\\right]_0^{${a * a}}=${term(k, expression, 2)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-parts-logarithm",
    subject: "integration",
    application: false,
    build(random) {
      const b = random(2, 6);
      const expression = `\\left(${b}\\log ${b}-${b - 1}\\right)`;
      return integralContent(
        "対数関数の部分積分",
        "部分積分",
        "次の定積分の値を求めてください。log は自然対数です。",
        `\\int_1^{${b}}\\log x\\,dx`,
        integralMultiples(1, 1, expression),
        "log x を微分する側、1 を積分する側に選びます。",
        [
          "部分積分により、log x の原始関数は x log x − x です。",
          "下端 x = 1 での値は −1 なので、その値を引きます。",
        ],
        [
          `\\int\\log x\\,dx=x\\log x-x+C`,
          `\\left[x\\log x-x\\right]_1^{${b}}=${b}\\log ${b}-${b - 1}`,
        ],
      );
    },
  },
  {
    id: "applied-i-parts-trigonometric",
    subject: "integration",
    application: false,
    build(random) {
      const k = random(2, 8);
      return integralContent(
        "一次式と三角関数の部分積分",
        "部分積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{\\pi/2}${k}x\\sin x\\,dx`,
        [`${k}`, term(k, "\\pi", 2), `${-k}`, fraction(k, 2)],
        "x を微分し、sin x を積分して −cos x にします。",
        [
          "部分積分によって、端点の項と cos x の積分に分けます。",
          "端点の項は上下端とも 0 になり、sin x の差だけが残ります。",
        ],
        [
          `\\int_0^{\\pi/2}${k}x\\sin x\\,dx=\\left[-${k}x\\cos x\\right]_0^{\\pi/2}+${k}\\int_0^{\\pi/2}\\cos x\\,dx`,
          `${k}\\left[\\sin x\\right]_0^{\\pi/2}=${k}`,
        ],
      );
    },
  },
  {
    id: "applied-i-parts-quadratic-exponential",
    subject: "integration",
    application: false,
    build(random) {
      const k = random(2, 6);
      const expression = "\\left(e-2\\right)";
      return integralContent(
        "部分積分を2回使う定積分",
        "部分積分",
        "次の定積分の値を求めてください。",
        `\\int_0^1${k}x^2e^x\\,dx`,
        [
          term(k, expression),
          term(k, "\\left(e-1\\right)"),
          term(k, "\\left(e+2\\right)"),
          term(k, "e"),
        ],
        "x² を微分する側に選び、残る x eˣ の積分にも部分積分を使います。",
        [
          "部分積分を2回行い、多項式の次数を下げます。",
          "下端では括弧内が 2、上端では 1 になります。",
        ],
        [
          `\\int x^2e^x\\,dx=(x^2-2x+2)e^x+C`,
          `${k}\\left[(x^2-2x+2)e^x\\right]_0^1=${term(k, expression)}`,
        ],
        7,
      );
    },
  },
  {
    id: "applied-i-partial-fractions",
    subject: "integration",
    application: false,
    build(random) {
      const a = random(1, 5),
        b = random(1, 4);
      const expression = `\\log\\!\\left(${fraction((a + b) * (a + 1), a * (a + b + 1))}\\right)`;
      return integralContent(
        "部分分数分解による定積分",
        "部分分数分解",
        "次の定積分の値を求めてください。log は自然対数です。",
        `\\int_0^{${b}}\\frac{1}{(x+${a})(x+${a + 1})}\\,dx`,
        integralMultiples(1, 1, expression),
        "1/(x+a) − 1/(x+a+1) の形に分解できます。",
        [
          "分母の一次式の差が 1 なので、二つの逆数の差に分解できます。",
          "対数の差の上下端を計算し、一つの対数にまとめます。",
        ],
        [
          `\\frac{1}{(x+${a})(x+${a + 1})}=\\frac1{x+${a}}-\\frac1{x+${a + 1}}`,
          `\\left[\\log\\frac{x+${a}}{x+${a + 1}}\\right]_0^{${b}}=${expression}`,
        ],
      );
    },
  },
  {
    id: "applied-i-trigonometric-square",
    subject: "integration",
    application: false,
    build(random) {
      const k = random(2, 8);
      return integralContent(
        "半角公式を使う定積分",
        "三角関数の積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{\\pi/2}${k}\\sin^2 x\\,dx`,
        [
          term(k, "\\pi", 4),
          term(k, "\\pi", 2),
          term(k, "\\pi"),
          term(-k, "\\pi", 4),
        ],
        "sin²x = (1 − cos 2x)/2 の半角公式を使います。",
        [
          "半角公式で、定数と cos 2x の積分に分けます。",
          "sin 2x の端点の値はいずれも 0 です。",
        ],
        [
          `${k}\\sin^2x=${fraction(k, 2)}(1-\\cos2x)`,
          `${fraction(k, 2)}\\left[x-\\frac{\\sin2x}{2}\\right]_0^{\\pi/2}=${term(k, "\\pi", 4)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-arctangent-substitution",
    subject: "integration",
    application: false,
    build(random) {
      const a = random(2, 6);
      return integralContent(
        "逆正接を使う定積分",
        "逆三角関数の積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{${a}}\\frac{1}{${a * a}+x^2}\\,dx`,
        [
          term(1, "\\pi", 4 * a),
          term(1, "\\pi", 2 * a),
          term(3, "\\pi", 4 * a),
          term(-1, "\\pi", 4 * a),
        ],
        "x = a u と置くと、1/(1+u²) の積分になります。",
        [
          "x = a u と置換すると、積分区間は 0 から 1 になります。",
          "arctan 1 = π/4 を使います。",
        ],
        [
          `\\int_0^{${a}}\\frac{dx}{${a * a}+x^2}=${fraction(1, a)}\\int_0^1\\frac{du}{1+u^2}`,
          `${fraction(1, a)}\\left[\\arctan u\\right]_0^1=${term(1, "\\pi", 4 * a)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-root-substitution",
    subject: "integration",
    application: false,
    build(random) {
      const b = random(2, 5),
        a = b * b;
      return integralContent(
        "一次式の平方根の定積分",
        "置換積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{${a}}\\sqrt{${a}-x}\\,dx`,
        integralMultiples(2 * b ** 3, 3),
        "u = a − x と置くと du = −dx となり、積分の上下端が逆になります。",
        [
          "置換後に積分区間を入れ替え、u の 1/2 乗を積分します。",
          "a は b² なので a の 3/2 乗は b³ です。",
        ],
        [
          `\\int_0^{${a}}\\sqrt{${a}-x}\\,dx=\\int_0^{${a}}u^{1/2}\\,du`,
          `\\left[\\frac23u^{3/2}\\right]_0^{${a}}=${fraction(2 * b ** 3, 3)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-absolute-value",
    subject: "integration",
    application: false,
    build(random) {
      const a = random(2, 6);
      return integralContent(
        "絶対値を含む定積分",
        "区分積分",
        "次の定積分の値を求めてください。",
        `\\int_0^{2 * a}|x-${a}|\\,dx`,
        integralMultiples(a * a),
        "絶対値の中身が 0 になる x = a で区間を分けます。",
        [
          `0 ≦ x ≦ ${a} では ${a} − x、${a} ≦ x ≦ ${2 * a} では x − ${a} です。`,
          `二つの積分は等しく、それぞれ ${fraction(a * a, 2)} になります。`,
        ],
        [
          `\\int_0^{${a}}(${a}-x)\\,dx+\\int_{${a}}^{2 * a}(x-${a})\\,dx`,
          `${fraction(a * a, 2)}+${fraction(a * a, 2)}=${a * a}`,
        ],
      );
    },
  },
  {
    id: "applied-i-area-line-parabola",
    subject: "integration",
    application: true,
    build(random) {
      const k = random(2, 6);
      return integralContent(
        "直線と放物線で囲まれた面積",
        "面積への応用",
        "次の2曲線で囲まれた部分の面積を求めてください。",
        `y=${k}x,\\qquad y=x^2`,
        integralMultiples(k ** 3, 6),
        "交点の x 座標を求め、その間で上の曲線から下の曲線を引きます。",
        [
          `交点は x = 0 と x = ${k} です。この区間では直線が上にあります。`,
          `面積は ${k}x − x² を 0 から ${k} まで積分して求めます。`,
        ],
        [
          `S=\\int_0^{${k}}(${k}x-x^2)\\,dx`,
          `S=\\left[${fraction(k, 2)}x^2-\\frac{x^3}{3}\\right]_0^{${k}}=${fraction(k ** 3, 6)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-disk-volume",
    subject: "integration",
    application: true,
    build(random) {
      const k = random(2, 6),
        a = random(1, 4);
      return integralContent(
        "平方根のグラフの回転体積",
        "体積への応用",
        `曲線 y = √(${k}x)、x 軸、直線 x = ${a} で囲まれた部分を x 軸のまわりに1回転した立体の体積を求めてください。`,
        `y=\\sqrt{${k}x},\\qquad 0\\le x\\le${a}`,
        integralMultiples(k * a * a, 2, "\\pi"),
        "x における断面は半径 y の円なので、その面積は πy² です。",
        [
          `断面積 πy² = ${k}πx を x について積分します。`,
          "円の半径を2乗するため、平方根は消えます。",
        ],
        [`V=\\pi\\int_0^{${a}}${k}x\\,dx`, `V=${term(k * a * a, "\\pi", 2)}`],
      );
    },
  },
  {
    id: "applied-i-washer-volume",
    subject: "integration",
    application: true,
    build(random) {
      const k = random(2, 6);
      return integralContent(
        "2曲線の間の領域の回転体積",
        "体積への応用",
        "次の2曲線で囲まれた部分を x 軸のまわりに1回転した立体の体積を求めてください。",
        `y=${k}x,\\qquad y=${k}x^2`,
        integralMultiples(2 * k * k, 15, "\\pi"),
        "交点は x = 0, 1 です。断面積は外側の円の面積から内側の円の面積を引きます。",
        [
          `0 ≦ x ≦ 1 では ${k}x が外側の半径、${k}x² が内側の半径になります。`,
          "二つの半径を別々に2乗し、その差を積分します。",
        ],
        [
          `V=\\pi\\int_0^1\\left((${k}x)^2-(${k}x^2)^2\\right)\\,dx`,
          `V=${k * k}\\pi\\left(\\frac13-\\frac15\\right)=${term(2 * k * k, "\\pi", 15)}`,
        ],
        7,
      );
    },
  },
  {
    id: "applied-i-average-temperature",
    subject: "integration",
    application: true,
    build(random) {
      const a = random(10, 20),
        b = random(1, 4),
        c = random(2, 5);
      return integralContent(
        "時間区間での平均温度",
        "平均値への応用",
        `ある部屋の温度 T(t)（℃）が次の式で表されます。0 ≦ t ≦ ${c} における平均温度を求めてください。`,
        `T(t)=${a}+${term(b, "t^2")}`,
        [
          fraction(3 * a + b * c * c, 3),
          fraction(2 * a + b * c * c, 2),
          `${a + b * c * c}`,
          fraction(4 * a + b * c * c, 4),
        ],
        "区間での関数の平均値は、積分値を区間の長さで割ります。",
        [
          `区間の長さは ${c} なので、温度の積分を ${c} で割ります。`,
          "端点での温度の単純平均とは一般に異なります。",
        ],
        [
          `\\overline T=\\frac1{${c}}\\int_0^{${c}}(${a}+${term(b, "t^2")})\\,dt`,
          `\\overline T=${a}+${fraction(b * c * c, 3)}=${fraction(3 * a + b * c * c, 3)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-distance-reversal",
    subject: "integration",
    application: true,
    build(random) {
      const k = random(2, 5),
        a = random(1, 4);
      return integralContent(
        "向きが変わる運動の移動距離",
        "運動への応用",
        `直線上を動く物体の速度 v(t)（m/s）が次の式で与えられます。t = 0 から t = ${2 * a} 秒までの移動距離（m）を求めてください。`,
        `v(t)=${k}(t-${a})`,
        [`${k * a * a}`, "0", `${2 * k * a * a}`, fraction(k * a * a, 2)],
        "移動距離は速度ではなく速さ |v(t)| の積分です。t = a で向きが変わります。",
        [
          "前半は速度が負、後半は速度が正です。各区間の速さを積分して足します。",
          "変位は 0 ですが、移動距離は正です。",
        ],
        [
          `D=${k}\\int_0^{${a}}(${a}-t)\\,dt+${k}\\int_{${a}}^{2 * a}(t-${a})\\,dt`,
          `D=${fraction(k * a * a, 2)}+${fraction(k * a * a, 2)}=${k * a * a}`,
        ],
      );
    },
  },
  {
    id: "applied-i-spring-work",
    subject: "integration",
    application: true,
    build(random) {
      const k = random(2, 10),
        a = random(2, 5);
      return integralContent(
        "ばねを伸ばす仕事",
        "仕事への応用",
        `ばねを自然長から x m 伸ばすのに必要な力が F(x) = ${k}x N とします。自然長から ${a} m までゆっくり伸ばす仕事（J）を求めてください。`,
        `F(x)=${k}x,\\qquad 0\\le x\\le${a}`,
        [
          fraction(k * a * a, 2),
          `${k * a * a}`,
          fraction(k * a * a, 4),
          fraction(3 * k * a * a, 2),
        ],
        "力が位置によって変わるとき、仕事は力を位置で積分して求めます。",
        [
          "微小な変位 dx に必要な仕事は F(x) dx です。",
          `力と変位の単純な積ではなく、0 から ${a} まで積分します。`,
        ],
        [
          `W=\\int_0^{${a}}${k}x\\,dx`,
          `W=\\left[${fraction(k, 2)}x^2\\right]_0^{${a}}=${fraction(k * a * a, 2)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-inflow-volume",
    subject: "integration",
    application: true,
    build(random) {
      const a = random(2, 8),
        b = random(1, 4),
        c = random(2, 5);
      return integralContent(
        "変化する流入量の合計",
        "流量への応用",
        `水槽へ水を入れる速さ r(t)（L/分）が次の式で与えられます。開始から ${c} 分間に入った水の量（L）を求めてください。水の流出はないものとします。`,
        `r(t)=${a}+${term(b, "t")},\\qquad 0\\le t\\le${c}`,
        [
          fraction(2 * a * c + b * c * c, 2),
          `${a * c + b * c * c}`,
          fraction(3 * a * c + b * c * c, 3),
          fraction(4 * a * c + b * c * c, 4),
        ],
        "単位時間あたりの量を時間で積分すると、合計量になります。",
        [
          `流入速度を 0 分から ${c} 分まで積分します。`,
          "初期流量の項と、時間とともに増える流量の項を分けて計算します。",
        ],
        [
          `Q=\\int_0^{${c}}(${a}+${term(b, "t")})\\,dt`,
          `Q=${a * c}+${fraction(b * c * c, 2)}=${fraction(2 * a * c + b * c * c, 2)}`,
        ],
      );
    },
  },
  {
    id: "applied-i-variable-wire-density",
    subject: "integration",
    application: true,
    build(random) {
      const a = random(1, 4),
        length = random(2, 5),
        k = random(2, 6);
      const expression = `\\log\\!\\left(${fraction(a + length, a)}\\right)`;
      return integralContent(
        "密度が一定でない針金の質量",
        "密度への応用",
        `長さ ${length} m の針金の線密度 ρ(x)（kg/m）が次の式で与えられます。針金全体の質量（kg）を求めてください。x は一端からの距離です。`,
        `\\rho(x)=\\frac{${k}}{x+${a}},\\qquad 0\\le x\\le${length}`,
        integralMultiples(k, 1, expression),
        "長さ dx の部分の質量は ρ(x) dx です。針金全体について足し合わせます。",
        [
          "線密度を長さ方向に積分すると全体の質量になります。",
          "log(x+a) の上下端を代入して対数の差をまとめます。",
        ],
        [
          `M=\\int_0^{${length}}\\frac{${k}}{x+${a}}\\,dx`,
          `M=${k}\\log\\!\\left(${fraction(a + length, a)}\\right)`,
        ],
      );
    },
  },
];

export const appliedTemplates: readonly BankTemplate[] = [
  ...differentiationTemplates,
  ...integrationTemplates,
];
