# 알려진 환경 제약

## 이 GitHub Codespace(Ubuntu 20.04 / glibc 2.31)에서 로컬 실행이 막히는 경우

Cloudflare의 `workerd`(Wrangler가 사용하는 로컬 Workers 런타임)와 Vite/Vitest가 사용하는 `@rollup/rollup-linux-x64-gnu` 네이티브 바이너리는 **glibc 2.32 이상**을 요구합니다. 이 devcontainer의 기본 이미지는 Ubuntu 20.04(glibc 2.31)라서 다음 명령이 실패할 수 있습니다.

- `wrangler dev`
- `wrangler d1 migrations apply --local`
- `npm run build` / `npm test` (Vite/Vitest의 Rollup 네이티브 바이너리 로딩 실패)

에러 메시지 예:

```
/lib/x86_64-linux-gnu/libc.so.6: version `GLIBC_2.32' not found
```

### 해결 방법

**방법 A — devcontainer 이미지 업그레이드 (권장, 가장 확실함)**

`.devcontainer/devcontainer.json`의 base image를 Ubuntu 22.04 이상 기반으로 바꾸고 Codespace를 Rebuild Container 하면 `workerd`와 Rollup 네이티브 바이너리가 모두 정상 동작합니다. `wrangler dev`까지 포함한 전체 로컬 개발 루프가 필요하다면 이 방법이 유일하게 완전한 해결책입니다.

**방법 B — 이 세션에서 build/test만 임시로 우회 (workerd 문제는 해결 안 됨)**

Rollup에는 WASM으로 빌드된 대체 패키지가 있습니다. 로컬에서만 임시로 적용하려면:

```bash
npm install rollup@npm:@rollup/wasm-node --no-save
npm run build
npm test
```

`--no-save`이므로 `package.json`은 그대로 유지되고, 다음 `npm install`에서 원래 상태로 돌아갑니다. 이 방법은 `npm run build`/`npm test`(Vite/Vitest)만 해결하며, `wrangler dev`/`wrangler d1 --local`이 필요로 하는 `workerd`는 여전히 동작하지 않습니다.

**방법 C — CI/Cloudflare에 맡기기**

GitHub Actions(`ubuntu-latest`)와 Cloudflare의 빌드 인프라는 모두 최신 glibc를 사용하므로 이 문제가 발생하지 않습니다. 이 Codespace에서는 코드 작성과 `tsc --noEmit` 타입체크까지만 하고, 실제 build/test/deploy 검증은 PR을 열어 CI가 대신하게 하는 것도 실용적인 선택입니다.

### 이번 구현에서 실제로 검증한 범위

- `tsc --noEmit` (frontend + worker): 이 Codespace에서 정상 통과 확인.
- `npm run build`, `npm test`: 방법 B로 1회 검증 후 원복(커밋에는 override 없음). CI에서 매 PR/push마다 자동 재검증됨.
- Worker 쪽 DB/업로드-보상/Drive 동기화 로직 테스트는 `workerd` 없이도 실행되도록 `node:sqlite` 기반의 실제 SQLite 백엔드 fake D1(`worker/tests/helpers/fakeD1.ts`)으로 작성되어, 이 환경에서도 항상 실행 가능합니다.
