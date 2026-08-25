import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// 닫는 태그가 없는 요소 — 최상위 블록 분리 시 깊이 계산에서 제외한다
const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

const TAG_RE = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;

/**
 * marked의 <pre><code> 코드블록을 Teams의 <codeblock>으로 바꾼다.
 * 언어명은 Teams가 대소문자를 정규화하므로 그대로 넘긴다 (typescript → TypeScript).
 */
function toCodeblock(html: string): string {
  return html.replace(
    /<pre><code(?: class="language-([^"]*)")?>([\s\S]*?)<\/code><\/pre>/g,
    (_full, lang: string | undefined, code: string) =>
      `<codeblock class="${lang || "PlainText"}"><code>${code.replace(/\n+$/, "")}</code></codeblock>`,
  );
}

/**
 * HTML을 최상위 형제 블록 단위로 자른다.
 */
function splitTopLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;

  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html)) !== null) {
    const tag = match[0];
    const name = match[1].toLowerCase();
    const end = match.index + tag.length;

    if (VOID_TAGS.has(name) || tag.endsWith("/>")) {
      if (depth === 0) {
        blocks.push(html.slice(start, end));
        start = end;
      }
      continue;
    }

    if (tag.startsWith("</")) {
      depth--;
      if (depth === 0) {
        blocks.push(html.slice(start, end));
        start = end;
      }
    } else {
      depth++;
    }
  }

  if (start < html.length) blocks.push(html.slice(start));
  return blocks.map((b) => b.trim()).filter(Boolean);
}

/**
 * marked 출력을 Teams 클라이언트가 만드는 HTML에 맞춘다.
 * - <pre><code> → <codeblock><code>  (헤더바·복사버튼·구문강조가 붙는다)
 * - <del> → <s>                      (Teams는 <s>만 취소선으로 그린다)
 * - <h1> → <h2>                      (Teams 편집기가 만들 수 있는 최상위 제목이 h2다)
 * - 최상위 블록 사이에 <p>&nbsp;</p>  (Teams의 빈 줄 표현)
 */
function toTeamsHtml(html: string): string {
  const normalized = toCodeblock(html)
    .replace(/<(\/?)del>/g, "<$1s>")
    .replace(/<(\/?)h1>/g, "<$1h2>");
  return splitTopLevelBlocks(normalized).join("\n<p>&nbsp;</p>\n");
}

// Claude → Teams: Markdown을 Teams HTML로 변환
export function markdownToHtml(md: string): string {
  return toTeamsHtml(marked.parse(md, { async: false }) as string);
}

/**
 * Teams 전용 <codeblock>을 표준 <pre><code>로 되돌린다.
 * turndown은 <codeblock>을 모르고, preformatted로도 취급하지 않아 들여쓰기를 접어버린다.
 * <pre>로 바꿔두면 turndown의 fenced code 규칙이 공백과 언어를 그대로 살린다.
 * <br>은 개행으로, 구문강조 span은 제거하고, 나머지 엔티티는 DOM이 디코드하도록 남겨둔다.
 */
function codeblockToPre(html: string): string {
  return html.replace(
    /<codeblock([^>]*)>([\s\S]*?)<\/codeblock>/gi,
    (_full, attrs: string, inner: string) => {
      const cls = /class="([^"]*)"/i.exec(attrs)?.[1] || "";
      const lang = cls && cls.toLowerCase() !== "plaintext" ? cls.toLowerCase() : "";
      const code = inner
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/\n+$/, "");
      return `<pre><code${lang ? ` class="language-${lang}"` : ""}>${code}</code></pre>`;
    },
  );
}

// Teams → Claude: HTML을 Markdown으로 변환
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});
turndown.use(gfm);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(codeblockToPre(html));
}
