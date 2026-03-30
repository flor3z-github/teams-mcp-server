export class TeamsWebhookError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = "TeamsWebhookError";
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export function formatErrorResponse(error: unknown): string {
  if (error instanceof TeamsWebhookError) {
    return `Teams webhook error${error.statusCode ? ` (${error.statusCode})` : ""}: ${error.message}`;
  }
  if (error instanceof ValidationError) {
    return `Validation error${error.field ? ` (${error.field})` : ""}: ${error.message}`;
  }
  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }
  return "An unknown error occurred";
}
