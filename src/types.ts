// ─── Teams Outgoing Webhook 페이로드 ───

export interface TeamsOutgoingWebhookPayload {
  type: "message";
  id: string;
  timestamp: string;
  localTimestamp: string;
  serviceUrl: string;
  channelId: string;
  from: {
    id: string;
    name: string;
    aadObjectId: string;
  };
  conversation: {
    id: string;
    name: string;
  };
  recipient: {
    id: string;
    name: string;
  };
  text: string;
  textFormat: "plain" | "markdown";
  channelData: {
    teamsChannelId: string;
    teamsTeamId: string;
    channel: { id: string };
    team: { id: string };
    tenant: { id: string };
  };
}

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
