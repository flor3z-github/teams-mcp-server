export const MAX_CHUNK_LIMIT = 20000;

export function chunk(
  text: string,
  limit: number,
  mode: "length" | "newline" = "newline",
): string[] {
  if (text.length <= limit) return [text];

  const out: string[] = [];
  let rest = text;

  while (rest.length > limit) {
    let cut = limit;

    if (mode === "newline") {
      const para = rest.lastIndexOf("\n\n", limit);
      const line = rest.lastIndexOf("\n", limit);
      const space = rest.lastIndexOf(" ", limit);

      if (para > limit / 2) {
        cut = para;
      } else if (line > limit / 2) {
        cut = line;
      } else if (space > 0) {
        cut = space;
      }
    }

    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n+/, "");
  }

  if (rest) out.push(rest);
  return out;
}
