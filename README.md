# Teams MCP Server

Microsoft Graph API 기반 MCP 서버. HTTP transport로 동작하며, 멀티유저 인증을 지원합니다.

각 클라이언트가 자신의 Microsoft 계정으로 독립 인증하여 Teams 데이터에 접근합니다.

## Quick Start

### 1. 설치

```bash
git clone https://github.com/flor3z-github/teams-mcp-server.git
cd teams-mcp-server
bun install
```

### 2. 실행

```bash
bun run start
```

### 3. Claude Code에서 연결

```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

브라우저가 열리면 Microsoft 계정으로 로그인합니다. Azure App Registration 불필요.

## Features

- **멀티유저 인증** — 클라이언트별 독립된 MSAL device code flow
- **OAuth 2.0 + PKCE** — MCP SDK 기반 인증 (mcpAuthRouter + requireBearerAuth)
- **Microsoft Graph API** — Teams, 채팅, 메시지, 사용자 검색
- **Markdown↔HTML** — marked + turndown 양방향 변환
- **Docker 지원** — Dockerfile + docker-compose.yml

## MCP Tools

| Tool | Description |
|---|---|
| `auth_status` | 현재 세션의 인증 상태 확인 |
| `auth_login` | 인증 상태 확인 (OAuth flow로 이미 인증됨) |
| `list_teams` | 참여 중인 Teams 목록 |
| `list_channels` | 팀의 채널 목록 |
| `get_messages` | 채널 또는 채팅 메시지 조회 |
| `send_message` | 채널 또는 채팅에 메시지 전송 |
| `list_chats` | 1:1 및 그룹 채팅 목록 |
| `search_messages` | 메시지 검색 (KQL) |
| `get_me` | 내 프로필 조회 |
| `get_user` | 사용자 프로필 조회 |

## Development

```bash
bun install           # 의존성 설치
bun run start         # 서버 시작
bun dev               # watch 모드
bunx vitest run       # 단위 테스트
docker compose up     # Docker 실행
```

자세한 설정 방법은 [USAGE.md](USAGE.md)를 참조하세요.

## License

MIT
