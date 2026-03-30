import type { ConversationReference } from "botbuilder";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";

const refs = new Map<string, Partial<ConversationReference>>();
let lastActiveConversationId: string | undefined;

export function saveRef(
  ref: Partial<ConversationReference>,
  config: Config,
): void {
  const id = ref.conversation?.id;
  if (!id) return;
  refs.set(id, ref);
  lastActiveConversationId = id;
  persistToDisk(config);
}

export function getRef(
  conversationId: string,
): Partial<ConversationReference> | undefined {
  return refs.get(conversationId);
}

export function getLastActiveConversation(): string | undefined {
  return lastActiveConversationId;
}

export function loadFromDisk(config: Config): void {
  const filePath = join(config.stateDir, "conversations.json");
  if (!existsSync(filePath)) return;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8")) as Record<
      string,
      Partial<ConversationReference>
    >;
    for (const [id, ref] of Object.entries(data)) {
      refs.set(id, ref);
    }
  } catch {
    // 손상된 파일 무시
  }
}

function persistToDisk(config: Config): void {
  mkdirSync(config.stateDir, { recursive: true, mode: 0o700 });
  const filePath = join(config.stateDir, "conversations.json");
  const tmp = filePath + ".tmp";
  const obj = Object.fromEntries(refs);
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, filePath);
}
