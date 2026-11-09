import { describe, it, expect, vi, beforeEach } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Config } from "../../src/config.js";

vi.mock("../../src/graph/auth.js", () => ({
  getSingleAccountId: vi.fn(),
  getAccountById: vi.fn(),
  getToken: vi.fn(),
}));

import { createTeamsServer } from "../../src/mcp-server.js";
import { getSingleAccountId, getAccountById } from "../../src/graph/auth.js";

const mockGetSingleAccountId = vi.mocked(getSingleAccountId);

async function callAuthStatus(transport: Config["transport"]): Promise<string> {
  const server = await createTeamsServer({
    transport,
    port: 3978,
    host: "127.0.0.1",
    stateDir: "/tmp/test",
    logLevel: "info",
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientSide);
  const result = await client.callTool({ name: "auth_status", arguments: {} });
  await client.close();
  return (result.content as { text: string }[])[0].text;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAccountById).mockImplementation(async (id) =>
    id === "acct-1"
      ? {
          name: "Stdio User",
          username: "stdio@example.com",
          tenantId: "tenant-1",
          homeAccountId: "acct-1",
          environment: "login.microsoftonline.com",
          localAccountId: "local-1",
        }
      : null,
  );
});

describe("도구 호출 시 계정 주입", () => {
  it("stdio: MSAL 캐시의 단일 계정을 세션으로 주입", async () => {
    mockGetSingleAccountId.mockResolvedValue("acct-1");
    expect(await callAuthStatus("stdio")).toContain("Authenticated as: Stdio User");
  });

  it("stdio: 계정을 고를 수 없으면 에러 메시지 반환", async () => {
    mockGetSingleAccountId.mockRejectedValue(
      new Error("Not authenticated. Run `bun run login`"),
    );
    expect(await callAuthStatus("stdio")).toContain("bun run login");
  });

  it("http: 세션이 없어도 캐시 계정으로 대체하지 않음", async () => {
    expect(await callAuthStatus("http")).toContain("Not authenticated");
    expect(mockGetSingleAccountId).not.toHaveBeenCalled();
  });
});
