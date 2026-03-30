---
name: configure
description: Set up the Teams channel — save webhook credentials and review access policy. Use when the user pastes Teams webhook credentials, asks to configure Teams, or wants to check channel status.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(chmod *)
---

# Teams Channel Configuration

You are configuring the Teams channel plugin. The state directory is `~/.claude/channels/teams/`.

## What to do

### If the user provides credentials

Save them to `~/.claude/channels/teams/.env`:

```
TEAMS_WEBHOOK_SECRET=<secret>
TEAMS_INCOMING_WEBHOOK_URL=<url>
TEAMS_PORT=<port or 8788>
```

Steps:
1. Create the directory: `mkdir -p ~/.claude/channels/teams`
2. Write the `.env` file with the credentials
3. Set permissions: `chmod 600 ~/.claude/channels/teams/.env`
4. Confirm success and show next steps

### If the user asks for status

1. Read `~/.claude/channels/teams/.env` — check if credentials are set (never display the full secret, just "set" or "not set")
2. Read `~/.claude/channels/teams/access.json` — show current policy and allowed senders count
3. Suggest next steps:
   - If no credentials: "Provide your Teams webhook secret and Incoming Webhook URL"
   - If no access policy: "Run `/teams:access policy pairing` to enable pairing, or add users with `/teams:access allow <id>`"

### Credential sources

- **TEAMS_WEBHOOK_SECRET**: Generated when creating an Outgoing Webhook in Teams (shown once, Base64 encoded)
- **TEAMS_INCOMING_WEBHOOK_URL**: Generated when creating an Incoming Webhook connector in the Teams channel
- **TEAMS_PORT**: HTTP port for the webhook listener (default: 8788)

## Security

- Never display the full webhook secret — only confirm whether it is set
- Always set `.env` file permissions to `0600`
- Always set state directory permissions to `0700`
