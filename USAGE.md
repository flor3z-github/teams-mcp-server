# Usage Guide

## 목차

- [로컬 실행](#로컬-실행)
- [Claude Code 연결](#claude-code-연결)
- [Docker 배포](#docker-배포)
- [환경변수 레퍼런스](#환경변수-레퍼런스)
- [HTTPS](#https)
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
curl http://localhost:3978/health   # HTTPS 사용 시: curl -k https://localhost:3978/health

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
  -e TEAMS_HOST=0.0.0.0 \
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
| `TEAMS_PORT` | `3978` | 서버 포트 |
| `TEAMS_HOST` | `127.0.0.1` | 바인딩 주소. 원격 접속·Docker에서는 `0.0.0.0` 필요 |
| `TEAMS_TLS_CERT` | (없음) | TLS 인증서 경로. `TEAMS_TLS_KEY`와 함께 지정하면 HTTPS로 기동 |
| `TEAMS_TLS_KEY` | (없음) | TLS 개인키 경로 |
| `TEAMS_BASE_URL` | (없음) | 외부 접근 URL. 리버스 프록시 뒤에서 실행 시 지정 (설정 시 `trust proxy` 활성화) |
| `TEAMS_STATE_DIR` | `~/.claude/channels/teams` | State 파일 디렉토리 (MSAL 캐시, OAuth 저장소) |
| `LOG_LEVEL` | `info` | `debug` / `info` / `warn` / `error` |

환경변수는 `.env` 파일 또는 시스템 환경변수로 설정할 수 있습니다.

`TEAMS_TLS_CERT`와 `TEAMS_TLS_KEY`는 둘 다 지정하거나 둘 다 생략해야 합니다. 하나만 지정하면 기동 시 설정 검증 오류로 종료됩니다.

> **주의 — 바인딩 기본값 변경 (호환성 깨짐)**
>
> 이전 버전은 항상 `0.0.0.0`에 바인딩했습니다. 현재 기본값은 `127.0.0.1`(로컬 전용)입니다.
> LAN·원격 호스트에서 서버를 실행 중이었다면 업데이트 후 외부에서 접속되지 않습니다.
> 서버는 정상적으로 "listening" 로그를 출력하고 연결만 거부되므로 증상이 드러나지 않습니다.
> `TEAMS_HOST=0.0.0.0`을 명시하세요. Docker(`docker-compose.yml`)는 이미 설정돼 있습니다.

---

## HTTPS

인증서와 개인키를 지정하면 서버가 HTTPS로 기동합니다.

```bash
TEAMS_TLS_CERT=/etc/letsencrypt/live/example.com/fullchain.pem \
TEAMS_TLS_KEY=/etc/letsencrypt/live/example.com/privkey.pem \
TEAMS_HOST=0.0.0.0 \
bun run start
```

OAuth issuer URL은 TLS 설정 여부에 따라 `http://` / `https://`가 자동으로 결정됩니다.
`0.0.0.0` 또는 루프백 바인딩일 때 issuer 호스트명은 `localhost`로 고정됩니다.

### 로컬 테스트용 자체 서명 인증서

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout key.pem -out cert.pem -subj "/CN=localhost"

TEAMS_TLS_CERT=$PWD/cert.pem TEAMS_TLS_KEY=$PWD/key.pem bun run start
curl -k https://localhost:3978/health
```

자체 서명 인증서는 MCP 클라이언트가 거부할 수 있습니다. 실제 배포에는 신뢰된 CA 인증서를 사용하세요.

### 리버스 프록시에서 TLS 종단

nginx·caddy 등이 TLS를 처리하는 경우 `TEAMS_TLS_*` 없이 `TEAMS_BASE_URL`만 지정합니다.

```bash
TEAMS_HOST=127.0.0.1 TEAMS_BASE_URL=https://teams-mcp.example.com bun run start
```

### 보안 주의

`TEAMS_HOST`를 루프백이 아닌 주소로 바꾸면서 TLS도 리버스 프록시도 없으면, Bearer 토큰과 OAuth 인가 코드가 평문으로 전송됩니다. 이 경우 서버가 기동 시 경고를 출력합니다.

---

## 트러블슈팅

### 헬스체크

```bash
curl http://localhost:3978/health   # HTTPS 사용 시: curl -k https://localhost:3978/health
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
