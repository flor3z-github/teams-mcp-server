import { Client } from "@microsoft/microsoft-graph-client";
import { getToken } from "./auth.js";
import { htmlToMarkdown } from "../utils/markdown.js";
import { markdownToHtml } from "../utils/markdown.js";

function createClient(): Client {
  return Client.init({
    authProvider: async (done) => {
      try {
        const token = await getToken();
        done(null, token);
      } catch (err) {
        done(err as Error, null);
      }
    },
  });
}

// ─── Teams ───

export async function listTeams(): Promise<unknown> {
  const client = createClient();
  const result = await client.api("/me/joinedTeams").get();
  return (result.value || []).map((t: any) => ({
    id: t.id,
    displayName: t.displayName,
    description: t.description,
  }));
}

export async function listChannels(teamId: string): Promise<unknown> {
  const client = createClient();
  const result = await client.api(`/teams/${teamId}/channels`).get();
  return (result.value || []).map((c: any) => ({
    id: c.id,
    displayName: c.displayName,
    description: c.description,
    membershipType: c.membershipType,
  }));
}

export async function listTeamMembers(teamId: string): Promise<unknown> {
  const client = createClient();
  const result = await client.api(`/teams/${teamId}/members`).get();
  return (result.value || []).map((m: any) => ({
    id: m.id,
    displayName: m.displayName,
    email: m.email,
    roles: m.roles || [],
  }));
}

// ─── Messages ───

export async function getChannelMessages(
  teamId: string,
  channelId: string,
  top: number = 10,
): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .top(top)
    .orderby("lastModifiedDateTime desc")
    .get();
  return formatMessages(result.value || []);
}

export async function getChatMessages(
  chatId: string,
  top: number = 10,
): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api(`/me/chats/${chatId}/messages`)
    .top(top)
    .orderby("createdDateTime desc")
    .get();
  return formatMessages(result.value || []);
}

export async function getChannelMessageReplies(
  teamId: string,
  channelId: string,
  messageId: string,
  top: number = 25,
): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
    .top(top)
    .orderby("createdDateTime asc")
    .get();
  return formatMessages(result.value || []);
}

export async function replyToChannelMessage(
  teamId: string,
  channelId: string,
  messageId: string,
  text: string,
): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages/${messageId}/replies`)
    .post({
      body: {
        contentType: "html",
        content: markdownToHtml(text),
      },
    });
  return { id: result.id, createdDateTime: toKST(result.createdDateTime) };
}

export async function sendChannelMessage(
  teamId: string,
  channelId: string,
  text: string,
): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api(`/teams/${teamId}/channels/${channelId}/messages`)
    .post({
      body: {
        contentType: "html",
        content: markdownToHtml(text),
      },
    });
  return { id: result.id, createdDateTime: toKST(result.createdDateTime) };
}

export async function sendChatMessage(
  chatId: string,
  text: string,
): Promise<unknown> {
  const client = createClient();
  const result = await client.api(`/me/chats/${chatId}/messages`).post({
    body: {
      contentType: "html",
      content: markdownToHtml(text),
    },
  });
  return { id: result.id, createdDateTime: toKST(result.createdDateTime) };
}

export async function listChats(top: number = 20): Promise<unknown> {
  const client = createClient();
  const result = await client
    .api("/me/chats")
    .top(top)
    .expand("members")
    .get();
  return (result.value || [])
    .sort((a: any, b: any) =>
      new Date(b.lastUpdatedDateTime).getTime() - new Date(a.lastUpdatedDateTime).getTime(),
    )
    .map((c: any) => ({
      id: c.id,
      topic: c.topic || "(no topic)",
      chatType: c.chatType,
      members: (c.members || []).map((m: any) => m.displayName).filter(Boolean),
      lastUpdatedDateTime: toKST(c.lastUpdatedDateTime),
    }));
}

// ─── Search ───

export async function searchMessages(query: string): Promise<unknown> {
  const client = createClient();
  const result = await client.api("/search/query").post({
    requests: [
      {
        entityTypes: ["chatMessage"],
        query: { queryString: query },
        from: 0,
        size: 25,
      },
    ],
  });

  const hits = result.value?.[0]?.hitsContainers?.[0]?.hits || [];
  return hits.map((hit: any) => ({
    summary: hit.summary,
    resource: {
      id: hit.resource?.id,
      from: hit.resource?.from?.emailAddress?.name,
      body: hit.resource?.body?.content
        ? htmlToMarkdown(hit.resource.body.content)
        : "",
      createdDateTime: toKST(hit.resource?.createdDateTime),
    },
  }));
}

// ─── Users ───

export async function getMe(): Promise<unknown> {
  const client = createClient();
  const user = await client
    .api("/me")
    .select("id,displayName,mail,userPrincipalName,jobTitle")
    .get();
  return {
    id: user.id,
    displayName: user.displayName,
    mail: user.mail,
    userPrincipalName: user.userPrincipalName,
    jobTitle: user.jobTitle,
  };
}

export async function getUser(userId: string): Promise<unknown> {
  const client = createClient();
  const user = await client
    .api(`/users/${userId}`)
    .select("id,displayName,mail,userPrincipalName,jobTitle")
    .get();
  return {
    id: user.id,
    displayName: user.displayName,
    mail: user.mail,
    userPrincipalName: user.userPrincipalName,
    jobTitle: user.jobTitle,
  };
}

// ─── Helpers ───

function toKST(utc: string | undefined): string {
  if (!utc) return "";
  const d = new Date(utc);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

function formatMessages(messages: any[]): unknown {
  return messages.map((m: any) => ({
    id: m.id,
    from: m.from?.user?.displayName || m.from?.application?.displayName || "unknown",
    body: m.body?.contentType === "html"
      ? htmlToMarkdown(m.body.content || "")
      : m.body?.content || "",
    createdDateTime: toKST(m.createdDateTime),
    messageType: m.messageType,
  }));
}
