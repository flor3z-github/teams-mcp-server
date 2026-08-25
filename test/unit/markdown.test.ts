import { describe, it, expect } from "vitest";
import { markdownToHtml, htmlToMarkdown } from "../../src/utils/markdown.js";

describe("markdownToHtml", () => {
  it("should convert bold", () => {
    const html = markdownToHtml("**bold**");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("should convert italic", () => {
    const html = markdownToHtml("*italic*");
    expect(html).toContain("<em>italic</em>");
  });

  it("should convert links", () => {
    const html = markdownToHtml("[link](https://example.com)");
    expect(html).toContain('href="https://example.com"');
  });

  it("should convert lists", () => {
    const html = markdownToHtml("- item 1\n- item 2");
    expect(html).toContain("<li>");
  });
});

describe("markdownToHtml — Teams 형식 변환", () => {
  it("코드펜스를 codeblock으로 변환하고 언어를 class로 옮긴다", () => {
    const html = markdownToHtml("```typescript\nconst x = 1;\n```");
    expect(html).toContain('<codeblock class="typescript"><code>');
    expect(html).toContain("</code></codeblock>");
    expect(html).not.toContain("<pre>");
    expect(html).not.toContain("language-");
  });

  it("언어 없는 코드펜스는 PlainText로 변환한다", () => {
    const html = markdownToHtml("```\nplain\n```");
    expect(html).toContain('<codeblock class="PlainText"><code>plain</code></codeblock>');
  });

  it("코드블록 안의 이스케이프를 보존한다", () => {
    const html = markdownToHtml("```js\nif (a < b) {}\n```");
    expect(html).toContain("if (a &lt; b) {}");
  });

  it("코드블록 안의 개행을 유지한다", () => {
    const html = markdownToHtml("```\na\nb\n```");
    expect(html).toContain("<code>a\nb</code>");
  });

  it("리스트 안의 코드펜스도 변환한다", () => {
    const html = markdownToHtml("- 항목\n\n  ```bash\n  ls\n  ```");
    expect(html).toContain('<codeblock class="bash"><code>ls</code></codeblock>');
    expect(html).not.toContain("<pre>");
  });

  it("인용 안의 코드펜스도 변환한다", () => {
    const html = markdownToHtml("> ```bash\n> ls\n> ```");
    expect(html).toContain('<codeblock class="bash"><code>ls</code></codeblock>');
    expect(html).not.toContain("<pre>");
  });

  it("인라인 코드는 code 그대로 둔다", () => {
    const html = markdownToHtml("`inline`");
    expect(html).toContain("<code>inline</code>");
    expect(html).not.toContain("codeblock");
  });

  it("취소선을 del 대신 s로 낸다", () => {
    const html = markdownToHtml("~~gone~~");
    expect(html).toContain("<s>gone</s>");
    expect(html).not.toContain("<del>");
  });

  it("h1을 h2로 강등한다", () => {
    const html = markdownToHtml("# 제목");
    expect(html).toContain("<h2>제목</h2>");
    expect(html).not.toContain("<h1>");
  });

  it("h2, h3은 그대로 둔다", () => {
    const html = markdownToHtml("## 둘\n\n### 셋");
    expect(html).toContain("<h2>둘</h2>");
    expect(html).toContain("<h3>셋</h3>");
  });

  it("최상위 블록 사이에 빈 문단을 넣는다", () => {
    const html = markdownToHtml("문단 하나\n\n문단 둘");
    expect(html).toBe("<p>문단 하나</p>\n<p>&nbsp;</p>\n<p>문단 둘</p>");
  });

  it("리스트 항목 사이에는 빈 문단을 넣지 않는다", () => {
    const html = markdownToHtml("- 하나\n- 둘");
    expect(html).not.toContain("<li>하나</li>\n<p>&nbsp;</p>");
    expect(html).toContain("<li>하나</li>");
    expect(html).toContain("<li>둘</li>");
  });

  it("표 내부에는 빈 문단을 넣지 않는다", () => {
    const html = markdownToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html.match(/<p>&nbsp;<\/p>/g)).toBeNull();
  });

  it("코드블록도 하나의 최상위 블록으로 취급한다", () => {
    const html = markdownToHtml("앞\n\n```\nx\ny\n```\n\n뒤");
    expect(html).toBe(
      '<p>앞</p>\n<p>&nbsp;</p>\n<codeblock class="PlainText"><code>x\ny</code></codeblock>\n<p>&nbsp;</p>\n<p>뒤</p>',
    );
  });

  it("hr 앞뒤에도 빈 문단을 넣는다", () => {
    const html = markdownToHtml("위\n\n---\n\n아래");
    expect(html).toBe("<p>위</p>\n<p>&nbsp;</p>\n<hr>\n<p>&nbsp;</p>\n<p>아래</p>");
  });

  it("빈 입력은 빈 문자열을 낸다", () => {
    expect(markdownToHtml("")).toBe("");
  });
});

describe("htmlToMarkdown", () => {
  it("should convert bold", () => {
    const md = htmlToMarkdown("<strong>bold</strong>");
    expect(md).toContain("**bold**");
  });

  it("should convert italic", () => {
    const md = htmlToMarkdown("<em>italic</em>");
    // turndown uses _ for italic by default
    expect(md).toMatch(/[*_]italic[*_]/);
  });

  it("should convert links", () => {
    const md = htmlToMarkdown('<a href="https://example.com">link</a>');
    expect(md).toContain("[link](https://example.com)");
  });

  it("should handle plain text", () => {
    const md = htmlToMarkdown("plain text");
    expect(md).toBe("plain text");
  });
});

describe("htmlToMarkdown — Teams codeblock 복원", () => {
  it("codeblock을 펜스 코드블록으로 되돌린다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="Bash"><code>echo hello<br>ls -la</code></codeblock>',
    );
    expect(md).toContain("```bash\necho hello\nls -la\n```");
  });

  it("PlainText는 언어 없는 펜스로 되돌린다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="PlainText"><code>plain<br>text</code></codeblock>',
    );
    expect(md).toContain("```\nplain\ntext\n```");
    expect(md).not.toContain("plaintext");
  });

  it("class가 없어도 처리한다", () => {
    const md = htmlToMarkdown("<codeblock><code>bare</code></codeblock>");
    expect(md).toContain("```\nbare\n```");
  });

  it("nbsp 들여쓰기를 공백으로 되돌린다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="Python"><code>def f():<br>&nbsp;&nbsp;&nbsp;&nbsp;return 1</code></codeblock>',
    );
    expect(md).toContain("```python\ndef f():\n    return 1\n```");
  });

  it("코드 들여쓰기를 보존한다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="Yaml"><code>out:<br>  type: redis<br>  port: 6379</code></codeblock>',
    );
    expect(md).toContain("```yaml\nout:\n  type: redis\n  port: 6379\n```");
  });

  it("HTML 엔티티를 디코드한다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="Json"><code>{ &quot;a&quot;: 1 &amp;&amp; 2 &lt; 3 }</code></codeblock>',
    );
    expect(md).toContain('{ "a": 1 && 2 < 3 }');
  });

  it("구문강조 span을 걷어낸다", () => {
    const md = htmlToMarkdown(
      '<codeblock class="Json"><code><span class="hljs-attr">"key"</span>: <span class="hljs-string">"v"</span></code></codeblock>',
    );
    expect(md).toContain('```json\n"key": "v"\n```');
    expect(md).not.toContain("hljs");
    expect(md).not.toContain("<span");
  });

  it("앞뒤 문단과 분리한다", () => {
    const md = htmlToMarkdown(
      '<p>앞</p><codeblock class="Bash"><code>ls</code></codeblock><p>뒤</p>',
    );
    expect(md).toBe("앞\n\n```bash\nls\n```\n\n뒤");
  });

  it("인라인 code는 백틱 그대로 둔다", () => {
    const md = htmlToMarkdown("<p>값은 <code>x</code> 입니다</p>");
    expect(md).toContain("`x`");
    expect(md).not.toContain("```");
  });

  it("일반 pre/code는 기존대로 처리한다", () => {
    const md = htmlToMarkdown("<pre><code>a\nb</code></pre>");
    expect(md).toContain("```\na\nb\n```");
  });
});
