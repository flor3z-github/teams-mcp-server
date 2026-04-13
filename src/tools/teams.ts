import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Config } from "../config.js";
import { validateInput } from "../utils/validators.js";
import * as graph from "../graph/client.js";

export const teamsTools: Tool[] = [
  {
    name: "list_teams",
    description: "List all Teams that the authenticated user has joined.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "list_channels",
    description: "List all channels in a specific Team.",
    inputSchema: {
      type: "object" as const,
      properties: {
        team_id: {
          type: "string",
          description: "The Team ID (from list_teams)",
        },
      },
      required: ["team_id"],
    },
  },
  {
    name: "list_team_members",
    description: "List all members of a specific Team.",
    inputSchema: {
      type: "object" as const,
      properties: {
        team_id: {
          type: "string",
          description: "The Team ID (from list_teams)",
        },
      },
      required: ["team_id"],
    },
  },
];

const listChannelsSchema = z.object({
  team_id: z.string().min(1, "team_id is required"),
});

const listTeamMembersSchema = z.object({
  team_id: z.string().min(1, "team_id is required"),
});

export const teamsHandlers: Record<
  string,
  (input: unknown, config: Config) => Promise<{ content: { type: string; text: string }[] }>
> = {
  list_teams: handleListTeams,
  list_channels: handleListChannels,
  list_team_members: handleListTeamMembers,
};

async function handleListTeams(
  _input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const teams = await graph.listTeams();
  return {
    content: [{ type: "text", text: JSON.stringify(teams, null, 2) }],
  };
}

async function handleListChannels(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { team_id } = validateInput(listChannelsSchema, input);
  const channels = await graph.listChannels(team_id);
  return {
    content: [{ type: "text", text: JSON.stringify(channels, null, 2) }],
  };
}

async function handleListTeamMembers(
  input: unknown,
  _config: Config,
): Promise<{ content: { type: string; text: string }[] }> {
  const { team_id } = validateInput(listTeamMembersSchema, input);
  const members = await graph.listTeamMembers(team_id);
  return {
    content: [{ type: "text", text: JSON.stringify(members, null, 2) }],
  };
}
