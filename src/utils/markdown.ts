import { marked } from "marked";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

// Claude → Teams: Markdown을 HTML로 변환
export function markdownToHtml(md: string): string {
  return marked.parse(md, { async: false }) as string;
}

// Teams → Claude: HTML을 Markdown으로 변환
const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});
turndown.use(gfm);

export function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}
