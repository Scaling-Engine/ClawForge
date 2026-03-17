CREATE TABLE IF NOT EXISTS terminal_sessions (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  repo_slug TEXT,
  volume_name TEXT,
  cwd_path TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  thinking_enabled INTEGER NOT NULL DEFAULT 0,
  shell_mode INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS terminal_costs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_usd REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_terminal_costs_session ON terminal_costs(session_id);
CREATE INDEX IF NOT EXISTS idx_terminal_sessions_chat ON terminal_sessions(chat_id);
