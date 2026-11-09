import type { BankContent, BankTemplate } from "./core.js";
import { fraction, term } from "./core.js";
import { pickDistractors } from "./choice-options.js";

// Ratios are reduced uniformly so formatting cannot mark an authored answer.
function ratios(values: readonly (readonly [number, number?])[]): string[] {
  return values.map(([numerator, denominator = 1]) =>
    fraction(numerator, denominator),
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
        pickDistractors(
          fraction(answer),
          ratios([
            // Omitted chain/power factors, wrong power decrement, or a repeated chain factor.
            [n * b ** (n - 1)],
            [a * b ** (n - 1)],
            [b ** (n - 1)],
            [n * a * b ** n],
            [n * a * b ** (n - 2)],
            [(n - 1) * a * b ** (n - 1)],
            [(n + 1) * a * b ** (n - 1)],
            [n * a ** (n - 1) * b],
            [n * (a * b) ** (n - 1)],
            [n * a * a * b ** (n - 1)],
            [n * a * b ** (n + 1)],
            [a * b ** (n - 1), n],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(answer),
          ratios([
            // Dropped product-rule terms, multiplied the derivatives, or misplaced k.
            [a],
            [k * b],
            [a + b],
            [k * (a + b)],
            [a * k * b],
            [a + k],
            [a * b + k],
            [k * (a * b + 1)],
            [a + k * b * b],
            [(a + b) * k * k],
            [a * k + b, k],
            [a + k * k * b, k],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(-k, c * c),
          ratios([
            // Wrong denominator power or a lost/miscombined numerator term.
            [-k, c],
            [-k, c ** 3],
            [-k, c ** 4],
            [-b, c * c],
            [-a, c * c],
            [-(a * c + b), c * c],
            [-k * k, c * c],
            [-b, c],
            [-(a + b), c * c],
            [-k, (c + 1) ** 2],
            [-k, (c + 2) ** 2],
            [-k, (c - 1) ** 2],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(2 * a, a + 1),
          ratios([
            // Omitted inner factors, used a reciprocal-square rule, or differentiated the constant.
            [a, a + 1],
            [2, a + 1],
            [2 * a, (a + 1) ** 2],
            [2],
            [2 * a],
            [a + 1, 2 * a],
            [2 * a, 2 * a + 1],
            [2 * a, a + 2],
            [a, (a + 1) ** 2],
            [2 * a, a * a + 1],
            [2 * a + 1, a + 1],
            [2 * a * a, a + 1],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(2 * a),
          ratios([
            // Omitted/inverted chain factors or confused cos² with its reciprocal.
            [a],
            [2],
            [a, 2],
            [4 * a],
            [2 * a * a],
            [a * a, 2],
            [2, a],
            [1, a],
            [1, 2 * a],
            [a, 4],
            [4 * a * a],
            [2 * (a + 1)],
            [2 * a + 1],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(-1, a * a),
          ratios([
            // Stopped after one derivative, mishandled the exponent, or evaluated at ±1.
            [-1, a],
            [-2, a * a],
            [-1, a ** 3],
            [-1, a ** 4],
            [-2, a ** 3],
            [-a],
            [-a * a],
            [-1, (a + 1) ** 2],
            [-1, (a - 1) ** 2],
            [-1, 2 * a],
            [-2, a],
            [-1, a * a + a],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(-u, a * v),
          ratios([
            // Missing or repeated a/y chain factors, wrong derivative powers, or inverted axes.
            [-u, v],
            [-a * u, v],
            [-a * a * u, v],
            [-2 * u, a * v],
            [-u, a],
            [-u, v * v],
            [-v, a * u],
            [-u, a * a * v],
            [-u, a * v * v],
            [-u, a * a * v * v],
            [-1, a * v],
            [-1, 2 * a * v],
            [-1, a * a * v * v],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(3 + b, 2 + a),
          ratios([
            // Lost power-rule terms, inverted dy/dx, or differentiated/divided twice.
            [1 + b, 2 + a],
            [3 + b, 1 + a],
            [1 + b, 1 + a],
            [2 + a, 3 + b],
            [3 + b],
            [2 + a],
            [b, 2 + a],
            [3, 2 + a],
            [3 + b, (2 + a) ** 2],
            [(3 + b) ** 2, 2 + a],
            [3 + b, 2 * (2 + a)],
            [2 * (3 + b), 2 + a],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(a ** 3 - 1),
          ratios([
            // Missed an endpoint/chain factor, added the lower endpoint, or retained the antiderivative factor.
            [a * a - 1],
            [a ** 3],
            [a ** 3 + 1],
            [a ** 3 - 1, 3],
            [a * a],
            [a - 1],
            [3 * a * a - 1],
            [a ** 3 - a],
            [a ** 3 - a * a],
            [a ** 4 - 1],
            [3 * (a ** 3 - 1)],
            [a ** 3 + 1, 3],
            [a ** 3 - 1, a],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(intercept),
          ratios(
            [
              // Used the point ordinate, lost a translation term, or divided the intercept by a slope factor.
              [b + a * a],
              [a * a + b - 2 * a],
              [-a * a],
              [b - 2 * a * a],
              [b - a],
              [2 * b - a * a, 2],
              [4 * b - a * a, 4],
              [b - a ** 3],
              [b - 2 * a ** 3],
              [b + a],
              [b + 2 * a * a],
              [2 * b - a * a],
              [2 * intercept],
              [intercept, a],
              [intercept, 2 * a],
              [intercept, 2 * a * a],
              [b - 2 * a * a, 2],
            ].filter(
              ([numerator]) =>
                intercept === 0 ||
                Math.sign(numerator) === Math.sign(intercept),
            ) as [number, number?][],
          ),
          random,
        ),
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
        pickDistractors(
          fraction(b * b, a),
          ratios([
            // Reported the tangent magnitude, inverted the wrong factor, or changed the x power.
            [a, b * b],
            [b, a],
            [b ** 3, a],
            [a * b * b],
            [b * b, 2 * a],
            [2 * b * b, a],
            [b * b, a * a],
            [b * b],
            [a, b],
            [b, a * a],
            [b ** 4, a],
            [a * a * b * b],
            [b * b, a + 1],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(k * k),
          ratios([
            // Confused perimeter with a side/area, used a nonoptimal rectangle, or inserted a triangle factor.
            [k],
            [2 * k * k],
            [4 * k * k],
            [k * k, 4],
            [k * k, 2],
            [2 * k],
            [4 * k],
            [k ** 3],
            [k * k - 1],
            [k * k - 4],
            [3 * k * k, 4],
            [2 * k * k, 3],
            [3 * k * k],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(16 * a ** 3),
          ratios([
            // Wrong critical cuts L/4,L/3,L/12, missing height, or cutting only one/both wrong dimensions.
            [a],
            [4 * a * a],
            [8 * a ** 3],
            [27 * a ** 3, 2],
            [25 * a ** 3, 2],
            [16 * a * a],
            [24 * a ** 3],
            [36 * a ** 3],
            [25 * a ** 3],
            [64 * a ** 3],
            [4 * a ** 3],
            [32 * a ** 3],
          ]),
          random,
        ),
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
        pickDistractors(
          term(answer, "\\pi"),
          ratios([
            // Dropped dr/dt, used volume instead of its rate, or differentiated the radius power/factors incorrectly.
            [4 * radius * radius],
            [4 * radius ** 3, 3],
            [8 * radius * speed],
            [4 * radius ** 3 * speed],
            [12 * radius * radius * speed],
            [4 * radius * speed],
            [4 * radius * radius * speed, 3],
            [4 * radius * radius, 3],
            [4 * radius * radius * speed * speed],
            [8 * radius * radius * speed],
            [radius * radius * speed],
            [2 * radius * radius * speed],
            [16 * radius * radius * speed],
          ]).map((value) => (value === "1" ? "\\pi" : `${value}\\pi`)),
          random,
        ),
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
        pickDistractors(
          fraction(-3 * speed, 4),
          ratios([
            // Used equal speeds, inverted x/y, substituted the ladder length, or squared the ratio.
            [-speed],
            [-4 * speed, 3],
            [-3 * speed, 5],
            [-4 * speed, 5],
            [-5 * speed, 4],
            [-9 * speed, 16],
            [-16 * speed, 9],
            [-3 * speed, 8],
            [-3 * speed, 2],
            [-3 * speed, 16],
            [-speed, 4],
            [-3 * speed],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(answer),
          ratios(
            [
              // Reported position/velocity, omitted a derivative term, or misapplied its coefficient.
              [3 * a * t * t - 2 * b * t],
              [a * t ** 3 - b * t * t],
              [6 * a * t],
              [6 * a * t - b],
              [3 * a * t - 2 * b],
              [2 * a * t - 2 * b],
              [6 * a - 2 * b],
              [6 * a * t - b * t],
              [6 * a * t + 2 * b],
              [12 * a * t - 2 * b],
              [6 * a * t - 4 * b],
              [2 * a * t],
              [3 * a * t],
              [answer, 2],
            ].filter(([numerator]) => numerator > 0) as [number, number?][],
          ),
          random,
        ),
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
        pickDistractors(
          fraction(b + 2 * a * k),
          ratios([
            // Lost a cost term, reported total cost, or divided fixed/variable cost by the wrong production power.
            [b + a * k],
            [2 * a * k],
            [b + 2 * a],
            [2 * b + a * k, 2],
            [b + a * k * k],
            [2 * a * k * k + b * k],
            [a + b + fixed],
            [b + a * k + fixed],
            [b + a + a * k],
            [b + 2 * a * k * k],
            [b + 2 * a * k, k],
          ]),
          random,
        ),
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
        pickDistractors(
          fraction(a * a + b, 2 * a),
          ratios([
            // Missed the derivative's 2x, reversed the update, or reported only the correction.
            [a * a + k, a],
            [2 * a ** 3 + k, 2 * a * a],
            [4 * a * a + k, 4 * a],
            [2 * a * a - k, 2 * a],
            [a + k],
            [k, 2 * a],
            [b, 2 * a],
            [a * a + b, a],
            [a + b, 2 * a],
            [a * a + b, 2 * b],
            [a * a + b, 4 * a],
            [a * (a + 1) + k, a + 1],
          ]),
          random,
        ),
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

// Numeric values are authored alongside each exact expression so undefined,
// nonpositive, equivalent, and accidentally correct boundary candidates never
// reach the sampler. No random parameter is drawn while constructing a pool.
const integralV3Pool = (
  correctValue: number,
  candidates: readonly (readonly [string, number])[],
): string[] => {
  const values: number[] = [];
  const result: string[] = [];
  const close = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-10 * Math.max(1, Math.abs(a), Math.abs(b));
  for (const [text, value] of candidates) {
    if (
      !Number.isFinite(value) ||
      value <= 0 ||
      close(value, correctValue) ||
      values.some((previous) => close(previous, value))
    )
      continue;
    values.push(value);
    result.push(text);
  }
  if (result.length < 6)
    throw new Error(
      `Insufficient authored integral distractors for ${correctValue}`,
    );
  return result;
};
const integralV3Fractions = (
  n: number,
  d: number,
  candidates: readonly (readonly [number, number])[],
  pi = false,
): string[] =>
  integralV3Pool(
    (n / d) * (pi ? Math.PI : 1),
    candidates.map(
      ([a, b]) =>
        [
          pi ? term(a, "\\pi", b) : fraction(a, b),
          (a / b) * (pi ? Math.PI : 1),
        ] as const,
    ),
  );
const integralV3Logs = (
  correctValue: number,
  candidates: readonly (readonly [number, number, number, number])[],
): string[] =>
  integralV3Pool(
    correctValue,
    candidates.map(
      ([coefficient, denominator, upper, lower]) =>
        [
          term(
            coefficient,
            `\\log\\!\\left(${fraction(upper, lower)}\\right)`,
            denominator,
          ),
          (coefficient / denominator) * Math.log(upper / lower),
        ] as const,
    ),
  );

const integralV3Candidates = {
  subLog(a: number, b: number) {
    const top = a + b * b,
      value = Math.log(top / a);
    return integralV3Logs(value, [
      [1, 1, top, 1],
      [1, 1, a + b, a],
      [1, 1, a * top, 1],
      [1, 1, (a + b) ** 2, a],
      [1, 1, a * a + b * b, a],
      [1, 1, a + 2 * b * b, a],
      [1, 1, 2 * a + b * b, 2 * a],
      [1, 1, 3 * a + b * b, 3 * a],
      [1, 1, 4 * a + b * b, 4 * a],
      [1, 1, a + (b + 1) ** 2, a],
      [1, 1, a * b * b, 1],
      [1, 1, top, a + 1],
      [1, 2, top, a],
      [2, 1, top, a],
    ]);
  },
  subExp(a: number, k: number) {
    const exponent = a * a,
      e = Math.exp(exponent),
      value = (k / 2) * (e - 1);
    const difference = `\\left(e^{${exponent}}-1\\right)`;
    return integralV3Pool(value, [
      [term(k, difference), k * (e - 1)],
      [term(k, difference, 4), (k / 4) * (e - 1)],
      [term(k, `e^{${exponent}}`, 2), (k / 2) * e],
      [term(k, `\\left(e^{${exponent}}+1\\right)`, 2), (k / 2) * (e + 1)],
      [term(k, `\\left(e^{${a}}-1\\right)`, 2), (k / 2) * (Math.exp(a) - 1)],
      [term(k, `\\left(e^{${exponent}}-2\\right)`, 2), (k / 2) * (e - 2)],
      [
        term(k, `\\left(e^{${exponent}}-${a + 1}\\right)`, 2),
        (k / 2) * (e - a - 1),
      ],
      [term(k, `\\left(e^{${exponent}}-e\\right)`, 2), (k / 2) * (e - Math.E)],
      [term(k, `\\left(e^{${exponent}}+e\\right)`, 2), (k / 2) * (e + Math.E)],
      [term(k, `e^{${exponent - 1}}`, 2), (k / 2) * Math.exp(exponent - 1)],
      [term(k - 1, difference, 2), ((k - 1) / 2) * (e - 1)],
      [term(k + 1, difference, 2), ((k + 1) / 2) * (e - 1)],
      [term(k, difference, 3), (k / 3) * (e - 1)],
    ]);
  },
  partsLog(b: number) {
    const value = b * Math.log(b) - b + 1;
    const signed = (constant: number) =>
      constant
        ? `${constant < 0 ? "-" : "+"}${fraction(Math.abs(constant))}`
        : "";
    const affine = (
      coefficient: number,
      constant: number,
    ): [string, number] => [
      `\\left(${term(coefficient, `\\log ${b}`)}${signed(constant)}\\right)`,
      coefficient * Math.log(b) + constant,
    ];
    const answer = `\\left(${b}\\log ${b}-${b - 1}\\right)`;
    return integralV3Pool(value, [
      affine(b, 0),
      affine(b, -b),
      affine(b, b - 1),
      affine(b - 1, 0),
      affine(b + 1, -b),
      affine(b + 1, -(b - 1)),
      affine(b - 1, -(b - 1)),
      affine(b, -(b + 1)),
      affine(1, 0),
      affine(b, 1),
      [
        `\\left(${b}\\log ${b}-${fraction(b - 1, 2)}\\right)`,
        b * Math.log(b) - (b - 1) / 2,
      ],
      [
        `\\left(${b * b}\\log ${b}-${fraction(b * b - 1, 2)}\\right)`,
        b * b * Math.log(b) - (b * b - 1) / 2,
      ],
      [term(1, answer, b), value / b],
      [term(1, answer, b + 1), value / (b + 1)],
      [`\\frac{\\left(\\log ${b}\\right)^2}{2}`, Math.log(b) ** 2 / 2],
    ]);
  },
  partsTrig(k: number) {
    return integralV3Pool(k, [
      [fraction(k, 2), k / 2],
      [fraction(k, 3), k / 3],
      [fraction(k, 4), k / 4],
      [`${2 * k}`, 2 * k],
      [fraction(3 * k, 2), (3 * k) / 2],
      [`${k + 1}`, k + 1],
      [`${k - 1}`, k - 1],
      [`${k + 2}`, k + 2],
      [term(k, "\\pi", 2), (k * Math.PI) / 2],
      [`\\left(${term(k, "\\pi", 2)}-${k}\\right)`, k * (Math.PI / 2 - 1)],
      [term(k, "\\pi^2", 8), (k * Math.PI ** 2) / 8],
      [term(k, "\\pi^3", 24), (k * Math.PI ** 3) / 24],
    ]);
  },
  partsExp(k: number) {
    const value = k * (Math.E - 2),
      answer = "\\left(e-2\\right)";
    return integralV3Pool(value, [
      [term(k, "\\left(e-1\\right)"), k * (Math.E - 1)],
      [term(k, "\\left(e+1\\right)"), k * (Math.E + 1)],
      [term(k, "\\left(e+2\\right)"), k * (Math.E + 2)],
      [term(k, "e"), k * Math.E],
      [term(k, "\\left(2e-2\\right)"), k * (2 * Math.E - 2)],
      [term(k, "\\left(2e-1\\right)"), k * (2 * Math.E - 1)],
      [term(k, "\\left(e-\\frac12\\right)"), k * (Math.E - 0.5)],
      [term(k, "\\left(e-\\frac32\\right)"), k * (Math.E - 1.5)],
      [term(k, "\\left(e-\\frac52\\right)"), k * (Math.E - 2.5)],
      [term(k, answer, 2), value / 2],
      [term(k, answer, 3), value / 3],
      [term(k - 1, answer), (k - 1) * (Math.E - 2)],
      [term(k + 1, answer), (k + 1) * (Math.E - 2)],
    ]);
  },
  partialFractions(a: number, b: number) {
    const n = (a + b) * (a + 1),
      d = a * (a + b + 1);
    return integralV3Logs(Math.log(n / d), [
      [1, 1, a + b, a],
      [1, 1, a + b + 1, a + 1],
      [1, 1, (a + b) * (a + b + 1), a * (a + 1)],
      [1, 1, a + b + 1, a],
      [1, 1, a + b, a + 1],
      [1, 1, a + 1, a],
      [1, 1, (a + b) * (a + 2), a * (a + b + 2)],
      [1, 1, (a + b + 1) * (a + 2), (a + 1) * (a + b + 2)],
      [1, 1, (a + b + 2) * (a + 1), a * (a + b + 1)],
      [2, 1, n, d],
      [1, 2, n, d],
      [1, 3, n, d],
      [1, 4, n, d],
    ]);
  },
  trigSquare(k: number) {
    const value = (k * Math.PI) / 4;
    return integralV3Pool(value, [
      [term(k, "\\pi", 2), (k * Math.PI) / 2],
      [term(k, "\\pi"), k * Math.PI],
      [`${k}`, k],
      [fraction(k, 3), k / 3],
      [term(k, "\\pi", 8), (k * Math.PI) / 8],
      [`\\left(${term(k, "\\pi", 2)}-${k}\\right)`, k * (Math.PI / 2 - 1)],
      [`\\left(${term(k, "\\pi", 4)}-${fraction(k, 4)}\\right)`, value - k / 4],
      [`\\left(${term(k, "\\pi", 4)}+${fraction(k, 4)}\\right)`, value + k / 4],
      [term(k * k, "\\pi", 4), (k * k * Math.PI) / 4],
      [term(k + 1, "\\pi", 4), ((k + 1) * Math.PI) / 4],
      [term(k - 1, "\\pi", 4), ((k - 1) * Math.PI) / 4],
    ]);
  },
  arctan(a: number) {
    return integralV3Fractions(
      1,
      4 * a,
      [
        [1, 4],
        [1, 4 * a * a],
        [a, 4],
        [1, 2 * a],
        [1, 3 * a],
        [1, 6 * a],
        [1, 8 * a],
        [1, 12 * a],
        [1, 16 * a],
        [1, 4 * (a + 1)],
        [1, 4 * (a - 1)],
        [1, a * a + 1],
        [a, 4 * (a * a + 1)],
      ],
      true,
    );
  },
  root(b: number) {
    return integralV3Fractions(2 * b ** 3, 3, [
      [b ** 3, 1],
      [b ** 3, 3],
      [2 * b ** 3, 1],
      [2 * b * b, 3],
      [b * b, 1],
      [2 * b ** 4, 3],
      [b ** 4, 2],
      [2 * b, 3],
      [b ** 3, 2],
      [3 * b ** 3, 2],
      [2 * b ** 3, 5],
      [2 * b ** 5, 5],
    ]);
  },
  absolute(a: number) {
    return integralV3Fractions(a * a, 1, [
      [a * a, 2],
      [2 * a * a, 1],
      [a, 1],
      [2 * a, 1],
      [a ** 3, 3],
      [2 * a ** 3, 3],
      [a * a + a, 1],
      [a * a - a, 1],
      [(a + 1) ** 2, 1],
      [(a - 1) ** 2, 1],
      [a * a, 3],
      [a * a, 4],
      [3 * a * a, 2],
    ]);
  },
  area(k: number) {
    return integralV3Fractions(k ** 3, 6, [
      [k ** 3, 2],
      [k ** 3, 3],
      [5 * k ** 3, 6],
      [k ** 3, 12],
      [k, 6],
      [1, 6],
      [k ** 3, 4],
      [k * k, 6],
      [k ** 4, 6],
      [k * k, 2],
      [k * k, 3],
      [3 * k - 2, 6],
      [(k - 1) ** 2 * (k + 2), 6],
      [2 * k ** 3, 3],
      [2 * k ** 3 - k * k, 2],
    ]);
  },
  disk(k: number, a: number) {
    return integralV3Fractions(
      k * a * a,
      2,
      [
        [k * a * a, 1],
        [k * a * a, 4],
        [k * a * a, 6],
        [k * a * a, 8],
        [k * k * a * a, 2],
        [k * k * a ** 3, 3],
        [k * a ** 3, 3],
        [k * a, 2],
        [k * a, 1],
        [k * a * a, 3],
        [a * a, 2],
        [k * a * (a + 1), 2],
        [k * (a + 1) ** 2, 2],
        [(k + 1) * a * a, 2],
        [k * (a * a + 1), 2],
        [a * a, 2 * k],
      ],
      true,
    );
  },
  washer(k: number) {
    return integralV3Fractions(
      2 * k * k,
      15,
      [
        [k * k, 3],
        [k * k, 5],
        [8 * k * k, 15],
        [k * k, 30],
        [2 * k, 15],
        [k * k, 15],
        [k * k, 36],
        [k * k, 12],
        [k * k, 4],
        [3 * k * k, 10],
        [k * k, 6],
      ],
      true,
    );
  },
  average(a: number, b: number, c: number) {
    const n = 3 * a + b * c * c;
    return integralV3Fractions(n, 3, [
      [a + b * c * c, 1],
      [4 * a + b * c * c, 4],
      [2 * a + b * c * c, 2],
      [a, 1],
      [a * c * 3 + b * c ** 3, 3],
      [n, 3 * c],
      [3 * a + b * c ** 3, 3],
      [3 * a + b * c * c * c, 3 * c],
      [3 * a * c + b * c ** 3, 3 * (c + 1)],
      [3 * a * c + b * c ** 3, 3 * (c - 1)],
      [2 * a + b * c, 2],
      [3 * a + c * c, 3],
      [3 * a + b * b * c * c, 3],
    ]);
  },
  distance(k: number, a: number) {
    return integralV3Fractions(k * a * a, 1, [
      [k * a * a, 2],
      [k * a * a, 3],
      [k * a * a, 4],
      [2 * k * a * a, 1],
      [3 * k * a * a, 2],
      [k * a, 1],
      [2 * k * a, 1],
      [k * a ** 3, 3],
      [2 * k * a ** 3, 3],
      [k * k * a * a, 1],
      [k * k * a ** 3, 3],
      [2 * k * k * a ** 3, 3],
      [k * a * (a + 1), 1],
      [k * a * a + k, 1],
      [k * a * a - k, 1],
      [k * (2 * a * a + 2 * a + 1), 2],
    ]);
  },
  work(k: number, a: number) {
    return integralV3Fractions(k * a * a, 2, [
      [k * a * a, 1],
      [k * a ** 3, 3],
      [k * k * a * a, 2],
      [k * a, 1],
      [k * a ** 3, 2],
      [k * a * a, 3],
      [k * a, 2],
      [k * a * a, 4],
      [(k + 1) * a * a, 2],
      [(k - 1) * a * a, 2],
      [k * (a + 1) ** 2, 2],
      [k * (a - 1) ** 2, 2],
      [k * (a * a - 1), 2],
    ]);
  },
  inflow(a: number, b: number, c: number) {
    const n = 2 * a * c + b * c * c;
    return integralV3Fractions(n, 2, [
      [a + b * c, 1],
      [a * c + b * c * c, 1],
      [a * c, 1],
      [2 * a + b * c, 2],
      [3 * a * c + b * c * c, 3],
      [2 * a * c + c * c, 2],
      [2 * a + b * c * c, 2],
      [(a + b) * c * c, 2],
      [2 * a * c + b * c, 2],
      [2 * a * c + b * b * c * c, 2],
      [2 * a * (c - 1) + b * (c * c - 1), 2],
      [2 * a * (c + 1) + b * (c + 1) ** 2, 2],
      [n - 2 * a, 2],
      [2 * a * c + b * c ** 3, 2],
      [3 * a * c + b * c ** 3, 3],
      [n + 2 * a, 2],
    ]);
  },
  wire(a: number, length: number, k: number) {
    const n = a + length,
      value = k * Math.log(n / a);
    return integralV3Logs(value, [
      [k, 1, n, 1],
      [k, 1, length, a],
      [k, 1, n + 1, a],
      [k, 1, n, a + 1],
      [k, 1, a * n, 1],
      [k, 1, n * n, a],
      [k, 1, a + length * length, a],
      [k, 1, a + 2 * length, a],
      [k, 1, 2 * a + length, 2 * a],
      [k, 1, n, n - 1],
      [k, 1, n - 1, a],
      [k, 2, n, a],
      [k, 3, n, a],
      [k, 4, n, a],
      [k + 1, 1, n, a],
      [k - 1, 1, n, a],
      [k * length, 1, n, a],
    ]);
  },
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
        pickDistractors(
          term(1, expression, 1),
          integralV3Candidates.subLog(a, b),
          random,
        ),
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
        pickDistractors(
          term(k, expression, 2),
          integralV3Candidates.subExp(a, k),
          random,
        ),
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
        pickDistractors(
          term(1, expression, 1),
          integralV3Candidates.partsLog(b),
          random,
        ),
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
        pickDistractors(`${k}`, integralV3Candidates.partsTrig(k), random),
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
        pickDistractors(
          term(k, expression),
          integralV3Candidates.partsExp(k),
          random,
        ),
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
        pickDistractors(
          term(1, expression, 1),
          integralV3Candidates.partialFractions(a, b),
          random,
        ),
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
        pickDistractors(
          term(k, "\\pi", 4),
          integralV3Candidates.trigSquare(k),
          random,
        ),
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
        pickDistractors(
          term(1, "\\pi", 4 * a),
          integralV3Candidates.arctan(a),
          random,
        ),
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
        pickDistractors(
          fraction(2 * b ** 3, 3),
          integralV3Candidates.root(b),
          random,
        ),
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
        pickDistractors(
          fraction(a * a, 1),
          integralV3Candidates.absolute(a),
          random,
        ),
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
        pickDistractors(
          fraction(k ** 3, 6),
          integralV3Candidates.area(k),
          random,
        ),
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
        pickDistractors(
          term(k * a * a, "\\pi", 2),
          integralV3Candidates.disk(k, a),
          random,
        ),
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
        pickDistractors(
          term(2 * k * k, "\\pi", 15),
          integralV3Candidates.washer(k),
          random,
        ),
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
        pickDistractors(
          fraction(3 * a + b * c * c, 3),
          integralV3Candidates.average(a, b, c),
          random,
        ),
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
        pickDistractors(
          `${k * a * a}`,
          integralV3Candidates.distance(k, a),
          random,
        ),
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
        pickDistractors(
          fraction(k * a * a, 2),
          integralV3Candidates.work(k, a),
          random,
        ),
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
        pickDistractors(
          fraction(2 * a * c + b * c * c, 2),
          integralV3Candidates.inflow(a, b, c),
          random,
        ),
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
        pickDistractors(
          term(k, expression, 1),
          integralV3Candidates.wire(a, length, k),
          random,
        ),
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
