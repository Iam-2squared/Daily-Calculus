import { memo } from "react";
import katex from "katex";
export const MathText = memo(function MathText({
  children,
  display = false,
  className = "",
}: {
  children: string;
  display?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`math ${display ? "math-display" : ""} ${className}`}
      dangerouslySetInnerHTML={{
        __html: katex.renderToString(children, {
          throwOnError: false,
          displayMode: display,
          output: "htmlAndMathml",
          strict: false,
        }),
      }}
    />
  );
});
