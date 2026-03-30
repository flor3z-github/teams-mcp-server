# Teams Channel Plugin for Claude Code

Microsoft Teams Outgoing Webhook + Incoming Webhook 조합으로 Claude Code Channels를 구현하는 MCP 서버 플러그인.

Teams 채널에서 `@claude-bot`으로 멘션하면 Claude Code 세션으로 메시지가 전달되고, Claude의 응답이 같은 Teams 채널에 표시된다.

## Features

- **Claude Code Channel Protocol** — `claude/channel` + `claude/channel/permission` capability
- **HMAC-SHA256 검증** — Teams Outgoing Webhook 서명을 timing-safe로 검증
- **Access Control** — pairing flow, allowlist, outbound gate
- **Permission Relay** — 도구 실행 승인을 텍스트 기반으로 Teams 채널에서 처리
- **Message Chunking** — 28KB payload 제한 대응 스마트 분할
- **Graceful Shutdown** — stdin EOF, SIGTERM, SIGINT 핸들링
- **Security Hardening** — 파일 권한 (0o600/0o700), atomic writes, state 파일 유출 방지

## Quick Start

### 1. 설치

```bash
git clone <repo-url>
cd teams-mcp-server
bun install
```

### 2. Teams 설정

**Incoming Webhook** (Claude → Teams):
1. Teams 채널 → 커넥터/워크플로 → "Incoming Webhook" 추가
2. Webhook URL 복사

**Outgoing Webhook** (Teams → Claude):
1. 팀 관리 → 앱 → 아웃고잉 웹훅 만들기
2. 콜백 URL: `https://<서버>:8788/webhook`
3. 보안 토큰 복사

### 3. 자격증명 설정

Claude Code 내에서:
```
/teams:configure
```

또는 수동으로 `~/.claude/channels/teams/.env` 생성:
```bash
TEAMS_WEBHOOK_SECRET=<Base64 보안 토큰>
TEAMS_INCOMING_WEBHOOK_URL=<Incoming Webhook URL>
TEAMS_PORT=8788
```

### 4. 접근 제어

```
/teams:access policy pairing    # pairing 모드 활성화
```

Teams에서 `@claude-bot hello` → 6자리 코드 발급 → Claude Code에서:
```
/teams:access pair <code>
```

### 5. 실행

```bash
# 서버 시작
bun start

# 개발 모드 (watch)
bun dev

# Claude Code 채널로 실행
claude --dangerously-load-development-channels /path/to/teams-mcp-server
```

## Architecture

```
Teams 채널 ←→ HTTP Server (Bun.serve) ←→ MCP Server (stdio) ←→ Claude Code
```

- **Outgoing Webhook** → HTTP POST → HMAC 검증 → gate → MCP notification
- **Claude reply tool** → chunking → Incoming Webhook POST → Teams 채널

## MCP Tools

| Tool | Description |
|---|---|
| `reply` | Teams 채널에 메시지 전송 (markdown, 자동 chunking) |

## Skills

| Skill | Description |
|---|---|
| `/teams:configure` | 자격증명 설정 (webhook secret, incoming URL, port) |
| `/teams:access` | 접근 제어 관리 (pair, allow, remove, policy) |

## Development

```bash
bun install          # 의존성 설치
bunx tsc --noEmit    # 타입 체크
bun test:vitest      # 테스트 실행 (vitest)
bun dev              # 개발 모드 (watch)
```

## Teams Platform Limitations

Webhook 기반 구현으로 인해 다음 기능은 지원되지 않음:

- Emoji reactions, typing indicator
- 메시지 편집, 스레드 답장
- 파일 첨부
- Action.Submit 버튼 (permission은 텍스트 기반)

이들 기능은 Graph API 연동 시 활성화 가능 (향후 확장).

## License

MIT
