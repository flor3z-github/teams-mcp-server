import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  readdirSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { realpathSync } from "node:fs";
import type { Config } from "./config.js";
import type { Access } from "./types.js";

// ─── Defaults ───

function defaultAccess(): Access {
  return {
    dmPolicy: "allowlist",
    allowFrom: [],
    channels: {},
    pending: {},
  };
}

// ─── File I/O (hardened) ───

function accessFilePath(config: Config): string {
  return join(config.stateDir, "access.json");
}

export function loadAccess(config: Config): Access {
  const filePath = accessFilePath(config);
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<Access>;
    return {
      dmPolicy: parsed.dmPolicy ?? "allowlist",
      allowFrom: parsed.allowFrom ?? [],
      channels: parsed.channels ?? {},
      pending: parsed.pending ?? {},
      textChunkLimit: parsed.textChunkLimit,
      chunkMode: parsed.chunkMode,
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultAccess();
    }
    // 손상된 파일 → 이동 후 기본값 반환
    try {
      renameSync(filePath, `${filePath}.corrupt-${Date.now()}`);
    } catch {
      // rename 실패 무시
    }
    process.stderr.write(
      "teams channel: access.json is corrupt, moved aside.\n",
    );
    return defaultAccess();
  }
}

export function saveAccess(access: Access, config: Config): void {
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const filePath = accessFilePath(config);
  const tmp = filePath + ".tmp";
  writeFileSync(tmp, JSON.stringify(access, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, filePath);
}

// ─── Gate ───

export type GateResult =
  | { action: "allow" }
  | { action: "deny" }
  | { action: "pairing"; code: string };

export function gate(
  senderId: string,
  senderName: string,
  config: Config,
): GateResult {
  const access = loadAccess(config);

  if (access.dmPolicy === "disabled") {
    return { action: "deny" };
  }

  if (access.allowFrom.includes(senderId)) {
    return { action: "allow" };
  }

  if (access.dmPolicy === "allowlist") {
    return { action: "deny" };
  }

  // pairing 모드
  const now = Date.now();

  // 만료된 pending 정리
  for (const [code, entry] of Object.entries(access.pending)) {
    if (entry.expiresAt < now) {
      delete access.pending[code];
    }
  }

  // 이 sender에 대한 기존 pending 재사용
  for (const [code, entry] of Object.entries(access.pending)) {
    if (entry.senderId === senderId) {
      entry.replies++;
      if (entry.replies > 2) {
        delete access.pending[code];
        saveAccess(access, config);
        return { action: "deny" };
      }
      saveAccess(access, config);
      return { action: "pairing", code };
    }
  }

  // 최대 3개 pending 제한
  if (Object.keys(access.pending).length >= 3) {
    return { action: "deny" };
  }

  // 새 pairing 코드 생성
  const code = randomBytes(3).toString("hex");
  access.pending[code] = {
    senderId,
    senderName,
    chatId: "",
    createdAt: now,
    expiresAt: now + 60 * 60 * 1000,
    replies: 1,
  };
  saveAccess(access, config);
  return { action: "pairing", code };
}

// ─── Outbound Gate ───

export function assertAllowedChat(
  conversationId: string,
  config: Config,
): void {
  const access = loadAccess(config);
  if (conversationId in access.channels) return;
  if (Object.keys(access.channels).length === 0) return;
  throw new Error(
    `channel ${conversationId} is not allowlisted — add via /teams:access`,
  );
}

// ─── assertSendable — state 파일 유출 방지 ───

export function assertSendable(text: string, config: Config): void {
  // config.stateDir 자체와 realpath 모두 체크 (심볼릭 링크 대응)
  const paths = [config.stateDir];
  try {
    const real = realpathSync(config.stateDir);
    if (real !== config.stateDir) paths.push(real);
  } catch {
    // realpath 실패 무시
  }

  for (const p of paths) {
    if (text.includes(p + sep)) {
      throw new Error("refusing to send channel state file content");
    }
  }

  if (text.includes("access.json")) {
    throw new Error("refusing to send channel state file content");
  }
}

// ─── Approved 디렉토리 폴링 ───

export function pollApproved(config: Config): string[] {
  const approvedDir = join(config.stateDir, "approved");
  if (!existsSync(approvedDir)) return [];

  const files = readdirSync(approvedDir);
  const approved: string[] = [];
  for (const file of files) {
    const filePath = join(approvedDir, file);
    approved.push(file);
    try {
      unlinkSync(filePath);
    } catch {
      // 삭제 실패 무시
    }
  }
  return approved;
}
