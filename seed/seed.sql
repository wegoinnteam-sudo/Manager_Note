-- DEMO / LOCAL SEED DATA ONLY.
-- This file is NEVER run automatically. It is only applied by a developer
-- explicitly running `npm run db:seed:local`, which targets the local
-- (--local) D1 simulation, never a remote/production database.
-- All rows below are fake and exist so the UI has something to render
-- during local development. The frontend shows a "데모 데이터" badge
-- whenever DEMO_MODE=true so nobody mistakes this for real data.

INSERT INTO users (id, email, name, role) VALUES
  ('demo-user-admin', 'admin@demo.local', '데모 관리자', 'admin'),
  ('demo-user-editor', 'editor@demo.local', '데모 편집자', 'editor'),
  ('demo-user-viewer', 'viewer@demo.local', '데모 열람자', 'viewer');

INSERT INTO teams (id, name, drive_folder_id) VALUES
  ('demo-team', '데모 팀', NULL);

INSERT INTO team_members (id, team_id, user_id, role) VALUES
  ('demo-member-1', 'demo-team', 'demo-user-admin', 'admin'),
  ('demo-member-2', 'demo-team', 'demo-user-editor', 'editor'),
  ('demo-member-3', 'demo-team', 'demo-user-viewer', 'viewer');

INSERT INTO pages (id, team_id, parent_id, title, status, assignee_id, created_by, updated_by, order_key) VALUES
  ('demo-page-1', 'demo-team', NULL, '[데모] 신규 팀원 온보딩 인수인계', 'handoff_pending', 'demo-user-editor', 'demo-user-admin', 'demo-user-admin', 1),
  ('demo-page-2', 'demo-team', NULL, '[데모] 월간 정산 프로세스', 'in_progress', 'demo-user-admin', 'demo-user-admin', 'demo-user-editor', 2);

INSERT INTO page_contents (page_id, content_json, updated_by) VALUES
  ('demo-page-1', '{"blocks":[{"id":"b1","type":"paragraph","text":"이 페이지는 로컬 개발용 데모 데이터입니다."}]}', 'demo-user-admin'),
  ('demo-page-2', '{"blocks":[{"id":"b1","type":"paragraph","text":"실제 운영 배포에는 이 데이터가 포함되지 않습니다."}]}', 'demo-user-editor');

INSERT INTO handoff_status_history (id, page_id, from_status, to_status, changed_by) VALUES
  ('demo-hist-1', 'demo-page-1', 'in_progress', 'handoff_pending', 'demo-user-editor');
