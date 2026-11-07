// A test-only reader for checking numerical and functional equivalence between
// answer options. It is independent of the formulas used to build the answers.
export function choiceValue(latex: string, x: number): number {
  function expand(input: string): string {
    let index = 0;
    function argument(): string {
      while (input[index] === " ") index++;
      if (input[index] !== "{") {
        if (input[index] === "\\") {
          const command = input.slice(index).match(/^\\[a-zA-Z]+/);
          if (command) {
            index += command[0].length;
            return command[0];
          }
        }
        return input[index++];
      }
      const start = ++index;
      let depth = 1;
      while (index < input.length && depth) {
        if (input[index] === "{") depth++;
        if (input[index] === "}") depth--;
        index++;
      }
      if (depth) throw new Error("Unclosed expression");
      return expand(input.slice(start, index - 1));
    }
    let result = "";
    while (index < input.length) {
      if (input.startsWith("\\frac", index)) {
        index += 5;
        const numerator = argument(),
          denominator = argument();
        result += `((${numerator})/(${denominator}))`;
      } else if (input.startsWith("\\sqrt", index)) {
        index += 5;
        let degree = "2";
        if (input[index] === "[") {
          const end = input.indexOf("]", index);
          if (end < 0) throw new Error("Unclosed root degree");
          degree = input.slice(index + 1, end);
          index = end + 1;
        }
        result += `((${argument()})^(1/(${degree})))`;
      } else result += input[index++];
    }
    return result;
  }
  let expression = expand(latex.replaceAll("\\dfrac", "\\frac"));
  for (const [command, token] of [
    ["\\arctan", "atan"],
    ["\\arcsin", "asin"],
    ["\\arccos", "acos"],
    ["\\sinh", "sinh"],
    ["\\cosh", "cosh"],
    ["\\tanh", "tanh"],
    ["\\sin", "sin"],
    ["\\cos", "cos"],
    ["\\tan", "tan"],
    ["\\sec", "sec"],
    ["\\vert", "|"],
    ["\\log", "log"],
    ["\\ln", "log"],
    ["\\exp", "exp"],
    ["\\pi", "pi"],
    ["\\cdot", "*"],
    ["\\times", "*"],
    ["\\left", ""],
    ["\\right", ""],
    ["\\,", ""],
    ["\\!", ""],
    ["\\;", ""],
    ["\\quad", ""],
  ])
    expression = expression.replaceAll(command, token);
  expression = expression
    .replaceAll("{", "(")
    .replaceAll("}", ")")
    .replaceAll("C", "0")
    .replace(/\s/g, "")
    .replace(/^y=/, "")
    .replace(/\|([^|]+)\|/g, "abs($1)");
  const tokens =
    expression.match(
      /\d+(?:\.\d+)?|atan|asin|acos|sinh|cosh|tanh|sin|cos|tan|sec|abs|log|exp|pi|e|x|t|[+\-*/^()]/g,
    ) ?? [];
  if (tokens.join("") !== expression || tokens.length === 0)
    throw new Error(`Unsupported answer expression: ${latex}`);
  const functions: Record<string, (value: number) => number> = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    atan: Math.atan,
    asin: Math.asin,
    acos: Math.acos,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    log: Math.log,
    exp: Math.exp,
    abs: Math.abs,
    sec: (value) => 1 / Math.cos(value),
  };
  let at = 0;
  function sum(): number {
    let result = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const operator = tokens[at++],
        next = product();
      result = operator === "+" ? result + next : result - next;
    }
    return result;
  }
  function product(): number {
    let result = unary();
    while (at < tokens.length && ![")", "+", "-"].includes(tokens[at])) {
      const operator = tokens[at];
      if (operator === "*" || operator === "/") at++;
      const next = unary();
      result = operator === "/" ? result / next : result * next;
    }
    return result;
  }
  function unary(): number {
    if (tokens[at] === "+") {
      at++;
      return unary();
    }
    if (tokens[at] === "-") {
      at++;
      return -unary();
    }
    let result = atom();
    if (tokens[at] === "^") {
      at++;
      result **= unary();
    }
    return result;
  }
  function atom(): number {
    const token = tokens[at++];
    if (token === "(") {
      const result = sum();
      if (tokens[at++] !== ")") throw new Error("Unclosed parentheses");
      return result;
    }
    if (token === "x" || token === "t") return x;
    if (token === "pi") return Math.PI;
    if (token === "e") return Math.E;
    if (Object.hasOwn(functions, token)) {
      let exponent: number | undefined;
      if (tokens[at] === "^") {
        at++;
        exponent = unary();
      }
      const value = functions[token](unary());
      return exponent === undefined ? value : value ** exponent;
    }
    if (!/^\d+(?:\.\d+)?$/.test(token ?? ""))
      throw new Error(`Unsupported token: ${token}`);
    return Number(token);
  }
  const result = sum();
  if (at !== tokens.length || !Number.isFinite(result))
    throw new Error(`Nonfinite answer expression: ${latex}`);
  return result;
}
