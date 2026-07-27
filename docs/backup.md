# 백업 전략

## Google Drive만으로는 "외부 백업"이 아닙니다

이 앱의 원본 파일 저장소는 Google Drive입니다. 하지만 삭제된 파일을 같은 Drive 안의 `Deleted` 폴더로 옮기는 것은 **완전한 외부 백업이 아닙니다**:

- Drive 계정 자체가 정지/삭제되거나, 서비스 계정 권한이 잘못 회수되면 원본과 "백업"이 동시에 사라집니다.
- 사람의 실수(폴더 전체 삭제, 권한 변경)나 Google 쪽 장애가 원본과 사본 모두에 영향을 줄 수 있습니다.
- 랜섬웨어형 계정 탈취 시나리오에서도 동일 계정 내 이동은 보호가 되지 않습니다.

## 이번 구현의 계층

1. **기본: Google Drive 원본 보관**
   `Team Handoff App/Attachments`에 실제 파일이 저장됩니다.
2. **삭제 시 즉시 영구 삭제 안 함**
   첨부파일을 지우면 D1에서는 소프트 삭제(`is_deleted=1`)되고, Drive 쪽 원본은 `Deleted` 폴더로 이동만 됩니다(`worker/routes/attachments.ts`). 실수로 지운 파일은 Drive에서 직접 복구할 수 있습니다.
3. **Archive 폴더**
   팀 폴더 구조에 `Archive`가 함께 생성됩니다. 버전 관리가 필요한 팀은 새 버전을 올릴 때 이전 원본을 수동으로 `Archive`로 옮기는 절차를 팀 규칙으로 정하는 것을 권장합니다(현재 자동화되어 있지 않음).
4. **D1 메타데이터 export**
   D1은 Cloudflare 대시보드 또는 `wrangler d1 export team_handoff_db --remote --output backup.sql` 명령으로 정기적으로 export할 수 있습니다. 이 SQL 백업에는 실제 파일 바이트는 없고(설계상 D1에는 파일을 저장하지 않음) 메타데이터만 들어있습니다.
5. **선택: Cloudflare R2 비공개 백업 (`ENABLE_R2_BACKUP=true`)**
   활성화하면 업로드 시점에 Drive 업로드와 **동시에** (같은 스트림을 `tee()`로 나눠) R2에도 원본 사본이 저장됩니다(`worker/lib/uploadPipeline.ts`). R2 버킷은 **비공개**이며 공개 버킷으로 전환하면 안 됩니다. R2 저장 실패는 업로드 자체를 실패시키지 않고 활동 로그에만 기록됩니다(Drive가 진실의 원천이므로).
   - 기본값은 `false`이며, 연결하지 않아도 앱 전체가 정상 동작합니다.
   - Cloudflare R2는 저장 용량 기준으로만 과금되고 egress가 무료라, 계속 늘어나는 첨부파일 볼륨에도 비용이 완만하게 증가합니다.

## 권장 운영 절차

- R2 백업을 켜두면 Drive 계정 문제가 생겨도 최근 업로드분은 R2에서 복구할 수 있습니다.
- 최소 월 1회 `wrangler d1 export`로 D1 스냅샷을 팀 외부(로컬, 다른 클라우드 스토리지 등)에 보관하세요.
- Google Workspace를 쓴다면 Workspace 자체의 데이터 내보내기(Google Vault 등) 정책도 함께 검토하세요.
