import { z } from "zod";
import { readFileSync, chmodSync, existsSync } from "node:fs";
import { join } from "node:path";

const STATE_DIR_DEFAULT = join(
  process.env.HOME || "~",
  ".claude",
  "channels",
  "teams",
);

function loadEnvFile(): void {
  const stateDir = process.env.TEAMS_STATE_DIR || STATE_DIR_DEFAULT;
  const envPath = join(stateDir, ".env");
  if (!existsSync(envPath)) return;

  try {
    chmodSync(envPath, 0o600);
  } catch {
    // 권한 변경 실패 무시
  }

  const content = readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const value = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const configSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3978),
  stateDir: z.string().default(STATE_DIR_DEFAULT),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  loadEnvFile();

  try {
    return configSchema.parse({
      port: Number(process.env.TEAMS_PORT) || 3978,
      stateDir: process.env.TEAMS_STATE_DIR || STATE_DIR_DEFAULT,
      logLevel: process.env.LOG_LEVEL || "info",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      process.stderr.write("teams mcp: configuration errors:\n");
      for (const issue of error.issues) {
        process.stderr.write(`  - ${issue.path.join(".")}: ${issue.message}\n`);
      }
      process.exit(1);
    }
    throw error;
  }
}
