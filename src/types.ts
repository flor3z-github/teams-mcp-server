// ─── Access Control 타입 ───

export interface PendingEntry {
  senderId: string;
  senderName: string;
  chatId: string;
  createdAt: number;
  expiresAt: number;
  replies: number;
}

export interface ChannelPolicy {
  requireMention: boolean;
  allowFrom: string[];
}

export interface Access {
  dmPolicy: "pairing" | "allowlist" | "disabled";
  allowFrom: string[];
  channels: Record<string, ChannelPolicy>;
  pending: Record<string, PendingEntry>;
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
}

// ─── Notification Meta ───

export interface ChannelMeta {
  chat_id: string;
  message_id: string;
  user: string;
  user_id: string;
  ts: string;
}
