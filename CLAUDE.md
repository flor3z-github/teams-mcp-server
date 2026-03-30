# Teams MCP Server — Development Guide

## Architecture

Teams MCP Server는 두 가지 모드를 지원하는 MCP 서버이다.

```
stdio 모드:  Claude Code ──stdio──> MCP Server + Bun.serve(:3978) → /api/messages
http 모드:   Claude Code ──HTTP──> MCP Server via node:http(:3978) → /mcp + /health
```

### 모듈 구조

- `src/index.ts` — 엔트리포인트, 글로벌 에러 핸들러
- `src/server.ts` — `createTeamsServer()` + `runServer()` (transport 분리)
- `src/config.ts` — Zod 기반 환경변수 검증 + CLI 인자
- `src/bot.ts` — CloudAdapter + TeamsActivityHandler
- `src/sender.ts` — Proactive messaging + chunking
- `src/conversations.ts` — ConversationReference 메모리+파일 영속화
- `src/http-server.ts` — 통합 HTTP 라우터 (stdio: Bun.serve, http: node:http)
- `src/permission.ts` — 텍스트 기반 permission relay
- `src/access.ts` — 접근 제어 (gate, pairing, outbound gate, assertSendable)
- `src/types.ts` — Access, ChannelMeta 타입
- `src/tools/` — MCP 도구 (reply)
- `src/utils/` — 에러, 검증, chunking, Markdown↔HTML

### 데이터 흐름 (stdio 모드)

1. Teams 사용자가 봇에게 메시지 → Bot Framework POST `/api/messages`
2. CloudAdapter JWT 검증 → TeamsActivityHandler.onMessage()
3. @멘션 제거 → HTML→Markdown → gate → permission 인터셉트
4. `notifications/claude/channel` → Claude Code 세션
5. Claude가 `reply` 도구 호출 → outbound gate → assertSendable → Markdown→HTML
6. `adapter.continueConversationAsync()` → Teams 대화

## Development

```bash
bun install           # 의존성 설치
bun dev               # stdio 모드 (watch)
bun start:http        # http 모드
bunx vitest run       # 단위 테스트 (43개)
docker compose up     # Docker 테스트
```

## State Directory

`~/.claude/channels/teams/`:
- `.env` — Azure 자격증명 (0o600)
- `access.json` — 접근 제어 (0o600, atomic write)
- `conversations.json` — ConversationReference 영속화
- `approved/` — pairing 승인 파일

## Conventions

- TypeScript strict mode, ES modules (`.js` imports)
- 도구 정의와 핸들러 분리 (`tools/*.ts`)
- Zod로 입력 검증 (`validateInput`)
- 커스텀 에러 클래스 + `formatErrorResponse`
- 파일 I/O: atomic write (tmp + rename), 0o600/0o700 권한
- stdio 모드: Bun.serve, http 모드: node:http (StreamableHTTPServerTransport 호환)
