export function patchElements(
  html: string,
  selector: string,
  mode: "inner" | "outer" | "prepend" | "append" = "inner"
): string {
  const lines = [`event: datastar-patch-elements`];
  lines.push(`data: selector ${selector}`);
  if (mode !== "outer") lines.push(`data: mode ${mode}`);
  for (const line of html.split("\n")) {
    lines.push(`data: elements ${line}`);
  }
  lines.push("", "");
  return lines.join("\n");
}

export function patchSignals(signals: Record<string, unknown>): string {
  const lines = [`event: datastar-patch-signals`];
  lines.push(`data: signals ${JSON.stringify(signals)}`);
  lines.push("", "");
  return lines.join("\n");
}
