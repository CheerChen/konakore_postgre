CREATE OR REPLACE FUNCTION sync_posts_from_remote(page INT DEFAULT 1, p_limit INT DEFAULT 100)
RETURNS INT AS $$ -- Returns a status code
DECLARE
    response JSONB;
    inserted_count INT := 0;
    post_item JSONB;
BEGIN
    -- The HTTP request is now inside a BEGIN/EXCEPTION block.
    BEGIN
        SELECT content INTO response
        FROM net.http_get(url := 'https://konachan.net/post.json?page=' || page || '&limit=' || p_limit);
    EXCEPTION
        WHEN OTHERS THEN
            -- If any error occurs during the HTTP request, return -1 and exit.
            RETURN -1;
    END;

    IF response IS NULL OR jsonb_array_length(response) = 0 THEN
        RETURN 0;
    END IF;

    -- ... (loop and insert logic remains the same) ...
    FOR post_item IN SELECT * FROM jsonb_array_elements(response) LOOP
        inserted_count := inserted_count + 1;
        INSERT INTO posts (id, raw_data, last_synced_at)
        VALUES ((post_item->>'id')::BIGINT, post_item, NOW())
        ON CONFLICT (id) DO UPDATE
        SET raw_data = EXCLUDED.raw_data, last_synced_at = NOW();
    END LOOP;

    RETURN inserted_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION task_backfill_all_posts()
RETURNS VOID AS $$
DECLARE
    current_page INT;
    is_active BOOLEAN;
    retries INT;
    processed_count INT;
    MAX_RETRIES CONSTANT INT := 10;
BEGIN
    SELECT
        (state->>'current_page')::INT,
        (state->>'is_active')::BOOLEAN,
        (state->>'retries')::INT
    INTO current_page, is_active, retries
    FROM schedule_state WHERE job_name = 'backfill-all';

    IF NOT is_active THEN RETURN; END IF;

    SELECT sync_posts_from_remote(current_page) INTO processed_count;

    CASE
        WHEN processed_count > 0 THEN
            -- SUCCESS: Reset retries, advance page, and schedule next run quickly.
            UPDATE schedule_state SET state = state || jsonb_build_object('current_page', current_page + 1, 'retries', 0) WHERE job_name = 'backfill-all';
            PERFORM cron.schedule('backfill-all', '10 seconds', 'SELECT task_backfill_all_posts()');

        WHEN processed_count = 0 THEN
            -- END OF DATA: Mark as inactive and unschedule permanently.
            UPDATE schedule_state SET state = state || '{"is_active": false, "final_status": "completed"}' WHERE job_name = 'backfill-all';
            PERFORM cron.unschedule('backfill-all');

        WHEN processed_count = -1 THEN
            -- FAILURE: Increment retries and decide whether to try again or give up.
            IF retries + 1 >= MAX_RETRIES THEN
                -- GIVE UP: Max retries reached. Mark as inactive and stop.
                UPDATE schedule_state SET state = state || '{"is_active": false, "final_status": "failed"}' WHERE job_name = 'backfill-all';
                PERFORM cron.unschedule('backfill-all');
            ELSE
                -- RETRY: Increment retry counter and schedule for a later attempt (e.g., 5 minutes).
                UPDATE schedule_state SET state = state || jsonb_build_object('retries', retries + 1) WHERE job_name = 'backfill-all';
                PERFORM cron.schedule('backfill-all', '5 minutes', 'SELECT task_backfill_all_posts()');
            END IF;
    END CASE;

    UPDATE schedule_state SET last_run_at = NOW() WHERE job_name = 'backfill-all';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION task_sync_recent_posts()
RETURNS VOID AS $$
DECLARE
    current_page INT;
    next_page INT;
    retries INT;
    processed_count INT;
    MAX_RETRIES CONSTANT INT := 5; -- A lower retry count for the frequent job
BEGIN
    SELECT
        (state->>'current_page')::INT,
        (state->>'retries')::INT
    INTO current_page, retries
    FROM schedule_state WHERE job_name = 'sync-recent';

    SELECT sync_posts_from_remote(current_page) INTO processed_count;

    CASE
        WHEN processed_count > 0 THEN
            -- SUCCESS: Reset retries, calculate the next page.
            next_page := (current_page % 30) + 1;
            UPDATE schedule_state
            SET state = jsonb_build_object('current_page', next_page, 'retries', 0),
                last_run_at = NOW()
            WHERE job_name = 'sync-recent';

        WHEN processed_count = 0 THEN
            -- EMPTY RESPONSE: This is unexpected for recent pages, but we'll treat it as a success and cycle to the next page.
            next_page := (current_page % 30) + 1;
            UPDATE schedule_state
            SET state = jsonb_build_object('current_page', next_page, 'retries', 0),
                last_run_at = NOW()
            WHERE job_name = 'sync-recent';

        WHEN processed_count = -1 THEN
            -- FAILURE: Increment retries or give up.
            IF retries + 1 >= MAX_RETRIES THEN
                -- GIVE UP for this cycle: Reset retries and move to the next page to avoid getting stuck.
                next_page := (current_page % 30) + 1;
                UPDATE schedule_state
                SET state = jsonb_build_object('current_page', next_page, 'retries', 0),
                    last_run_at = NOW()
                WHERE job_name = 'sync-recent';
            ELSE
                -- RETRY: Increment retry counter. The job will run again on its normal schedule.
                UPDATE schedule_state
                SET state = state || jsonb_build_object('retries', retries + 1),
                    last_run_at = NOW()
                WHERE job_name = 'sync-recent';
            END IF;
    END CASE;
END;
$$ LANGUAGE plpgsql;
