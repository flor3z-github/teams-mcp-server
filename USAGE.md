# Usage Guide

## 목차

- [Azure 설정](#azure-설정)
- [Channel 모드 (stdio)](#channel-모드-stdio)
- [Tool Server 모드 (HTTP)](#tool-server-모드-http)
- [Docker 배포](#docker-배포)
- [접근 제어](#접근-제어)
- [환경변수 레퍼런스](#환경변수-레퍼런스)
- [Skills](#skills)
- [트러블슈팅](#트러블슈팅)

---

## Azure 설정

### Step 1: App Registration 생성

1. [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID** → **App registrations** → **New registration**
2. 이름: `claude-teams-bot`
3. Supported account types: **Single tenant**
4. 등록 완료 후 복사:
   - **Application (client) ID** → `MICROSOFT_APP_ID`
   - **Directory (tenant) ID** → `MICROSOFT_APP_TENANT_ID`
5. **Certificates & secrets** → **New client secret** → 값 복사 → `MICROSOFT_APP_PASSWORD`

> ⚠️ Client Secret은 생성 직후에만 볼 수 있습니다. 반드시 바로 복사하세요.

### Step 2: Azure Bot 리소스 생성

> Azure 구독이 필요합니다 (F0 무료 티어 가능).

1. Azure Portal → **Create a resource** → **Azure Bot** 검색 → **Create**
2. 설정:
   - Bot handle: `claude-teams-bot`
   - Pricing tier: **F0 (Free)**
   - App ID: Step 1에서 만든 Application ID
3. **Messaging endpoint**: `https://<your-server>:3978/api/messages`
4. **Channels** → **Microsoft Teams** 활성화

### Step 3: Teams App 사이드로딩

1. `manifest/manifest.json`에서 `{{MICROSOFT_APP_ID}}`를 실제 App ID로 교체
2. 192x192 `color.png`와 32x32 `outline.png` 아이콘 준비
3. zip 패키징:
   ```bash
   cd manifest && zip -r ../claude-bot.zip . && cd ..
   ```
4. Teams → **Apps** → **Manage your apps** → **Upload a custom app** → zip 업로드
5. 봇 추가 → 1:1 채팅 시작

### Step 4: HTTPS 설정 (개발용)

Outgoing messages는 HTTPS 필수. 개발 시 ngrok 사용:

```bash
ngrok http 3978
# 출력된 https://xxxx.ngrok-free.app 을
# Azure Bot의 Messaging endpoint에 설정:
# https://xxxx.ngrok-free.app/api/messages
```

---

## Channel 모드 (stdio)

Claude Code가 봇 서버를 자식 프로세스로 spawn하여 **채널**로 사용합니다.
Teams의 1:1 채팅에서 주고받는 메시지가 Claude Code 세션에 실시간으로 전달됩니다.

### 자격증명 설정

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

또는 Claude Code 내에서:
```
/teams:configure
```

### 실행

```bash
# Claude Code 채널로 실행
claude --dangerously-load-development-channels /path/to/teams-mcp-server

# tmux로 백그라운드
tmux new-session -d -s claude \
  "claude --dangerously-load-development-channels /path/to/teams-mcp-server"
```

### 대화 타입

| 대화 타입 | 트리거 | @멘션 필요 |
|---|---|---|
| **1:1 채팅** | 메시지 전송 | 불필요 |
| **그룹 채팅** | @Claude Bot 멘션 | 필요 |
| **채널** | @Claude Bot 멘션 | 필요 |

### 동작 방식

```
Teams 채팅 → Bot Framework → CloudAdapter → MCP notification → Claude Code
Claude Code → reply tool → Proactive Message → Teams 채팅
```

---

## Tool Server 모드 (HTTP)

MCP Streamable HTTP transport로 동작합니다. Docker 배포 가능.
채널 기능(실시간 메시지 수신)은 사용할 수 없고, MCP 도구 호출만 가능합니다.

> **Azure 자격증명 불필요** — HTTP 모드에서는 Bot Framework를 사용하지 않으므로
> `MICROSOFT_APP_ID` 등의 Azure 자격증명 없이도 동작합니다.

### 실행

```bash
# 로컬 (Azure 자격증명 없이 바로 실행 가능)
bun start:http

# 또는 환경변수로
MCP_TRANSPORT=http bun start
```

### Claude Code 연결

```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

### 엔드포인트

| 경로 | 메서드 | 설명 |
|---|---|---|
| `/mcp` | POST/GET/DELETE | MCP Streamable HTTP transport |
| `/health` | GET | 헬스체크 (`{"status":"ok","mode":"http"}`) |

---

## Docker 배포

### docker-compose (권장)

```bash
# .env 파일 생성 (docker-compose가 참조)
cat > .env << 'EOF'
MICROSOFT_APP_ID=<your-app-id>
MICROSOFT_APP_PASSWORD=<your-client-secret>
MICROSOFT_APP_TENANT_ID=<your-tenant-id>
EOF

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
  -e MICROSOFT_APP_ID=<app-id> \
  -e MICROSOFT_APP_PASSWORD=<password> \
  -e MICROSOFT_APP_TENANT_ID=<tenant-id> \
  -e MCP_TRANSPORT=http \
  teams-mcp-server
```

### Claude Code에서 Docker 컨테이너에 연결

```bash
claude mcp add --transport http teams http://localhost:3978/mcp
```

---

## 접근 제어

자세한 내용은 [ACCESS.md](ACCESS.md) 참조.

### 정책 설정

```
/teams:access policy pairing    # 미등록 사용자에게 pairing 코드 발급 (추천)
/teams:access policy allowlist  # 등록된 사용자만 허용
/teams:access policy disabled   # 모든 메시지 거부
```

### Pairing Flow

1. 미등록 사용자가 봇에게 메시지 전송
2. 봇이 6자리 pairing 코드 응답
3. Claude Code 터미널에서:
   ```
   /teams:access pair <code>
   ```
4. 사용자가 allowlist에 추가됨

### 수동 등록

```
/teams:access allow <AAD_OBJECT_ID>
/teams:access remove <AAD_OBJECT_ID>
```

---

## 환경변수 레퍼런스

| 변수 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `MICROSOFT_APP_ID` | ✅ | - | Azure App Registration의 Application ID |
| `MICROSOFT_APP_PASSWORD` | ✅ | - | Azure App의 Client Secret |
| `MICROSOFT_APP_TENANT_ID` | ✅ | - | Azure AD Tenant ID |
| `MICROSOFT_APP_TYPE` | - | `SingleTenant` | `SingleTenant` 또는 `MultiTenant` |
| `MCP_TRANSPORT` | - | `stdio` | `stdio` (채널) 또는 `http` (도구 서버) |
| `TEAMS_PORT` | - | `3978` | HTTP 서버 포트 |
| `TEAMS_STATE_DIR` | - | `~/.claude/channels/teams` | State 파일 디렉토리 |
| `LOG_LEVEL` | - | `info` | `debug` / `info` / `warn` / `error` |

환경변수는 `~/.claude/channels/teams/.env` 파일에 저장하거나, 시스템 환경변수로 설정할 수 있습니다.
CLI 인자도 지원: `bun start --transport http`

---

## Skills

| Skill | 설명 |
|---|---|
| `/teams:configure` | Azure 자격증명 설정, 현재 상태 확인 |
| `/teams:access` | 접근 제어 관리 (pair, allow, remove, policy) |

---

## 트러블슈팅

### 서버가 시작 직후 종료됨

stdio 모드에서 Claude Code 외부에서 직접 실행하면 stdin EOF로 즉시 종료됩니다.
```bash
# 개발 테스트 시 stdin을 열어두려면:
(sleep 300) | bun start
```

### "MICROSOFT_APP_ID is required" 에러

자격증명이 설정되지 않았습니다. `/teams:configure`를 실행하거나 `.env` 파일을 확인하세요.

### Docker에서 state가 유지되지 않음

`docker-compose.yml`에 볼륨이 설정되어 있는지 확인:
```yaml
volumes:
  - teams-state:/root/.claude/channels/teams
```

### Teams에서 봇이 응답하지 않음

1. Azure Bot의 Messaging endpoint가 올바른지 확인
2. ngrok이 실행 중인지 확인
3. `LOG_LEVEL=debug`로 설정하여 로그 확인

### MCP HTTP 연결 실패

```bash
# 서버가 http 모드로 실행 중인지 확인
curl http://localhost:3978/health
# {"status":"ok","mode":"http"} 이 반환되어야 함
```
