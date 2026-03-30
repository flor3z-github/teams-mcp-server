# Teams MCP Server for Claude Code

Microsoft Teams Bot Framework 기반 MCP 서버. 두 가지 모드를 지원합니다:

- **Channel (stdio)** — Claude Code가 spawn하여 Teams 채팅을 채널로 사용
- **Tool Server (HTTP)** — Docker 배포 가능, 일반 MCP 도구 서버로 사용

## Quick Start

### 1. 설치

```bash
git clone https://github.com/flor3z-github/teams-mcp-server.git
cd teams-mcp-server
bun install
```

### 2. Azure 자격증명 설정

[Azure Portal](https://portal.azure.com)에서 App Registration + Azure Bot 생성 후:

```bash
mkdir -p ~/.claude/channels/teams
cat > ~/.claude/channels/teams/.env << 'EOF'
MICROSOFT_APP_ID=<your-app-id>
MICROSOFT_APP_PASSWORD=<your-client-secret>
MICROSOFT_APP_TENANT_ID=<your-tenant-id>
MICROSOFT_APP_TYPE=SingleTenant
TEAMS_PORT=3978
EOF
chmod 600 ~/.claude/channels/teams/.env
```

또는 Claude Code 내에서 `/teams:configure` 실행.

### 3. 실행

**Channel 모드** (Claude Code 채널로 Teams 채팅 사용):
```bash
claude --dangerously-load-development-channels /path/to/teams-mcp-server
```

**Tool Server 모드** (HTTP, Docker 배포 가능, Azure 불필요):
```bash
bun start:http
# 또는
docker compose up
```

연결:
```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

자세한 설정 방법은 [USAGE.md](USAGE.md)를 참조하세요.

## Features

- **Bot Framework** — CloudAdapter + TeamsActivityHandler, JWT 자동 인증
- **1:1 채팅 + 그룹 채팅 + 채널** 지원
- **Dual Transport** — stdio (채널) / HTTP (도구 서버)
- **Claude Code Channel Protocol** — `claude/channel` + `claude/channel/permission`
- **Access Control** — pairing flow, allowlist, outbound gate
- **Permission Relay** — 텍스트 기반 도구 실행 승인
- **Markdown↔HTML** — marked + turndown 양방향 변환
- **Message Chunking** — 스마트 분할
- **Docker 지원** — Dockerfile + docker-compose.yml

## MCP Tools

| Tool | Description |
|---|---|
| `reply` | Teams 대화에 메시지 전송 (markdown → HTML, 자동 chunking) |

## Skills (Channel 모드)

| Skill | Description |
|---|---|
| `/teams:configure` | Azure 자격증명 설정, 현재 상태 확인 |
| `/teams:access` | 접근 제어 관리 (pair, allow, remove, policy) |

## Development

```bash
bun install           # 의존성 설치
bun dev               # 개발 모드 (watch, stdio)
bun start:http        # HTTP 모드 테스트
bunx vitest run       # 단위 테스트
docker compose up     # Docker 테스트
```

## License

MIT
