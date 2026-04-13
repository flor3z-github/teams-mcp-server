# Usage Guide

## 목차

- [로컬 실행](#로컬-실행)
- [Claude Code 연결](#claude-code-연결)
- [Docker 배포](#docker-배포)
- [환경변수 레퍼런스](#환경변수-레퍼런스)
- [트러블슈팅](#트러블슈팅)

---

## 로컬 실행

```bash
bun install
bun run start
```

서버가 `0.0.0.0:3978`에서 시작됩니다. Azure App Registration은 필요 없습니다.

### 엔드포인트

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/mcp` | POST/GET/DELETE | MCP Streamable HTTP transport (Bearer 인증) |
| `/health` | GET | 헬스체크 (인증 불필요) |
| `/authorize` | GET | OAuth 인증 페이지 (device code flow) |

---

## Claude Code 연결

```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

원격 서버에 연결할 경우:
```bash
claude mcp add --transport http teams http://<서버IP>:3978/mcp
```

user config에 저장하려면:
```bash
claude mcp add -s user --transport http teams http://localhost:3978/mcp
```

### 인증 흐름

1. Claude Code가 서버에 접속하면 브라우저가 열림
2. Device code flow 페이지에서 `microsoft.com/devicelogin` 접속
3. 표시된 코드 입력 후 Microsoft 계정으로 로그인
4. 인증 완료 후 자동 redirect → MCP 도구 사용 가능

각 클라이언트는 독립된 인증을 수행합니다. 여러 사용자가 하나의 서버에 접속하여 각자의 Microsoft 계정으로 사용할 수 있습니다.

---

## Docker 배포

### docker-compose (권장)

```bash
# .env 파일 생성
cp .env.example .env
# 필요 시 TEAMS_PORT, LOG_LEVEL 수정

# 시작
docker compose up -d

# 확인
curl http://localhost:3978/health

# 중지
docker compose down
```

### docker run

```bash
docker build -t teams-mcp-server .

docker run -d --name teams-mcp \
  -p 3978:3978 \
  -v teams-state:/data \
  -e TEAMS_STATE_DIR=/data \
  -e TEAMS_PORT=3978 \
  teams-mcp-server
```

### Claude Code에서 Docker 서버에 연결

```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

---

## 환경변수 레퍼런스

| 변수 | 기본값 | 설명 |
|---|---|---|
| `TEAMS_PORT` | `3978` | HTTP 서버 포트 |
| `TEAMS_STATE_DIR` | `~/.claude/channels/teams` | State 파일 디렉토리 (MSAL 캐시, OAuth 저장소) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

환경변수는 `.env` 파일 또는 시스템 환경변수로 설정할 수 있습니다.

---

## 트러블슈팅

### 헬스체크

```bash
curl http://localhost:3978/health
# {"status":"ok","sessions":0,"ts":"..."}
```

### 인증 실패 시

- 서버 stderr 로그에서 `device code flow failed` 메시지 확인
- MSAL 토큰 캐시 초기화: `~/.claude/channels/teams/graph-token-cache.json` 삭제 후 재접속

### Docker에서 state가 유지되지 않음

`docker-compose.yml`에 볼륨이 설정되어 있는지 확인:
```yaml
volumes:
  - teams-state:/data
```

### 원격 접속 실패

- 서버와 클라이언트가 같은 네트워크에 있는지 확인
- 방화벽에서 해당 포트가 열려 있는지 확인
- `curl http://<서버IP>:3978/health`로 연결 테스트
