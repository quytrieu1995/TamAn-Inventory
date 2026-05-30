BEGIN;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  idempotency_key TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (idempotency_key, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_created_at
  ON idempotency_keys (created_at);

COMMIT;
