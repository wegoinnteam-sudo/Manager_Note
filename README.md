# 팀 인수인계 노트 (Team Handoff Notes)

Notion과 비슷한 화면에서 팀 인수인계 문서를 작성하고, 파일을 첨부·공유·미리보기하는 소규모 팀용 내부 웹앱입니다.

- **프론트엔드/백엔드**: 하나의 Cloudflare Worker에서 React 정적 파일과 REST API를 함께 서빙
- **메타데이터**: Cloudflare D1 (SQLite)
- **원본 파일 저장소**: Google Drive (팀 공유 폴더, 서비스 계정으로 접근)
- **선택적 백업**: Cloudflare R2 (비공개, 기본 비활성화)
- **인증**: Google 로그인 + 서버 세션(HttpOnly 쿠키), 역할(admin/editor/viewer)은 서버에서 매 요청마다 재검증

> 데모/시드 데이터는 `seed/seed.sql`에만 있고, 로컬 `--local` D1에만 수동으로 넣을 수 있습니다. 운영 배포 시 자동 삽입되지 않습니다. `DEMO_MODE=true`일 때만 데모 데이터를 사용한다는 전제이며, 실제 데이터는 항상 D1 + Google Drive를 통해 저장됩니다(새로고침해도 사라지지 않음, `URL.createObjectURL()`에만 의존하는 미리보기 없음).

## 아키텍처 원칙

Google Drive는 관계형 DB처럼 쓰지 않습니다.

- **Cloudflare D1**: 사용자, 팀, 페이지, 페이지 본문, 파일 메타데이터(Drive `fileId`/이름/MIME/크기/checksum), 댓글, 상태 변경 이력, 활동 로그, Drive 동기화 상태/로그.
- **Google Drive**: 실제 파일 바이트(PDF/Excel/Word/HWP/이미지 등)만 저장.

자세한 구조는 `migrations/0001_init.sql`을 참고하세요.

## 프로젝트 구조

```
worker/           Cloudflare Worker API (Hono)
  routes/         REST 엔드포인트
  db/             D1 쿼리 레이어 (파라미터 바인딩)
  drive/          Google Drive 클라이언트, 동기화 로직
  middleware/     세션/RBAC/CSRF/레이트리밋/보안헤더
  lib/            검증(zod), DTO 변환, 업로드 보상 파이프라인
  tests/          워커 로직 테스트 (node:sqlite 기반 fake D1)
src/              React 프론트엔드 (Vite + TS)
  features/       사이드바, 페이지뷰, 에디터, 파일, 미리보기, 댓글, 관리자 화면
shared/types.ts   프론트-백엔드 공용 타입
migrations/       D1 마이그레이션 SQL
seed/seed.sql     로컬 전용 데모 데이터 (운영에 자동 삽입되지 않음)
docs/             운영/백업/환경 제약 문서
```

## 로컬 개발 환경

```bash
npm install
cp .dev.vars.example .dev.vars   # 값 채우기 (아래 "필요한 정보" 참고)
npm run typecheck
npm test
npm run dev:worker   # Worker + D1(local) — http://127.0.0.1:8787
npm run dev          # React 개발 서버 — http://localhost:3000 (내부적으로 /api를 8787로 프록시)
```

> ⚠️ 이 저장소를 생성한 GitHub Codespace(Ubuntu 20.04 devcontainer)는 glibc가 오래되어 `wrangler dev`, `wrangler d1 --local`, `npm run build`/`npm test`가 실패할 수 있습니다. 원인과 해결 방법은 [`docs/known-issues.md`](docs/known-issues.md)를 참고하세요. GitHub Actions CI와 Cloudflare 빌드 환경은 이 문제가 없습니다.

## 필요한 정보 (실제 연결 전 체크리스트)

민감한 값(Private Key, Client Secret, Refresh Token, Session Secret)은 코드/README/커밋에 절대 넣지 않고 `wrangler secret put` 또는 GitHub Actions Secret으로만 등록합니다.

| 변수 | 종류 | 용도 |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | 변수 | Drive API 서비스 계정 이메일 |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | **secret** | 서비스 계정 PEM 키 |
| `GOOGLE_OAUTH_CLIENT_ID` | 변수 | Google 로그인 + (대안) Drive OAuth 클라이언트 ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | **secret** | 위 클라이언트 시크릿 |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | **secret** | 서비스 계정을 못 쓸 때만 (Drive OAuth 대안 경로) |
| `GOOGLE_DRIVE_FOLDER_ID` | 변수 | 팀 공유 루트 폴더 ID |
| `GOOGLE_DRIVE_SHARED_DRIVE_ID` | 변수 | Shared Drive 사용 시에만 |
| `GOOGLE_ALLOWED_EMAILS` | 변수 | 최초 로그인이 허용되는 이메일 목록(부트스트랩용, 이후 초대는 관리자 화면에서) |
| `GOOGLE_INITIAL_ADMIN_EMAILS` | 변수 | 최초 로그인 시 관리자로 지정될 이메일 |
| `OAUTH_REDIRECT_BASE_URL` | 변수 | 예: `https://your-worker.example.workers.dev` (뒤에 `/api/auth/google/callback`이 붙음) |
| `SESSION_SECRET` | **secret** | 세션 쿠키 서명용 무작위 문자열 |
| `MAX_UPLOAD_MB` | 변수 | 업로드 파일 크기 제한 (기본 50) |
| `ENABLE_R2_BACKUP` | 변수 | R2 비공개 백업 사용 여부 (기본 true, R2 미연결 시 false로) |

