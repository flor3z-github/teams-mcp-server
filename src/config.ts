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

function getCliArg(name: string): string | undefined {
  const prefix = `--${name}`;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === prefix && i + 1 < args.length) return args[i + 1];
    if (args[i]?.startsWith(`${prefix}=`)) return args[i]!.split("=")[1];
  }
  return undefined;
}

const configSchema = z
  .object({
    appId: z.string().default(""),
    appPassword: z.string().default(""),
    tenantId: z.string().default(""),
    appType: z
      .enum(["SingleTenant", "MultiTenant"])
      .default("SingleTenant"),
    port: z.number().int().min(1).max(65535).default(3978),
    transport: z.enum(["stdio", "http"]).default("stdio"),
    stateDir: z.string().default(STATE_DIR_DEFAULT),
    logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  })
  .refine(
    (c) => {
      // stdio 모드에서는 Azure 자격증명 필수 (Bot Framework 사용)
      if (c.transport === "stdio") {
        return c.appId && c.appPassword && c.tenantId;
      }
      // http 모드에서는 Azure 자격증명 불필요
      return true;
    },
    {
      message:
        "MICROSOFT_APP_ID, MICROSOFT_APP_PASSWORD, MICROSOFT_APP_TENANT_ID are required for stdio (channel) mode",
    },
  );

export type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
  loadEnvFile();

  try {
    return configSchema.parse({
      appId: process.env.MICROSOFT_APP_ID,
      appPassword: process.env.MICROSOFT_APP_PASSWORD,
      tenantId: process.env.MICROSOFT_APP_TENANT_ID,
      appType: process.env.MICROSOFT_APP_TYPE || "SingleTenant",
      port: Number(process.env.TEAMS_PORT) || 3978,
      transport: getCliArg("transport") || process.env.MCP_TRANSPORT || "stdio",
      stateDir: process.env.TEAMS_STATE_DIR || STATE_DIR_DEFAULT,
      logLevel: process.env.LOG_LEVEL || "info",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      process.stderr.write("teams chat: configuration errors:\n");
      for (const issue of error.issues) {
        process.stderr.write(`  - ${issue.path.join(".")}: ${issue.message}\n`);
      }
      process.stderr.write("\nRun /teams:configure to set up credentials.\n");
      process.exit(1);
    }
    throw error;
  }
}
