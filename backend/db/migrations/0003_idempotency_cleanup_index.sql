BEGIN;

CREATE INDEX IF NOT EXISTS idx_idempotency_completed_at
  ON idempotency_keys (completed_at);

CREATE INDEX IF NOT EXISTS idx_idempotency_created_at_cleanup
  ON idempotency_keys (created_at);

COMMIT;
