-- Create donations table for public donations via IntaSend
CREATE TABLE IF NOT EXISTS donations (
  id TEXT PRIMARY KEY,
  intasend_tracking_id TEXT UNIQUE,
  request_reference_id TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'KES' NOT NULL,
  donor_name TEXT NOT NULL,
  donor_email TEXT,
  status TEXT DEFAULT 'pending' NOT NULL,
  initiated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
  completed_at INTEGER,
  failure_reason TEXT,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS donations_status_idx ON donations(status);
CREATE INDEX IF NOT EXISTS donations_initiated_at_idx ON donations(initiated_at);
