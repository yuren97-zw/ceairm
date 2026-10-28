CREATE TABLE IF NOT EXISTS attendance_approval_plans (
 id TEXT PRIMARY KEY, person_id TEXT, kind TEXT, category TEXT, state TEXT NOT NULL,
 plan_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS attendance_approval_plan_history (
 id BIGSERIAL PRIMARY KEY, instance_id TEXT NOT NULL, before_json TEXT, after_json TEXT NOT NULL,
 source TEXT NOT NULL, changed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attendance_approval_plan_queue (
 id TEXT PRIMARY KEY, generation INTEGER NOT NULL DEFAULT 1, applied_generation INTEGER NOT NULL DEFAULT 0,
 due_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, source TEXT NOT NULL, error TEXT
);
CREATE TABLE IF NOT EXISTS attendance_approval_plan_events (event_id TEXT PRIMARY KEY, marked_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS attendance_approval_plan_due (
 id TEXT PRIMARY KEY, instance_id TEXT NOT NULL, revision INTEGER NOT NULL, person_id TEXT NOT NULL,
 work_date TEXT NOT NULL, phase TEXT NOT NULL, due_at TEXT NOT NULL, run_id TEXT, status TEXT NOT NULL DEFAULT 'pending'
);
