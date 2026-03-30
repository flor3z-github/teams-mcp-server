import { z } from "zod";
import { ValidationError } from "./errors.js";

export function validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map(
        (e) => `${e.path.join(".")}: ${e.message}`,
      );
      throw new ValidationError(messages.join(", "));
    }
    throw error;
  }
}
