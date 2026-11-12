CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,          -- ms since epoch
  message TEXT NOT NULL,
  contact TEXT NOT NULL DEFAULT '',     -- never published
  page TEXT NOT NULL DEFAULT '',        -- site path the feedback was sent from
  ua TEXT NOT NULL DEFAULT '',
  ip_hash TEXT NOT NULL DEFAULT '',
  images TEXT NOT NULL DEFAULT '[]',    -- JSON [{key,type,size}]
  status TEXT NOT NULL DEFAULT 'new',   -- new | done
  issue_number INTEGER,
  issue_url TEXT,
  synced_at INTEGER
);
CREATE INDEX IF NOT EXISTS feedback_created ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_ip ON feedback (ip_hash, created_at);
