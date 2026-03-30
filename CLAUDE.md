# Teams Channel Plugin — Development Guide

## Architecture

Teams Channel Plugin은 Microsoft Teams Outgoing/Incoming Webhook을 활용하여
Claude Code Channels 프로토콜을 구현하는 MCP 서버이다.

```
Teams 채널 ←→ HTTP Server (Bun.serve) ←→ MCP Server (stdio) ←→ Claude Code
```

### 모듈 구조

- `src/index.ts` — 엔트리포인트, 글로벌 에러 핸들러
- `src/server.ts` — MCP 서버 생성, 핸들러 등록, graceful shutdown
- `src/config.ts` — Zod 기반 환경변수 검증
- `src/http.ts` — Bun.serve HTTP 서버 (Outgoing Webhook 수신)
- `src/hmac.ts` — HMAC-SHA256 서명 검증 (timingSafeEqual)
- `src/access.ts` — 접근 제어 (gate, pairing, outbound gate, assertSendable)
- `src/webhook.ts` — Incoming Webhook 발신 + chunking
- `src/permission.ts` — 텍스트 기반 permission relay
- `src/types.ts` — 타입 정의
- `src/tools/` — MCP 도구 (reply)
- `src/utils/` — 에러, 검증, chunking 유틸리티

### 데이터 흐름

1. Teams 사용자가 `@claude-bot` 멘션 → Outgoing Webhook POST
2. HTTP 서버: HMAC 검증 → gate (pairing/allowlist) → permission 인터셉트
3. `notifications/claude/channel` → Claude Code 세션
4. Claude가 `reply` 도구 호출 → outbound gate → assertSendable → chunking → Incoming Webhook

## Development

```bash
# 의존성 설치
bun install

# 타입 체크
bunx tsc --noEmit

# 테스트
bun test:vitest

# 개발 실행 (watch 모드)
bun dev
```

## State Directory

`~/.claude/channels/teams/` 에 런타임 데이터 저장:
- `.env` — 자격증명 (0o600)
- `access.json` — 접근 제어 설정 (0o600, atomic write)
- `approved/` — pairing 승인 파일

## Conventions

- TypeScript strict mode
- ES modules (`.js` extension in imports)
- 도구 정의와 핸들러 분리 (`tools/*.ts`)
- Zod로 입력 검증 (`validateInput`)
- 커스텀 에러 클래스 + `formatErrorResponse`
- 파일 I/O: atomic write (tmp + rename), 0o600/0o700 권한