로컬 개발: 위 값을 `.dev.vars`에 넣습니다(`.gitignore`에 이미 포함, 절대 커밋 금지). 배포 환경: 아래처럼 `wrangler secret put`으로 secret만 등록하고, 변수는 `wrangler.toml`의 `[vars]`에 둡니다.

```bash
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
```

## Google Cloud / Drive 설정

1. Google Cloud Console에서 프로젝트 생성 → **Google Drive API** 활성화.
2. 서비스 계정 생성 (IAM & 관리자 → 서비스 계정) → JSON 키 발급.
3. Google Drive에 팀 공유 폴더를 만들고, 그 폴더를 **서비스 계정 이메일**과 공유(편집자 권한). 이 폴더 ID를 `GOOGLE_DRIVE_FOLDER_ID`로 사용합니다.
4. Workspace의 Shared Drive를 쓴다면 Shared Drive ID를 `GOOGLE_DRIVE_SHARED_DRIVE_ID`에 설정하고, 서비스 계정을 Shared Drive 멤버로 추가합니다.
5. 앱이 처음 파일을 다루면 `Pages / Attachments / Archive / Deleted / Backup` 하위 폴더를 자동 생성합니다 (`worker/drive/folders.ts`).
6. **Google 로그인용 OAuth 클라이언트**(웹 애플리케이션 유형)를 별도로 만들고, 승인된 리디렉션 URI에 `${OAUTH_REDIRECT_BASE_URL}/api/auth/google/callback`을 등록합니다.
7. 서비스 계정 방식이 조직 정책상 막혀 있다면 OAuth + refresh token 방식(`GOOGLE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN`)으로 대체할 수 있습니다 — 이 경우 해당 OAuth 계정 소유자 개인 Drive 권한으로 API가 호출됩니다.

## Cloudflare 설정

기존 Worker/Pages 프로젝트가 있다면 새로 만들지 말고 재사용하세요.

```bash
npx wrangler d1 create team_handoff_db
# 출력된 database_id를 wrangler.toml의 [[d1_databases]] database_id에 채워 넣기

npx wrangler d1 migrations apply team_handoff_db --remote

# R2 백업을 쓴다면
npx wrangler r2 bucket create team-handoff-backup
```

`wrangler.toml`에서 확인/수정할 것:

- `[[d1_databases]] database_id` — 실제 D1 ID로 교체
- `[vars]` — 위 표의 비밀 아닌 값들
- `[triggers] crons` — Drive 동기화 주기 (기본 15분)
- 커스텀 도메인을 쓸 경우 `routes`/`workers.dev` 설정 추가

## 배포

`main` 브랜치에 push하면 `.github/workflows/deploy.yml`이 typecheck/lint/test/build 후 D1 마이그레이션 적용, `wrangler deploy`까지 수행합니다. GitHub 저장소 Secrets에 다음을 등록하세요.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Cloudflare의 Git Integration을 이미 쓰고 있다면 `deploy.yml`을 비활성화해 중복 배포를 피하세요. PR에는 `ci.yml`이 build/lint/typecheck/test만 실행합니다.

## 관리자/권한

- 최초 로그인은 `GOOGLE_ALLOWED_EMAILS`에 있는 이메일만 가능합니다(부트스트랩). `GOOGLE_INITIAL_ADMIN_EMAILS`에 있으면 최초 로그인 시 자동으로 admin이 됩니다.
- 이후 팀원 초대/권한 변경은 로그인 후 **설정 → 팀원 초대**(관리자 전용, `/api/admin/users/invite`)에서 합니다 — 재배포 없이 즉시 반영됩니다.
- 서버는 모든 API에서 세션 기반 역할을 다시 검증합니다(`worker/middleware/rbac.ts`). 프론트엔드는 버튼을 숨길 뿐, 권한 자체는 항상 서버가 최종 판단합니다.

## 파일 미리보기 지원 현황

| 형식 | 미리보기 | 비고 |
|---|---|---|
| PNG/JPG/GIF/WebP | ✅ 썸네일 + 확대 모달 | 인증된 API를 통해서만 접근 (공개 URL 없음) |
| PDF | ✅ pdf.js로 페이지 이동/확대 | |
| XLS/XLSX | ✅ SheetJS, 시트 선택, 최대 200행만 렌더링 | 전체는 다운로드 |
| DOCX | ✅ Mammoth로 HTML 변환 (DOMPurify로 살균) | |
| DOC (구버전) | ❌ | 원본 다운로드 안내만 표시 |
| HWP/HWPX | ❌ | 브라우저에서 안전하게 렌더링할 방법이 없어 정직하게 "미지원" 안내 + 원본 다운로드만 제공. 가짜 문서를 보여주지 않습니다. |

## 테스트

```bash
npm test          # 프론트(jsdom) + 워커(node:sqlite 기반 fake D1) 전체
npm run typecheck
npm run lint
```

워커 테스트는 실제 `migrations/0001_init.sql`을 SQLite에 그대로 적용해 실행되므로, Workers 런타임(workerd) 없이도 D1 쿼리 로직·업로드 보상 처리·충돌 감지·Drive 동기화 로직을 검증합니다.

## 더 읽을거리

- [`docs/known-issues.md`](docs/known-issues.md) — 이 Codespace에서 로컬 build/test가 막힐 때
- [`docs/backup.md`](docs/backup.md) — Drive만으로는 완전한 백업이 아닌 이유와 권장 백업 계층
- [`docs/ops.md`](docs/ops.md) — 무료 한도 모니터링, 비용을 낮게 유지하는 설계 포인트
