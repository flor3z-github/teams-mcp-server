import { describe, it, expect } from "vitest";
import {
  TeamsWebhookError,
  ValidationError,
  formatErrorResponse,
} from "../../src/utils/errors.js";

describe("TeamsWebhookError", () => {
  it("name과 statusCode를 설정한다", () => {
    const err = new TeamsWebhookError("fail", 403);
    expect(err.name).toBe("TeamsWebhookError");
    expect(err.message).toBe("fail");
    expect(err.statusCode).toBe(403);
  });

  it("statusCode 없이 생성 가능", () => {
    const err = new TeamsWebhookError("fail");
    expect(err.statusCode).toBeUndefined();
  });
});

describe("ValidationError", () => {
  it("name과 field를 설정한다", () => {
    const err = new ValidationError("bad input", "team_id");
    expect(err.name).toBe("ValidationError");
    expect(err.message).toBe("bad input");
    expect(err.field).toBe("team_id");
  });

  it("field 없이 생성 가능", () => {
    const err = new ValidationError("bad");
    expect(err.field).toBeUndefined();
  });
});

describe("formatErrorResponse", () => {
  it("TeamsWebhookError with statusCode", () => {
    const err = new TeamsWebhookError("forbidden", 403);
    expect(formatErrorResponse(err)).toBe(
      "Teams webhook error (403): forbidden",
    );
  });

  it("TeamsWebhookError without statusCode", () => {
    const err = new TeamsWebhookError("fail");
    expect(formatErrorResponse(err)).toBe("Teams webhook error: fail");
  });

  it("ValidationError with field", () => {
    const err = new ValidationError("required", "team_id");
    expect(formatErrorResponse(err)).toBe(
      "Validation error (team_id): required",
    );
  });

  it("ValidationError without field", () => {
    const err = new ValidationError("bad");
    expect(formatErrorResponse(err)).toBe("Validation error: bad");
  });

  it("일반 Error", () => {
    expect(formatErrorResponse(new Error("oops"))).toBe("Error: oops");
  });

  it("unknown 값", () => {
    expect(formatErrorResponse("string error")).toBe(
      "An unknown error occurred",
    );
    expect(formatErrorResponse(null)).toBe("An unknown error occurred");
  });
});
