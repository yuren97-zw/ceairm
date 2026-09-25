CREATE TABLE IF NOT EXISTS personnel_import_workspaces (
  batch_id TEXT PRIMARY KEY,
  original_rows_json TEXT NOT NULL,
  original_summary_json TEXT NOT NULL,
  history_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0
);
