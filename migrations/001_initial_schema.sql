-- Migration 001: Initial Schema

CREATE TABLE posts (
    id BIGINT PRIMARY KEY,
    raw_data JSONB NOT NULL,
    is_processed BOOLEAN DEFAULT FALSE,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A more flexible state table for managing multiple jobs
CREATE TABLE schedule_state (
    job_name TEXT PRIMARY KEY,
    state JSONB NOT NULL,
    last_run_at TIMESTAMPTZ
);

-- Seed the initial states for our two sync jobs
INSERT INTO schedule_state (job_name, state)
VALUES
    ('backfill-all', '{"current_page": 1, "retries": 0, "is_active": true}'),
    ('sync-recent', '{"current_page": 1, "retries": 0}');

-- Other tables like `tags`, `post_tags`, `likes` from previous plans go here.
