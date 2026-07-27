# 운영 및 비용 확인 가이드

무료 또는 최소 비용 운영을 목표로 설계되었습니다. 사용량이 무료 한도에 가까워지는지 정기적으로 아래 항목을 확인하세요.

## 확인할 대시보드

| 서비스 | 확인 위치 | 무료 한도 (2026년 기준, 변동 가능) |
|---|---|---|
| Cloudflare Workers | Cloudflare 대시보드 → Workers & Pages → 해당 Worker → Metrics | 100,000 요청/일 |
| Cloudflare D1 | 대시보드 → D1 → 해당 DB → Metrics | 5GB 저장, 500만 row read/일, 10만 row write/일 |
| Cloudflare R2 (사용 시) | 대시보드 → R2 → 버킷 → Metrics | 10GB 저장, Class A/B 오퍼레이션 별도 한도 |
| Google Drive API | Google Cloud Console → API 및 서비스 → 할당량 | 사용자/프로젝트당 일일 쿼리 한도 |
| Cloudflare Cron Triggers | 대시보드 → Workers → Triggers | Free 플랜도 지원, 실행 자체는 Workers 요청 한도에 포함 |

## 이 앱이 비용을 낮게 유지하는 방법 (코드 상 근거)

- **자동저장 debounce**: 제목 800ms, 본문 1000ms 지연 후에만 D1에 쓰기 (`src/features/pages/PageView.tsx`). 타이핑마다 요청을 보내지 않습니다.
- **Drive API 토큰 캐시**: 서비스 계정/OAuth 토큰을 Worker 아이솔레이트 단위로 메모리 캐시 (`worker/drive/auth.ts`) — 매 요청마다 새 토큰을 받지 않습니다.
- **Drive 폴더 ID 캐시**: `Pages/Attachments/Archive/Deleted/Backup` 폴더 ID를 아이솔레이트 캐시 (`worker/drive/folders.ts`).
- **증분 동기화**: 최초 1회만 전체 목록을 훑고, 이후에는 Drive Changes API 토큰으로 변경분만 조회 (`worker/drive/sync.ts`) — 동기화마다 전체 폴더를 다시 긁지 않습니다.
- **스트리밍 업/다운로드**: 첨부파일을 Worker 메모리에 통째로 올리지 않고 `ReadableStream`으로 Drive/R2에 그대로 전달 (`worker/lib/uploadPipeline.ts`, `worker/drive/client.ts`).
- **업로드 크기 제한**: `MAX_UPLOAD_MB` 환경변수로 조정 가능 (기본 50MB).
- **검색은 D1 LIKE 쿼리만 사용**: 별도 유료 검색 서비스 없음 (`worker/db/search.ts`).
- **동기화 주기**: 기본 15분 (`wrangler.toml`의 `[triggers]`). 팀 규모가 작다면 그대로 두어도 무료 한도에 여유가 큽니다.

## 무료 한도에 가까워지면

1. Cron 동기화 주기를 15분 → 30분/60분으로 늘리기 (`wrangler.toml` `crons`).
2. `MAX_UPLOAD_MB`를 낮춰 대용량 업로드를 제한.
3. D1 write가 많다면 자동저장 debounce 시간을 늘리기 (`useDebouncedCallback` 호출부).
4. R2 백업을 켜둔 경우, Archive 정책을 도입해 오래된 파일을 정기적으로 정리.
