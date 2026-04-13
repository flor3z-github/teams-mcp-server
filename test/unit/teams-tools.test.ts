import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config } from "../../src/config.js";

vi.mock("../../src/graph/client.js", () => ({
  listTeams: vi.fn(),
  listChannels: vi.fn(),
}));

// graph/auth.ts를 mock해야 client.ts import 시 에러 방지
vi.mock("../../src/graph/auth.js", () => ({
  getToken: vi.fn(),
}));

import { teamsHandlers } from "../../src/tools/teams.js";
import * as graph from "../../src/graph/client.js";

const mockListTeams = vi.mocked(graph.listTeams);
const mockListChannels = vi.mocked(graph.listChannels);

const config: Config = { port: 3978, stateDir: "/tmp", logLevel: "info" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("list_teams", () => {
  it("teams 목록을 JSON으로 반환", async () => {
    mockListTeams.mockResolvedValue([
      { id: "t1", displayName: "Team A", description: "desc" },
    ]);
    const result = await teamsHandlers.list_teams({}, config);
    expect(result.content[0].text).toContain("Team A");
    expect(mockListTeams).toHaveBeenCalledOnce();
  });
});

describe("list_channels", () => {
  it("채널 목록을 JSON으로 반환", async () => {
    mockListChannels.mockResolvedValue([
      { id: "c1", displayName: "General" },
    ]);
    const result = await teamsHandlers.list_channels(
      { team_id: "t1" },
      config,
    );
    expect(result.content[0].text).toContain("General");
    expect(mockListChannels).toHaveBeenCalledWith("t1");
  });

  it("team_id 누락 시 ValidationError", async () => {
    await expect(
      teamsHandlers.list_channels({}, config),
    ).rejects.toThrow();
  });
});
