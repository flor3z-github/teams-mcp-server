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

  it("should convert code blocks", () => {
    const html = markdownToHtml("```js\nconsole.log('hi')\n```");
    expect(html).toContain("<pre>");
    expect(html).toContain("console.log");
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
