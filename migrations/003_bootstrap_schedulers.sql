CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Start the one-time backfill task. It will run once, then manage its own lifecycle.
SELECT cron.schedule('backfill-all', '59 seconds', 'SELECT task_backfill_all_posts()');

-- 2. Start the recurring task for recent posts.
-- To sync 30 pages per day, we need to run it every 48 minutes (1440 / 30 = 48).
SELECT cron.schedule('sync-recent', '*/48 * * * *', 'SELECT task_sync_recent_posts()');
