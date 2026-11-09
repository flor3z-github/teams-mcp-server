# Teams MCP Server — Development Guide

## Architecture

Teams MCP Server는 두 전송을 지원한다. `TEAMS_TRANSPORT`로 고른다.

- `http` (기본): 멀티유저. OAuth + Bearer 토큰으로 요청별 계정을 구분한다 (아래 그림).
- `stdio`: 단일 사용자. OAuth 없이 MSAL 캐시의 계정을 쓴다 (아래 "stdio 인증").

```
Claude Code A ── Bearer Token A ──┐
Claude Code B ── Bearer Token B ──┤──► Express + requireBearerAuth
Claude Code C ── Bearer Token C ──┘         │
                                            ▼ req.auth.extra.msalAccountId
                                   AsyncLocalStorage<SessionCredentials>
                                            │
                                   getToken() → 세션별 Graph 토큰 획득
```

### 모듈 구조

- `src/index.ts` — 엔트리포인트, 글로벌 에러 핸들러, `login` 서브커맨드
- `src/server.ts` — `runServer()` (initAuth 후 stdio 연결, 또는 initStore + HTTP 서버)
- `src/config.ts` — Zod 기반 환경변수 검증
- `src/context.ts` — AsyncLocalStorage 기반 세션 credential 저장소
- `src/auth/store.ts` — 파일 기반 OAuth 토큰 저장소 (oauth-store.json)
- `src/auth/provider.ts` — OAuthServerProvider 구현 (device code flow 통합)
- `src/graph/auth.ts` — MSAL 초기화, 다중 사용자 토큰 관리
- `src/graph/client.ts` — Microsoft Graph API 클라이언트
- `src/http-server.ts` — Express HTTP/HTTPS 서버 (mcpAuthRouter + requireBearerAuth)
- `src/mcp-server.ts` — MCP Server 인스턴스 생성, 도구 등록
- `src/tools/` — MCP 도구 (auth, teams, messages, search)
- `src/utils/` — 에러, 검증, Markdown↔HTML

### 인증 흐름

1. Claude Code가 HTTP MCP 서버에 접속
2. MCP SDK OAuth discovery → `/authorize` 엔드포인트
3. Device code flow HTML 페이지 서빙 → 사용자가 MS 계정으로 로그인
4. MSAL device code flow 완료 → `msalAccountId` 추출
5. Auth code 발급 → access/refresh 토큰 교환 (msalAccountId 바인딩)
6. 이후 요청: Bearer 토큰 → `msalAccountId` 추출 → `AsyncLocalStorage`에 주입
7. `getToken()` → 해당 계정의 Graph 토큰 silent 획득

### stdio 인증

1. `bun run login` → device code flow → MSAL 캐시에 계정 저장
2. 도구 호출마다 `getSingleAccountId()`가 캐시를 다시 읽어 계정 1개를 고름 (0개·2개 이상이면 에러, 임의 선택 금지)
3. `mcp-server.ts`가 그 계정을 `sessionStore.run()`으로 주입 → 이후 HTTP와 같은 `getToken()` 경로
4. 이 대체 주입은 `transport === "stdio"`일 때만. HTTP 경로에서 캐시 계정으로 대체하면 Bearer 없이 남의 계정을 쓰게 된다

## Development

```bash
bun install           # 의존성 설치
bun run start         # HTTP 서버 시작
TEAMS_TRANSPORT=stdio bun run start   # stdio 서버 시작
bun run login         # stdio용 MS 계정 로그인 (device code)
bun dev               # watch 모드
bunx vitest run       # 단위 테스트
```

## State Directory

`~/.claude/channels/teams/`:
- `graph-token-cache.json` — MSAL 토큰 캐시 (다중 계정, 0o600)
- `oauth-store.json` — OAuth 클라이언트/토큰 저장소 (0o600, atomic write)

## Conventions

- TypeScript strict mode, ES modules (`.js` imports)
- 도구 정의와 핸들러 분리 (`tools/*.ts`)
- Zod로 입력 검증 (`validateInput`)
- 커스텀 에러 클래스 + `formatErrorResponse`
- 파일 I/O: atomic write (tmp + rename), 0o600/0o700 권한
- 로깅: `process.stderr.write()`, 접두사 `teams mcp:`, 이모지 사용 금지
- Express + MCP SDK auth (mcpAuthRouter, requireBearerAuth)
- 전송 보안: `TEAMS_TLS_CERT`/`TEAMS_TLS_KEY` 둘 다 있으면 `https.createServer`, 없으면 평문 HTTP
- 바인딩 기본값 `127.0.0.1` (`TEAMS_HOST`로 변경). 루프백/와일드카드일 때 OAuth issuer 호스트명은 `localhost`로 고정
- AsyncLocalStorage로 요청별 credential 전파
