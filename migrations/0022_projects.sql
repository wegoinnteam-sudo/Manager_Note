CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);
CREATE INDEX projects_team ON projects(team_id, deleted_at, created_at);

CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL,
  completed_by TEXT,
  completed_at TEXT,
  deleted_at TEXT
);
CREATE INDEX project_tasks_order ON project_tasks(project_id, deleted_at, position);

CREATE TABLE project_task_updates (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES project_tasks(id),
  author TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'note',
  photo_name TEXT,
  photo_type TEXT,
  drive_file_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX project_task_updates_task ON project_task_updates(task_id, created_at);

CREATE TRIGGER project_task_created_done AFTER INSERT ON project_tasks
WHEN NEW.completed_at IS NOT NULL
BEGIN
  INSERT INTO project_task_updates (id, task_id, author, kind, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.completed_by, 'completion', NEW.completed_at);
END;

CREATE TRIGGER project_task_marked_done AFTER UPDATE OF completed_at ON project_tasks
WHEN OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
BEGIN
  INSERT INTO project_task_updates (id, task_id, author, kind, created_at)
  VALUES (lower(hex(randomblob(16))), NEW.id, NEW.completed_by, 'completion', NEW.completed_at);
END;
