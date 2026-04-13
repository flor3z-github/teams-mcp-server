import { describe, it, expect } from "vitest";
import { z } from "zod";
import { validateInput } from "../../src/utils/validators.js";
import { ValidationError } from "../../src/utils/errors.js";

const schema = z.object({
  name: z.string().min(1),
  count: z.number().int().positive(),
});

describe("validateInput", () => {
  it("유효한 입력이면 파싱된 값 반환", () => {
    const result = validateInput(schema, { name: "test", count: 5 });
    expect(result).toEqual({ name: "test", count: 5 });
  });

  it("잘못된 입력이면 ValidationError throw", () => {
    expect(() => validateInput(schema, { name: "", count: -1 })).toThrow(
      ValidationError,
    );
  });

  it("ValidationError 메시지에 필드 경로 포함", () => {
    try {
      validateInput(schema, { name: 123, count: "bad" });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("name");
    }
  });

  it("비-Zod 에러는 그대로 throw", () => {
    const badSchema = {
      parse: () => {
        throw new TypeError("not zod");
      },
    } as unknown as z.ZodSchema;
    expect(() => validateInput(badSchema, {})).toThrow(TypeError);
  });
});
