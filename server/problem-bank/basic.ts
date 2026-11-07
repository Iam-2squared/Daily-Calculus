import type { BankContent, BankTemplate } from "./core.js";
import { fraction, term, xPower } from "./core.js";

function question(
  content: Omit<BankContent, "estimatedMinutes"> & {
    estimatedMinutes?: number;
  },
): BankContent {
  return { estimatedMinutes: 3, ...content };
}
function line(slope: number, intercept: number): string {
  return `${term(slope, "x")}${intercept > 0 ? `+${intercept}` : intercept < 0 ? `-${-intercept}` : ""}`;
}
const C = "+C";

export const basicTemplates: readonly BankTemplate[] = [
  {
    id: "basic-d-power",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 7),
        n = r(2, 4),
        a = r(1, 3),
        value = k * n * a ** (n - 1);
      return question({
        title: "べき関数の微分係数",
        topic: "微分係数",
        prompt: `x = ${a} における微分係数を求めてください。`,
        formula: `f(x)=${k}x^{${n}}`,
        choices: [`${value}`, `${value / n}`, `${-value}`, `${value * n}`],
        hint: "指数を係数に下ろして指数を1つ減らし、指定された値を代入します。",
        explanation: ["べき関数の微分公式を使います。"],
        explanationFormulas: [
          `f'(x)=${k * n}${xPower(n - 1)}`,
          `f'(${a})=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-d-polynomial",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 8),
        b = r(1, 8),
        c = r(1, 8);
      return question({
        title: "多項式の導関数",
        topic: "和の微分",
        prompt: "次の関数の導関数を選んでください。",
        formula: `f(x)=${k}x^2+${term(b, "x")}+${c}`,
        choices: [
          `${2 * k}x+${b}`,
          `${k}x+${b}`,
          `${2 * k}x-${b}`,
          `${2 * k}x+${b + c}`,
        ],
        hint: "項ごとに微分します。定数の微分は0です。",
        explanation: [
          "二次の項は一次に、一次の項は定数になります。最後の定数項は消えます。",
        ],
        explanationFormulas: [`f'(x)=${2 * k}x+${b}`],
      });
    },
  },
  {
    id: "basic-d-product",
    subject: "differentiation",
    application: false,
    build(r) {
      const a = r(1, 5),
        b = r(2, 6),
        c = r(1, 3),
        value = 2 * c + a + b;
      return question({
        title: "一次式の積の微分",
        topic: "積の微分",
        prompt: `x = ${c} における微分係数を求めてください。`,
        formula: `f(x)=(x+${a})(x+${b})`,
        choices: [`${value}`, `${a + b}`, `${value + a + b}`, `${-value}`],
        hint: "積の微分公式を使うか、式を展開してから微分します。",
        explanation: [
          "積を微分すると、一方を微分した項と、もう一方を微分した項の和になります。",
        ],
        explanationFormulas: [
          `f'(x)=(x+${b})+(x+${a})=2x+${a + b}`,
          `f'(${c})=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-d-reciprocal",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 8),
        a = r(1, 5),
        b = r(1, 4),
        denominator = (a + b) ** 2;
      return question({
        title: "一次式の逆数の微分",
        topic: "逆数の微分",
        prompt: `x = ${b} における微分係数を求めてください。`,
        formula: `f(x)=\\frac{${k}}{x+${a}}`,
        choices: [
          fraction(-k, denominator),
          fraction(k, denominator),
          fraction(-k, a + b),
          fraction(-k, (a + b) ** 3),
        ],
        hint: "分母の一次式の−1乗と考えて微分できます。",
        explanation: ["逆数を微分すると負の符号が付き、分母が二乗になります。"],
        explanationFormulas: [
          `f'(x)=-\\frac{${k}}{(x+${a})^2}`,
          `f'(${b})=${fraction(-k, denominator)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-root",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 8),
        a = r(2, 6);
      return question({
        title: "平方根の微分係数",
        topic: "根号を含む関数の微分",
        prompt: `x = ${a * a} における微分係数を求めてください。`,
        formula: `f(x)=${k}\\sqrt{x}`,
        choices: [
          fraction(k, 2 * a),
          fraction(k, a),
          fraction(-k, 2 * a),
          fraction(k, 2 * a * a),
        ],
        hint: "√x は x の1/2乗です。微分した後に x の値を代入します。",
        explanation: ["平方根の導関数は 1/(2√x) です。"],
        explanationFormulas: [
          `f'(x)=\\frac{${k}}{2\\sqrt{x}}`,
          `f'(${a * a})=${fraction(k, 2 * a)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-reciprocal-root",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 8),
        a = r(2, 5);
      return question({
        title: "平方根の逆数の微分",
        topic: "負の指数の微分",
        prompt: `x = ${a * a} における微分係数を求めてください。`,
        formula: `f(x)=\\frac{${k}}{\\sqrt{x}}`,
        choices: [
          fraction(-k, 2 * a ** 3),
          fraction(k, 2 * a ** 3),
          fraction(-k, 2 * a * a),
          fraction(-k, 2 * a ** 4),
        ],
        hint: "1/√x を x の−1/2乗と書き換えます。",
        explanation: ["べき関数の微分公式を負の指数に適用します。"],
        explanationFormulas: [
          `f'(x)=-\\frac{${k}}{2x^{3/2}}`,
          `f'(${a * a})=${fraction(-k, 2 * a ** 3)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-exponential",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 9),
        b = r(1, 8);
      return question({
        title: "指数関数の微分係数",
        topic: "指数関数の微分",
        prompt: "x = 0 における微分係数を求めてください。",
        formula: `f(x)=${k}e^x+${b}`,
        choices: [`${k}`, `${k + b}`, `${-k}`, `${k + 2 * b}`],
        hint: "eˣ を微分しても eˣ のままです。e⁰ = 1 を使います。",
        explanation: ["定数項の微分は0なので、指数関数の項だけが残ります。"],
        explanationFormulas: [`f'(x)=${k}e^x`, `f'(0)=${k}`],
      });
    },
  },
  {
    id: "basic-d-logarithm",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 9),
        a = r(2, 8);
      return question({
        title: "自然対数の微分係数",
        topic: "対数関数の微分",
        prompt: `x = ${a} における微分係数を求めてください。log は自然対数です。`,
        formula: `f(x)=${k}\\log x`,
        choices: [
          fraction(k, a),
          fraction(-k, a),
          `${k * a}`,
          fraction(k, a * a),
        ],
        hint: "自然対数の導関数は 1/x です。",
        explanation: [
          "定数倍の微分公式を使ってから、指定された値を代入します。",
        ],
        explanationFormulas: [
          `f'(x)=\\frac{${k}}{x}`,
          `f'(${a})=${fraction(k, a)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-sine",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 12);
      return question({
        title: "正弦関数の導関数",
        topic: "三角関数の微分",
        prompt: "次の関数の導関数を選んでください。角度はラジアンです。",
        formula: `f(x)=${k}\\sin x`,
        choices: [`${k}\\cos x`, `${k}\\sin x`, `-${k}\\cos x`, `-${k}\\sin x`],
        hint: "sin x を微分すると cos x になります。",
        explanation: ["係数はそのままにして、正弦関数の微分公式を使います。"],
        explanationFormulas: [`f'(x)=${k}\\cos x`],
      });
    },
  },
  {
    id: "basic-d-cosine",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 12);
      return question({
        title: "余弦関数の導関数",
        topic: "三角関数の微分",
        prompt: "次の関数の導関数を選んでください。角度はラジアンです。",
        formula: `f(x)=${k}\\cos x`,
        choices: [`-${k}\\sin x`, `${k}\\sin x`, `${k}\\cos x`, `-${k}\\cos x`],
        hint: "cos x を微分すると −sin x になります。",
        explanation: ["余弦関数の微分では、負の符号に注意します。"],
        explanationFormulas: [`f'(x)=-${k}\\sin x`],
      });
    },
  },
  {
    id: "basic-d-chain",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 6),
        b = r(1, 7),
        a = r(1, 3),
        value = 2 * k * (k * a + b);
      return question({
        title: "一次式の二乗の微分",
        topic: "合成関数の微分",
        prompt: `x = ${a} における微分係数を求めてください。`,
        formula: `f(x)=(${k}x+${b})^2`,
        choices: [`${value}`, `${value / k}`, `${2 * value}`, `${-value}`],
        hint: "外側の二乗を微分した式に、内側の一次式の導関数を掛けます。",
        explanation: [
          "連鎖律を使います。内側の微分を掛け忘れないようにします。",
        ],
        explanationFormulas: [
          `f'(x)=${2 * k}(${k}x+${b})`,
          `f'(${a})=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-d-tangent-slope",
    subject: "differentiation",
    application: true,
    build(r) {
      const k = r(2, 7),
        b = r(1, 7),
        a = r(1, 4),
        value = 2 * k * a;
      return question({
        title: "接線の傾き",
        topic: "微分と接線",
        prompt: `次の曲線上の x = ${a} の点における、接線の傾きを求めてください。`,
        formula: `y=${k}x^2+${b}`,
        choices: [`${value}`, `${value / 2}`, `${-value}`, `${value + k}`],
        hint: "接線の傾きは、その点での微分係数です。",
        explanation: [
          "曲線の式を微分し、接点の x 座標を代入すると接線の傾きが得られます。",
        ],
        explanationFormulas: [`y'=${2 * k}x`, `m=${2 * k}\\cdot${a}=${value}`],
      });
    },
  },
  {
    id: "basic-d-tangent-equation",
    subject: "differentiation",
    application: true,
    build(r) {
      const k = r(2, 6),
        c = r(1, 8),
        a = r(1, 3),
        slope = 2 * k * a,
        intercept = c - k * a * a;
      return question({
        title: "接線の方程式",
        topic: "微分と接線",
        estimatedMinutes: 4,
        prompt: `次の曲線上の x = ${a} の点における、接線の方程式を選んでください。`,
        formula: `y=${k}x^2+${c}`,
        choices: [
          `y=${line(slope, intercept)}`,
          `y=${line(slope / 2, intercept)}`,
          `y=${line(slope, c + k * a * a)}`,
          `y=${line(-slope, intercept)}`,
        ],
        hint: "接点の座標と接線の傾きを求め、点を通る直線の式に代入します。",
        explanation: [
          "導関数から接線の傾きを求めます。接線が接点を通る条件から切片を計算します。",
        ],
        explanationFormulas: [
          `m=${slope},\\quad (${a},${k * a * a + c})`,
          `y-${k * a * a + c}=${slope}(x-${a})`,
          `y=${line(slope, intercept)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-normal",
    subject: "differentiation",
    application: true,
    build(r) {
      const k = r(2, 7),
        a = r(1, 4),
        slope = 2 * k * a;
      return question({
        title: "法線の傾き",
        topic: "接線と法線",
        estimatedMinutes: 4,
        prompt: `次の曲線上の x = ${a} の点で、接線に垂直な直線（法線）の傾きを求めてください。`,
        formula: `y=${k}x^2`,
        choices: [
          fraction(-1, slope),
          fraction(1, slope),
          `${-slope}`,
          `${slope}`,
        ],
        hint: "垂直な2直線の傾きの積は−1です。まず接線の傾きを求めます。",
        explanation: [
          "微分係数が接線の傾きです。その負の逆数が法線の傾きになります。",
        ],
        explanationFormulas: [
          `m_{\\mathrm{tangent}}=${slope}`,
          `m_{\\mathrm{normal}}=-\\frac1{${slope}}=${fraction(-1, slope)}`,
        ],
      });
    },
  },
  {
    id: "basic-d-velocity",
    subject: "differentiation",
    application: true,
    build(r) {
      const k = r(2, 6),
        b = r(1, 8),
        c = r(0, 8),
        a = r(1, 4),
        value = 2 * k * a + b;
      return question({
        title: "位置から速度を求める",
        topic: "微分と運動",
        prompt: `直線上を動く物体の時刻 t 秒での位置 s(t) が次の式で与えられます。t = ${a} 秒での速度を求めてください。位置の単位は m、答えの単位は m/s です。`,
        formula: `s(t)=${k}t^2+${term(b, "t")}${c ? `+${c}` : ""}`,
        choices: [`${value}`, `${k * a + b}`, `${value + b}`, `${-value}`],
        hint: "位置を時刻で微分すると、瞬間の速度になります。",
        explanation: [
          "位置の導関数を求め、その時刻を代入します。定数の位置のずれは速度に影響しません。",
        ],
        explanationFormulas: [`v(t)=s'(t)=${2 * k}t+${b}`, `v(${a})=${value}`],
      });
    },
  },
  {
    id: "basic-d-acceleration",
    subject: "differentiation",
    application: true,
    build(r) {
      const k = r(2, 5),
        b = r(1, 6),
        a = r(1, 3),
        value = 6 * k * a + 2 * b;
      return question({
        title: "位置から加速度を求める",
        topic: "二階微分と運動",
        estimatedMinutes: 4,
        prompt: `直線上を動く物体の位置 s(t) が次の式で与えられます。t = ${a} 秒での加速度を求めてください。位置の単位は m、答えの単位は m/s² です。`,
        formula: `s(t)=${k}t^3+${term(b, "t^2")}`,
        choices: [
          `${value}`,
          `${3 * k * a + 2 * b}`,
          `${3 * k * a + b}`,
          `${-value}`,
        ],
        hint: "位置を1回微分すると速度、2回微分すると加速度です。",
        explanation: ["位置の式を時刻で2回微分します。"],
        explanationFormulas: [
          `s'(t)=${3 * k}t^2+${2 * b}t`,
          `s''(t)=${6 * k}t+${2 * b}`,
          `s''(${a})=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-d-increasing",
    subject: "differentiation",
    application: false,
    build(r) {
      const a = r(1, 8);
      return question({
        title: "導関数の符号と増加区間",
        topic: "関数の増減",
        prompt: "次の関数の導関数が正となる x の範囲を選んでください。",
        formula: `f(x)=(x-${a})^2`,
        choices: [`x>${a}`, `x<${a}`, `x\\in\\mathbb{R}`, "\\varnothing"],
        hint: "導関数が正の区間では関数が増加します。一次の不等式を解きましょう。",
        explanation: [
          "二次関数を微分すると一次式になります。その符号を調べます。",
        ],
        explanationFormulas: [`f'(x)=2(x-${a})`, `f'(x)>0\\iff x>${a}`],
      });
    },
  },
  {
    id: "basic-d-definition",
    subject: "differentiation",
    application: false,
    build(r) {
      const k = r(2, 8),
        a = r(1, 5),
        value = 2 * k * a;
      return question({
        title: "微分係数の定義による極限",
        topic: "微分係数の定義",
        prompt: "次の極限値を求めてください。",
        formula: `\\lim_{h\\to0}\\frac{${k}(${a}+h)^2-${k * a * a}}{h}`,
        choices: [`${value}`, `${value / 2}`, `${-value}`, `${value + k}`],
        hint: "分子を展開し、共通の因数 h を約分してから極限を取ります。",
        explanation: [
          "分子の定数項は打ち消し合います。h で約分すると一次式が残ります。",
        ],
        explanationFormulas: [
          `\\frac{${k}(${a}+h)^2-${k * a * a}}h=${value}+${k}h`,
          `\\lim_{h\\to0}(${value}+${k}h)=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-i-constant",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 12);
      return question({
        title: "定数の不定積分",
        topic: "不定積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}\\,dx`,
        choices: [
          `${k}x${C}`,
          `-${k}x${C}`,
          `${term(1, "x", k)}${C}`,
          `${k}x^2${C}`,
        ],
        hint: "微分して定数 k になる関数は、kx です。",
        explanation: [
          "定数関数を積分すると、x を掛けた一次関数になります。積分定数 C も加えます。",
        ],
        explanationFormulas: [`\\int ${k}\\,dx=${k}x${C}`],
      });
    },
  },
  {
    id: "basic-i-power",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 8),
        n = r(2, 5);
      return question({
        title: "べき関数の不定積分",
        topic: "べき関数の積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}x^{${n}}\\,dx`,
        choices: [
          `${term(k, `x^{${n + 1}}`, n + 1)}${C}`,
          `${k}x^{${n + 1}}${C}`,
          `-${term(k, `x^{${n + 1}}`, n + 1)}${C}`,
          `${term(k, `x^{${n}}`, n + 1)}${C}`,
        ],
        hint: "指数を1つ増やし、新しい指数で係数を割ります。",
        explanation: ["べき関数の不定積分の公式を使います。"],
        explanationFormulas: [
          `\\int ${k}x^{${n}}\\,dx=${term(k, `x^{${n + 1}}`, n + 1)}${C}`,
        ],
      });
    },
  },
  {
    id: "basic-i-polynomial",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 7),
        b = r(1, 7),
        c = r(1, 6),
        cubic = term(k, "x^3", 3),
        quadratic = term(b, "x^2", 2),
        linear = term(c, "x");
      return question({
        title: "多項式の不定積分",
        topic: "和の積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int(${k}x^2+${term(b, "x")}+${c})\\,dx`,
        choices: [
          `${cubic}+${quadratic}+${linear}${C}`,
          `${cubic}-${quadratic}+${linear}${C}`,
          `${k}x^3+${quadratic}+${linear}${C}`,
          `-${cubic}-${quadratic}-${linear}${C}`,
        ],
        hint: "それぞれの項を別々に積分して足し合わせます。",
        explanation: [
          "和の積分は、各項の積分の和になります。定数項の積分も忘れずに計算します。",
        ],
        explanationFormulas: [
          `\\int(${k}x^2+${term(b, "x")}+${c})\\,dx=${cubic}+${quadratic}+${linear}${C}`,
        ],
      });
    },
  },
  {
    id: "basic-i-reciprocal",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 9);
      return question({
        title: "逆数の不定積分",
        topic: "対数関数と積分",
        prompt:
          "x ≠ 0 の区間での不定積分を選んでください。log は自然対数、C は積分定数です。",
        formula: `\\int\\frac{${k}}{x}\\,dx`,
        choices: [
          `${k}\\log|x|${C}`,
          `-${k}\\log|x|${C}`,
          `\\frac{${k}}x${C}`,
          `${term(1, "x", k)}${C}`,
        ],
        hint: "指数が−1の場合は、通常のべき関数の積分公式を使えません。",
        explanation: ["1/x の原始関数は log|x| です。"],
        explanationFormulas: [
          `\\frac{d}{dx}\\log|x|=\\frac1x`,
          `\\int\\frac{${k}}x\\,dx=${k}\\log|x|${C}`,
        ],
      });
    },
  },
  {
    id: "basic-i-exponential",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 10);
      return question({
        title: "指数関数の不定積分",
        topic: "指数関数の積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}e^x\\,dx`,
        choices: [
          `${k}e^x${C}`,
          `-${k}e^x${C}`,
          `${term(1, "e^x", k)}${C}`,
          `${k}x${C}`,
        ],
        hint: "eˣ は、微分しても積分しても同じ関数になります。",
        explanation: ["指数関数 eˣ の原始関数は eˣ です。"],
        explanationFormulas: [`\\int ${k}e^x\\,dx=${k}e^x${C}`],
      });
    },
  },
  {
    id: "basic-i-sine",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 12);
      return question({
        title: "正弦関数の不定積分",
        topic: "三角関数の積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}\\sin x\\,dx`,
        choices: [
          `-${k}\\cos x${C}`,
          `${k}\\cos x${C}`,
          `-${k}\\sin x${C}`,
          `${k}\\sin x${C}`,
        ],
        hint: "cos x の導関数は −sin x なので、符号を反転します。",
        explanation: ["答えを微分すると正の sin x に戻ることを確認します。"],
        explanationFormulas: [`\\int ${k}\\sin x\\,dx=-${k}\\cos x${C}`],
      });
    },
  },
  {
    id: "basic-i-cosine",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 12);
      return question({
        title: "余弦関数の不定積分",
        topic: "三角関数の積分",
        prompt: "次の不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}\\cos x\\,dx`,
        choices: [
          `${k}\\sin x${C}`,
          `-${k}\\sin x${C}`,
          `${k}\\cos x${C}`,
          `-${k}\\cos x${C}`,
        ],
        hint: "sin x を微分すると cos x になります。",
        explanation: ["余弦関数の原始関数は正弦関数です。"],
        explanationFormulas: [`\\int ${k}\\cos x\\,dx=${k}\\sin x${C}`],
      });
    },
  },
  {
    id: "basic-i-inverse-square",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 10);
      return question({
        title: "逆数の二乗の不定積分",
        topic: "負の指数の積分",
        prompt: "x ≠ 0 の区間での不定積分を選んでください。C は積分定数です。",
        formula: `\\int\\frac{${k}}{x^2}\\,dx`,
        choices: [
          `-\\frac{${k}}x${C}`,
          `\\frac{${k}}x${C}`,
          `-${term(k, "x^{-2}", 2)}${C}`,
          `${k}\\log|x|${C}`,
        ],
        hint: "被積分関数を x の−2乗として、べき関数の積分公式を使います。",
        explanation: [
          "指数を1つ増やすと−1になります。その指数で係数を割るため負の符号が付きます。",
        ],
        explanationFormulas: [
          `\\int ${k}x^{-2}\\,dx=-${k}x^{-1}${C}=-\\frac{${k}}x${C}`,
        ],
      });
    },
  },
  {
    id: "basic-i-root",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 9);
      return question({
        title: "平方根の不定積分",
        topic: "分数指数の積分",
        prompt: "x > 0 における不定積分を選んでください。C は積分定数です。",
        formula: `\\int ${k}\\sqrt{x}\\,dx`,
        choices: [
          `${term(2 * k, "x^{3/2}", 3)}${C}`,
          `${k}x^{3/2}${C}`,
          `-${term(2 * k, "x^{3/2}", 3)}${C}`,
          `${term(k, "x^{1/2}", 2)}${C}`,
        ],
        hint: "√x を x の1/2乗に書き換え、指数を1つ増やします。",
        explanation: [
          "新しい指数は3/2です。この指数で割ると、係数に2/3が掛かります。",
        ],
        explanationFormulas: [
          `\\int ${k}x^{1/2}\\,dx=${term(2 * k, "x^{3/2}", 3)}${C}`,
        ],
      });
    },
  },
  {
    id: "basic-i-reciprocal-root",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 9);
      return question({
        title: "平方根の逆数の不定積分",
        topic: "分数指数の積分",
        prompt: "x > 0 における不定積分を選んでください。C は積分定数です。",
        formula: `\\int\\frac{${k}}{\\sqrt{x}}\\,dx`,
        choices: [
          `${2 * k}\\sqrt{x}${C}`,
          `${k}\\sqrt{x}${C}`,
          `-${2 * k}\\sqrt{x}${C}`,
          `${2 * k}x^{3/2}${C}`,
        ],
        hint: "x の−1/2乗を積分すると、指数は1/2になります。",
        explanation: ["新しい指数1/2で係数を割るため、係数は2倍になります。"],
        explanationFormulas: [`\\int ${k}x^{-1/2}\\,dx=${2 * k}x^{1/2}${C}`],
      });
    },
  },
  {
    id: "basic-i-definite-power",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 7),
        n = r(2, 4),
        a = r(0, 2),
        b = a + r(1, 2),
        numerator = k * (b ** (n + 1) - a ** (n + 1));
      return question({
        title: "べき関数の定積分",
        topic: "定積分の計算",
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{${a}}^{${b}}${k}x^{${n}}\\,dx`,
        choices: [
          fraction(numerator, n + 1),
          fraction(2 * numerator, n + 1),
          fraction(-numerator, n + 1),
          `${numerator}`,
        ],
        hint: "原始関数に上端と下端を代入し、その差を求めます。",
        explanation: ["べき関数を積分してから、端点の値を代入します。"],
        explanationFormulas: [
          `\\left[${term(k, `x^{${n + 1}}`, n + 1)}\\right]_{${a}}^{${b}}=${fraction(numerator, n + 1)}`,
        ],
      });
    },
  },
  {
    id: "basic-i-reversed-bounds",
    subject: "integration",
    application: false,
    build(r) {
      const value = r(2, 12),
        a = r(1, 5),
        b = a + r(1, 4);
      return question({
        title: "積分区間の向きを反転する",
        topic: "定積分の性質",
        prompt:
          "次の条件を使い、積分区間の向きを反転した定積分の値を求めてください。",
        formula: `\\int_{${a}}^{${b}}f(x)\\,dx=${value},\\qquad\\int_{${b}}^{${a}}f(x)\\,dx=\\,?`,
        choices: [`${-value}`, `${value}`, "0", `${2 * value}`],
        hint: "定積分の上端と下端を入れ替えると符号が反転します。",
        explanation: [
          "積分の向きを反転した値は、もとの積分の負の値になります。",
        ],
        explanationFormulas: [
          `\\int_{${b}}^{${a}}f(x)\\,dx=-\\int_{${a}}^{${b}}f(x)\\,dx=${-value}`,
        ],
      });
    },
  },
  {
    id: "basic-i-odd-symmetry",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 7),
        b = r(1, 7),
        a = r(1, 3),
        decoy = k * a ** 4;
      return question({
        title: "奇関数の対称区間での積分",
        topic: "積分と対称性",
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{-${a}}^{${a}}(${k}x^3+${term(b, "x")})\\,dx`,
        choices: ["0", `${decoy}`, `${-decoy}`, `${2 * decoy}`],
        hint: "被積分関数に −x を代入すると、もとの関数の符号が反転します。",
        explanation: [
          "奇関数を原点に対称な区間で積分すると、左右の値が打ち消し合います。",
        ],
        explanationFormulas: [
          `f(-x)=-f(x)\\quad\\Longrightarrow\\quad\\int_{-${a}}^{${a}}f(x)\\,dx=0`,
        ],
      });
    },
  },
  {
    id: "basic-i-even-symmetry",
    subject: "integration",
    application: false,
    build(r) {
      const k = r(2, 7),
        a = r(1, 3),
        numerator = 2 * k * a ** 3;
      return question({
        title: "偶関数の対称区間での積分",
        topic: "積分と対称性",
        prompt: "次の定積分の値を求めてください。",
        formula: `\\int_{-${a}}^{${a}}${k}x^2\\,dx`,
        choices: [
          fraction(numerator, 3),
          fraction(numerator, 6),
          fraction(-numerator, 3),
          `${numerator}`,
        ],
        hint: "偶関数なので、0から正の上端までの積分を2倍できます。",
        explanation: [
          "被積分関数は偶関数です。対称性を使うと正の区間だけの積分になります。",
        ],
        explanationFormulas: [
          `\\int_{-${a}}^{${a}}${k}x^2\\,dx=2\\int_0^{${a}}${k}x^2\\,dx=${fraction(numerator, 3)}`,
        ],
      });
    },
  },
  {
    id: "basic-i-area",
    subject: "integration",
    application: true,
    build(r) {
      const k = r(2, 7),
        b = r(1, 6),
        a = r(1, 4),
        numerator = k * a * a + 2 * b * a;
      return question({
        title: "直線と x 軸の間の面積",
        topic: "面積と定積分",
        prompt: `次の直線、x 軸、および2直線 x = 0、x = ${a} で囲まれる図形の面積を求めてください。`,
        formula: `y=${k}x+${b}`,
        choices: [
          fraction(numerator, 2),
          fraction(numerator, 4),
          `${numerator}`,
          fraction(-numerator, 2),
        ],
        hint: "この区間では直線は x 軸の上にあるので、定積分がそのまま面積です。",
        explanation: ["直線の式を、指定された区間で積分します。"],
        explanationFormulas: [
          `S=\\int_0^{${a}}(${k}x+${b})\\,dx=\\left[${term(k, "x^2", 2)}+${term(b, "x")}\\right]_0^{${a}}=${fraction(numerator, 2)}`,
        ],
      });
    },
  },
  {
    id: "basic-i-crossing-area",
    subject: "integration",
    application: true,
    build(r) {
      const k = r(2, 7),
        a = r(1, 4),
        value = k * a * a;
      return question({
        title: "x 軸をまたぐ図形の面積",
        topic: "面積と積分の符号",
        estimatedMinutes: 4,
        prompt: `次の直線と x 軸との間の、0 ≦ x ≦ ${2 * a} の部分の面積を求めてください。`,
        formula: `y=${k}(x-${a})`,
        choices: [`${value}`, "0", fraction(value, 2), `${2 * value}`],
        hint: `x = ${a} で符号が変わります。x 軸より下の部分も正の面積として足します。`,
        explanation: [
          "左右の三角形の面積は等しく、それぞれが底辺×高さ÷2です。定積分の符号付きの値とは異なります。",
        ],
        explanationFormulas: [
          `S=-\\int_0^{${a}}${k}(x-${a})\\,dx+\\int_{${a}}^{${2 * a}}${k}(x-${a})\\,dx=${value}`,
        ],
      });
    },
  },
  {
    id: "basic-i-distance",
    subject: "integration",
    application: true,
    build(r) {
      const k = r(2, 6),
        b = r(1, 7),
        a = r(1, 4),
        numerator = k * a * a + 2 * b * a;
      return question({
        title: "速度から移動距離を求める",
        topic: "積分と運動",
        prompt: `直線上を動く物体の速度 v(t) が次の式で与えられます。0 秒から ${a} 秒までの移動距離を求めてください。速度の単位は m/s、答えの単位は m です。`,
        formula: `v(t)=${k}t+${b}`,
        choices: [
          fraction(numerator, 2),
          fraction(numerator, 4),
          `${numerator}`,
          fraction(-numerator, 2),
        ],
        hint: "この時間帯では速度は正です。速度を時間で積分すると移動距離になります。",
        explanation: ["速度が正なので、速度の積分が移動距離に等しくなります。"],
        explanationFormulas: [
          `L=\\int_0^{${a}}(${k}t+${b})\\,dt=\\left[${term(k, "t^2", 2)}+${term(b, "t")}\\right]_0^{${a}}=${fraction(numerator, 2)}`,
        ],
      });
    },
  },
  {
    id: "basic-i-average",
    subject: "integration",
    application: true,
    build(r) {
      const k = r(2, 7),
        b = r(1, 7),
        a = r(1, 4),
        numerator = k * a * a + 3 * b;
      return question({
        title: "区間での関数の平均値",
        topic: "積分と平均値",
        estimatedMinutes: 4,
        prompt: `区間 0 ≦ x ≦ ${a} における、次の関数の平均値を求めてください。平均値は区間の積分を区間の長さで割った値です。`,
        formula: `f(x)=${k}x^2+${b}`,
        choices: [
          fraction(numerator, 3),
          fraction(numerator, 6),
          fraction(2 * numerator, 3),
          fraction(-numerator, 3),
        ],
        hint: "定積分を計算した後に、区間の長さで割ります。",
        explanation: [
          "関数の平均値は、区間での積分を区間の長さで割って求めます。",
        ],
        explanationFormulas: [
          `f_{\\mathrm{avg}}=\\frac1{${a}}\\int_0^{${a}}(${k}x^2+${b})\\,dx=${fraction(k * a * a, 3)}+${b}=${fraction(numerator, 3)}`,
        ],
      });
    },
  },
];
