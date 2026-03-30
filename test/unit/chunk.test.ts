import { describe, it, expect } from "vitest";
import { chunk } from "../../src/utils/chunk.js";

describe("chunk", () => {
  it("should return single chunk for short text", () => {
    expect(chunk("hello", 100)).toEqual(["hello"]);
  });

  it("should return single chunk when text equals limit", () => {
    const text = "a".repeat(100);
    expect(chunk(text, 100)).toEqual([text]);
  });

  it("should split on paragraph boundary", () => {
    const text = "paragraph one\n\nparagraph two\n\nparagraph three";
    const result = chunk(text, 30, "newline");
    expect(result.length).toBeGreaterThan(1);
    expect(result.join("\n\n")).toContain("paragraph one");
  });

  it("should split on newline when no paragraph break", () => {
    const text = "line one\nline two\nline three\nline four\nline five";
    const result = chunk(text, 20, "newline");
    expect(result.length).toBeGreaterThan(1);
    for (const c of result) {
      expect(c.length).toBeLessThanOrEqual(20);
    }
  });

  it("should hard cut when no good break point", () => {
    const text = "a".repeat(50);
    const result = chunk(text, 20, "newline");
    expect(result).toEqual(["a".repeat(20), "a".repeat(20), "a".repeat(10)]);
  });

  it("should use length mode (hard cut only)", () => {
    const text = "hello world foo bar baz";
    const result = chunk(text, 10, "length");
    expect(result[0]).toBe("hello worl");
  });

  it("should handle empty string", () => {
    expect(chunk("", 100)).toEqual([""]);
  });

  it("should strip leading newlines from remainder", () => {
    const text = "part one\n\n\n\npart two";
    const result = chunk(text, 10, "newline");
    // "part two" should not start with newlines
    const lastChunk = result[result.length - 1];
    expect(lastChunk.startsWith("\n")).toBe(false);
  });
});
