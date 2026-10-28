import type { Lesson } from "../shared/types";

export const lessons: Lesson[] = [
  {
    id: "derivative",
    category: "微分のきほん",
    title: "微分係数と導関数",
    description: "平均変化率、微分係数、導関数の定義を学びます。",
    formula: "f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h}",
    content: [
      {
        title: "平均変化率と微分係数",
        text: "2点の間での関数の値の変化を、x の変化で割ると「平均変化率」になります。この2点を限りなく近づけた値が、微分係数です。グラフでは、その点での接線の傾きを表します。",
        formula: "\\frac{f(a+h)-f(a)}{h}",
      },
      {
        title: "導関数の意味",
        text: "微分係数をすべての x に対して並べたものが導関数です。導関数が正なら関数は増加、負なら減少します。",
        formula: "f(x)=x^2\\quad\\Longrightarrow\\quad f'(x)=2x",
      },
      {
        title: "微分の基本公式",
        text: "べき関数は、指数を前に下ろし、指数を1つ減らします。定数の微分は0です。この2つと、和の微分が出発点になります。",
        formula: "\\frac{d}{dx}x^n=nx^{n-1},\\qquad \\frac{d}{dx}C=0",
      },
      {
        title: "微分係数の計算例",
        text: "x² のグラフは x = 2 で傾き4、x = −1 で傾き−2です。同じ関数でも、見る場所によって変化の速さが違います。",
        formula: "f'(2)=4,\\qquad f'(-1)=-2",
      },
    ],
  },
  {
    id: "integral",
    category: "積分のきほん",
    title: "定積分と不定積分",
    description: "定積分の意味と、原始関数による計算を学びます。",
    formula: "\\int_a^b f(x)\\,dx=F(b)-F(a)",
    content: [
      {
        title: "定積分の意味",
        text: "幅の細い長方形の面積を足し、幅を限りなく0に近づけると定積分になります。関数が0以上の区間では、グラフと x 軸の間の面積を表します。",
      },
      {
        title: "原始関数と積分定数",
        text: "微分すると f(x) になる関数 F(x) を、f(x) の原始関数と呼びます。不定積分は、原始関数の全体を表すので、任意の定数 C を加えます。",
        formula: "\\int x^n\\,dx=\\frac{x^{n+1}}{n+1}+C\\qquad(n\\ne-1)",
      },
      {
        title: "定積分の計算",
        text: "原始関数が見つかったら、上端を代入した値から下端を代入した値を引きます。積分定数 C は差を取ると消えます。",
        formula:
          "\\int_0^1 x^2\\,dx=\\left[\\frac{x^3}{3}\\right]_0^1=\\frac13",
      },
      {
        title: "定積分と面積の違い",
        text: "定積分では、x 軸より下の部分は負として加算されます。図形の面積を求める場合は、符号が変わる点で区間を分け、各部分の面積を正の量として足しましょう。",
      },
    ],
  },
  {
    id: "chain",
    category: "微分の道具",
    title: "合成関数の微分",
    description: "合成関数の定義と連鎖律による微分を学びます。",
    formula: "\\frac{d}{dx}f(g(x))=f' (g(x))\\,g'(x)",
    content: [
      {
        title: "合成関数とは",
        text: "ある関数の入力に、別の関数を入れたものです。たとえば (2x+1)³ は、内側の 2x+1 と、外側の「3乗する関数」からできています。",
      },
      {
        title: "連鎖律",
        text: "内側をひとかたまりとみなして外側を微分し、その後に内側の導関数を掛けます。この法則を連鎖律といいます。",
        formula: "\\frac{d}{dx}(2x+1)^3=3(2x+1)^2\\cdot2=6(2x+1)^2",
      },
      {
        title: "三角関数への適用",
        text: "三角関数や指数関数も、内側に関数があれば連鎖律を使います。内側の微分を掛け忘れやすいので、最後に必ず確認しましょう。",
        formula: "\\frac{d}{dx}\\sin(3x)=3\\cos(3x)",
      },
    ],
  },
  {
    id: "parts",
    category: "積分の道具",
    title: "部分積分",
    description: "部分積分の公式と、関数の選び方を学びます。",
    formula: "\\int u v'\\,dx=uv-\\int u'v\\,dx",
    content: [
      {
        title: "部分積分の公式",
        text: "2つの関数の積を微分する公式を並べ替えると、部分積分の公式になります。積分しにくい積を、より簡単な積分に置き換える道具です。",
        formula: "(uv)'=u'v+uv'",
      },
      {
        title: "関数の選び方",
        text: "x eˣ のような積では、微分すると定数になる x を u に、積分しやすい eˣ を v′ に選びます。",
        formula: "\\int xe^x\\,dx=xe^x-\\int e^x\\,dx=(x-1)e^x+C",
      },
      {
        title: "定積分の部分積分",
        text: "定積分の部分積分では uv に端点を代入します。マイナス符号と、下端の値の引き忘れに注意しましょう。",
        formula: "\\int_a^b uv'\\,dx=[uv]_a^b-\\int_a^b u'v\\,dx",
      },
      {
        title: "対数関数の部分積分",
        text: "log x は、微分すると 1/x になって扱いやすくなるため、微分する側に選ぶのが基本です。",
        formula: "\\int\\log x\\,dx=x\\log x-x+C\\qquad(x>0)",
      },
    ],
  },
  {
    id: "fundamental",
    category: "微積をつなぐ",
    title: "微積分の基本定理",
    description: "積分を微分する公式と、定積分の計算法を学びます。",
    formula: "\\frac{d}{dx}\\int_a^x f(t)\\,dt=f(x)",
    content: [
      {
        title: "積分と導関数の関係",
        text: "a から x までにたまった量を F(x) とします。x を少し増やすと、たまる量はおよそ f(x) × 増やした幅です。だから F(x) の増える速さは f(x) になります。",
      },
      {
        title: "第1の基本定理",
        text: "f が連続なら、上端を x とした積分を微分すると f(x) に戻ります。積分の中で使う t は、x と区別するための変数です。",
        formula:
          "F(x)=\\int_a^x f(t)\\,dt\\quad\\Longrightarrow\\quad F'(x)=f(x)",
      },
      {
        title: "上端が関数の場合",
        text: "上端が g(x) なら、さらに合成関数の微分を使います。上端を被積分関数に代入して、上端の導関数を掛けます。",
        formula: "\\frac{d}{dx}\\int_a^{g(x)}f(t)\\,dt=f(g(x))g'(x)",
      },
      {
        title: "第2の基本定理",
        text: "原始関数 F がわかれば、定積分を端点の値だけで計算できます。長方形を無数に足し合わせる計算を、2つの値の引き算へ変える定理です。",
        formula:
          "F'=f\\quad\\Longrightarrow\\quad\\int_a^b f(x)\\,dx=F(b)-F(a)",
      },
    ],
  },
  {
    id: "limits",
    category: "微積の土台",
    title: "極限",
    description: "極限の定義、式の変形、関数の展開を学びます。",
    formula: "\\lim_{x\\to0}\\frac{\\sin x}{x}=1",
    content: [
      {
        title: "極限の意味",
        text: "極限は、変数がある値に近づくとき、関数の値がどこへ近づくかを調べます。その点で関数が定義されていなくても、極限が存在することがあります。",
      },
      {
        title: "不定形の極限",
        text: "代入して 0/0 になる場合、式の変形や基本極限が必要です。因数分解して共通因子を消せるか、まず確かめましょう。",
        formula: "\\lim_{x\\to1}\\frac{x^2-1}{x-1}=\\lim_{x\\to1}(x+1)=2",
      },
      {
        title: "原点での関数の展開",
        text: "指数関数を2次まで展開すると、1次の項が打ち消される極限も計算できます。o(x²) は x² で割ると0に近づく項を表します。",
        formula: "e^x=1+x+\\frac{x^2}{2}+o(x^2)",
      },
      {
        title: "対数の基本極限",
        text: "自然対数も、0の近くでは1次の項でとらえられます。近似を使うときは、どの次数まで残す必要があるかを分母から判断しましょう。",
        formula: "\\lim_{x\\to0}\\frac{\\log(1+x)}{x}=1",
      },
    ],
  },
  {
    id: "extrema",
    category: "微分の使い道",
    title: "関数の増減と最大・最小",
    description: "導関数の符号を使って増減と極値を調べます。",
    formula:
      "f'(x)>0\\Rightarrow\\text{増加},\\qquad f'(x)<0\\Rightarrow\\text{減少}",
    content: [
      {
        title: "導関数の符号と増減",
        text: "導関数が正の区間ではグラフは右上がり、負の区間では右下がりです。導関数の符号を区間ごとにまとめたものが増減表です。",
      },
      {
        title: "停留点と極値",
        text: "導関数が0になる点の前後で、符号が正から負に変われば極大、負から正に変われば極小になります。0になるだけでは極値とは限りません。",
        formula: "f(x)=x^3,\\qquad f'(0)=0\\quad\\text{だが極値ではない}",
      },
      {
        title: "閉区間での最大値・最小値",
        text: "閉区間での最大値・最小値を求めるには、区間内の停留点での値と、両端での値を比べます。微分できない点があれば、その点も候補に含めます。",
      },
      {
        title: "最大値・最小値の計算例",
        text: "x² − 2x を 0 から3の範囲で考えます。x = 1 で最小値−1、x = 3 で最大値3となります。",
        formula: "f'(x)=2x-2,\\quad f(0)=0,\\ f(1)=-1,\\ f(3)=3",
      },
    ],
  },
  {
    id: "improper",
    category: "発展",
    title: "広義積分",
    description: "無限区間や特異点を含む積分を、極限で定義します。",
    formula:
      "\\int_a^{\\infty}f(x)\\,dx=\\lim_{R\\to\\infty}\\int_a^R f(x)\\,dx",
    content: [
      {
        title: "無限区間の積分の定義",
        text: "区間が無限に続く積分は、いったん上端を有限の R に置き換えて計算し、最後に極限を取ります。この極限が有限なら、積分は収束するといいます。",
      },
      {
        title: "無限区間で収束する例",
        text: "指数関数 e⁻ˣ は速く0に近づくので、0から無限大までの面積は1になります。",
        formula:
          "\\int_0^{\\infty}e^{-x}\\,dx=\\lim_{R\\to\\infty}(1-e^{-R})=1",
      },
      {
        title: "端点に特異点がある積分",
        text: "log x のように端点で関数が発散する場合も、端点を ε > 0 に置き換えます。被積分関数が発散しても、積分が収束する場合があります。",
        formula:
          "\\int_0^1\\log x\\,dx=\\lim_{\\varepsilon\\to0+}\\int_{\\varepsilon}^1\\log x\\,dx=-1",
      },
      {
        title: "広義積分の収束と発散",
        text: "原始関数が求まっても、極限が有限になるとは限りません。たとえば 1/x の1から無限大までの積分は発散します。",
        formula: "\\int_1^R\\frac{dx}{x}=\\log R\\longrightarrow\\infty",
      },
    ],
  },
];
