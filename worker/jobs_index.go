package main

import (
	"context"
	"strings"
	"time"

	"github.com/lib/pq"
)

func (w *Worker) runPostTags(ctx context.Context) {
	taskID := "post-tags"
	def := taskDef(taskID)
	runID := runID()
	log := w.log.With("task", taskID, "run_id", runID)
	startedAt := time.Now().UTC()
	processedTotal := int64(0)
	idle := 0

	for {
		select {
		case <-ctx.Done():
			w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
			return
		default:
		}

		remaining, err := w.countUnprocessedPosts(ctx)
		if err != nil {
			w.markTaskError(ctx, def, "running", runID, "count_unprocessed_posts", err)
			return
		}
		total := processedTotal + remaining
		current := processedTotal
		if remaining == 0 {
			current = total
		}

		processed, candidates, err := w.processPostTagsBatch(ctx, w.cfg.PostTagsBatchSize)
		if err != nil {
			w.markTaskError(ctx, def, "running", runID, "process_post_tags_batch", err)
			return
		}
		processedTotal += int64(processed)
		now := time.Now().UTC()
		if processed > 0 {
			idle = 0
			log.Info("post-tags batch processed", "event", "batch_complete", "processed", processed, "candidates", candidates, "remaining", remaining)
			_ = w.store.UpdateTask(ctx, TaskSnapshot{
				ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
				Status: "running", DesiredStatus: "running", ProgressPct: percent(processedTotal, total),
				CurrentValue: int64Ptr(processedTotal), TotalValue: int64Ptr(total), Unit: "posts",
				State: map[string]any{
					"run_id": runID, "current_step": "processing",
					"last_batch_processed": processed, "last_batch_candidates": candidates,
					"remaining_count": remaining,
				},
				Config: def.Config, StartedAt: &startedAt, LastRunAt: &now,
			})
			if !sleepContext(ctx, 2*time.Second) {
				w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
				return
			}
			continue
		}

		idle++
		sleep := time.Duration(30*(1<<min(idle, 7))) * time.Second
		if sleep > time.Hour {
			sleep = time.Hour
		}
		progress := 100.0
		if total > 0 && current < total {
			progress = percent(current, total)
		}
		_ = w.store.UpdateTask(ctx, TaskSnapshot{
			ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
			Status: "running", DesiredStatus: "running", ProgressPct: progress,
			CurrentValue: int64Ptr(current), TotalValue: int64Ptr(total), Unit: "posts",
			State: map[string]any{
				"run_id": runID, "current_step": "idle_wait",
				"idle_count": idle, "sleep_seconds": int(sleep.Seconds()),
				"remaining_count": remaining, "last_batch_candidates": candidates,
			},
			Config: def.Config, StartedAt: &startedAt, LastRunAt: &now,
		})
		log.Info("post-tags idle", "event", "idle_wait", "idle_count", idle, "sleep_seconds", int(sleep.Seconds()), "remaining", remaining)
		if !sleepContext(ctx, sleep) {
			w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
			return
		}
	}
}

func (w *Worker) countUnprocessedPosts(ctx context.Context) (int64, error) {
	var count int64
	err := w.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM posts WHERE is_processed = FALSE`).Scan(&count)
	return count, err
}

func (w *Worker) processPostTagsBatch(ctx context.Context, limit int) (processedCount int, candidateCount int, err error) {
	type postRow struct {
		ID  int64
		Raw map[string]any
	}
	rows, err := w.db.QueryContext(ctx,
		`SELECT id, raw_data FROM posts WHERE is_processed = FALSE ORDER BY id LIMIT $1`, limit)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	var posts []postRow
	globalNames := make([]string, 0)
	seen := map[string]bool{}
	for rows.Next() {
		var id int64
		var rawBytes []byte
		if err := rows.Scan(&id, &rawBytes); err != nil {
			return 0, 0, err
		}
		raw := decodeJSON(rawBytes)
		posts = append(posts, postRow{ID: id, Raw: raw})
		tags := stringsFromTags(raw)
		for _, name := range tags {
			if !seen[name] {
				seen[name] = true
				globalNames = append(globalNames, name)
			}
		}
	}
	if err := rows.Err(); err != nil {
		return 0, 0, err
	}
	if len(posts) == 0 || len(globalNames) == 0 {
		return 0, len(posts), nil
	}

	tagRows, err := w.db.QueryContext(ctx,
		`SELECT id, name FROM tags WHERE name = ANY($1)`, pq.Array(globalNames))
	if err != nil {
		return 0, len(posts), err
	}
	defer tagRows.Close()

	nameToID := map[string]int64{}
	for tagRows.Next() {
		var id int64
		var name string
		if err := tagRows.Scan(&id, &name); err != nil {
			return 0, len(posts), err
		}
		nameToID[name] = id
	}
	if err := tagRows.Err(); err != nil {
		return 0, len(posts), err
	}

	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, len(posts), err
	}
	defer tx.Rollback()

	for _, post := range posts {
		tags := stringsFromTags(post.Raw)
		if len(tags) == 0 {
			continue
		}
		allFound := true
		for _, name := range tags {
			if _, ok := nameToID[name]; !ok {
				allFound = false
				break
			}
		}
		if !allFound {
			continue
		}
		for _, name := range tags {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO post_tags (post_id, tag_id, created_at)
				 VALUES ($1, $2, NOW())
				 ON CONFLICT (post_id, tag_id) DO NOTHING`,
				post.ID, nameToID[name]); err != nil {
				return 0, len(posts), err
			}
		}
		if _, err := tx.ExecContext(ctx,
			`UPDATE posts SET is_processed = TRUE WHERE id = $1`, post.ID); err != nil {
			return 0, len(posts), err
		}
		processedCount++
	}
	if err := tx.Commit(); err != nil {
		return 0, len(posts), err
	}
	return processedCount, len(posts), nil
}

func stringsFromTags(raw map[string]any) []string {
	tagString := asString(raw["tags"])
	if tagString == "" {
		tagString = asString(raw["tag_string"])
	}
	return strings.Fields(tagString)
}

func (w *Worker) runLikesMigration(ctx context.Context) {
	taskID := "likes-migration"
	def := taskDef(taskID)
	runID := runID()
	log := w.log.With("task", taskID, "run_id", runID)
	startedAt := time.Now().UTC()

	exists, err := tableExists(ctx, w.db, "likes")
	if err != nil {
		w.markTaskError(ctx, def, "running", runID, "check_likes_table", err)
		return
	}
	if !exists {
		now := time.Now().UTC()
		_ = w.store.UpdateTask(ctx, TaskSnapshot{
			ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
			Status: "completed", DesiredStatus: "stopped", ProgressPct: 100,
			CurrentValue: int64Ptr(0), TotalValue: int64Ptr(0), Unit: "likes",
			State:  map[string]any{"run_id": runID, "current_step": "skipped", "reason": "likes_table_missing"},
			Config: def.Config, StartedAt: &startedAt, CompletedAt: &now, LastRunAt: &now,
		})
		log.Info("likes migration skipped", "event", "task_skip", "reason", "likes_table_missing")
		return
	}

	total, err := w.countLegacyLikes(ctx)
	if err != nil {
		w.markTaskError(ctx, def, "running", runID, "count_legacy_likes", err)
		return
	}
	processedTotal := int64(0)
	idle := 0

	for {
		select {
		case <-ctx.Done():
			w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
			return
		default:
		}

		processed, err := w.processLikesBatch(ctx, w.cfg.LikesBatchSize)
		if err != nil {
			w.markTaskError(ctx, def, "running", runID, "process_likes_batch", err)
			return
		}
		now := time.Now().UTC()
		if processed > 0 {
			processedTotal += int64(processed)
			idle = 0
			_ = w.store.UpdateTask(ctx, TaskSnapshot{
				ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
				Status: "running", DesiredStatus: "running", ProgressPct: percent(processedTotal, total),
				CurrentValue: int64Ptr(processedTotal), TotalValue: int64Ptr(total), Unit: "likes",
				State:  map[string]any{"run_id": runID, "current_step": "processing", "last_batch_processed": processed},
				Config: def.Config, StartedAt: &startedAt, LastRunAt: &now,
			})
			log.Info("likes batch processed", "event", "batch_complete", "processed", processed, "processed_total", processedTotal, "total", total)
			if !sleepContext(ctx, 2*time.Second) {
				w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
				return
			}
			continue
		}

		remaining, err := w.countLegacyLikes(ctx)
		if err != nil {
			w.markTaskError(ctx, def, "running", runID, "count_legacy_likes", err)
			return
		}
		if remaining == 0 {
			completedAt := time.Now().UTC()
			_ = w.store.UpdateTask(ctx, TaskSnapshot{
				ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
				Status: "completed", DesiredStatus: "stopped", ProgressPct: 100,
				CurrentValue: int64Ptr(total), TotalValue: int64Ptr(total), Unit: "likes",
				State:  map[string]any{"run_id": runID, "current_step": "completed"},
				Config: def.Config, StartedAt: &startedAt, CompletedAt: &completedAt, LastRunAt: &completedAt,
			})
			log.Info("likes migration completed", "event", "task_complete", "total", total)
			return
		}

		idle++
		sleep := time.Duration(30*(1<<min(idle, 7))) * time.Second
		if sleep > time.Hour {
			sleep = time.Hour
		}
		_ = w.store.UpdateTask(ctx, TaskSnapshot{
			ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
			Status: "running", DesiredStatus: "running", ProgressPct: percent(processedTotal, total),
			CurrentValue: int64Ptr(processedTotal), TotalValue: int64Ptr(total), Unit: "likes",
			State: map[string]any{
				"run_id": runID, "current_step": "idle_wait",
				"idle_count": idle, "sleep_seconds": int(sleep.Seconds()), "remaining_count": remaining,
			},
			Config: def.Config, StartedAt: &startedAt, LastRunAt: &now,
		})
		log.Info("likes migration idle", "event", "idle_wait", "remaining", remaining, "sleep_seconds", int(sleep.Seconds()))
		if !sleepContext(ctx, sleep) {
			w.markTaskStopped(context.Background(), def, "running", runID, "context_cancelled")
			return
		}
	}
}

func (w *Worker) countLegacyLikes(ctx context.Context) (int64, error) {
	var count int64
	err := w.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM likes`).Scan(&count)
	return count, err
}

func (w *Worker) processLikesBatch(ctx context.Context, limit int) (int, error) {
	rows, err := w.db.QueryContext(ctx, `SELECT id FROM likes ORDER BY id DESC LIMIT $1`, limit)
	if err != nil {
		return 0, err
	}
	defer rows.Close()

	likeIDs := make([]int64, 0, limit)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return 0, err
		}
		likeIDs = append(likeIDs, id)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}
	if len(likeIDs) == 0 {
		return 0, nil
	}

	postRows, err := w.db.QueryContext(ctx,
		`SELECT id FROM posts WHERE id = ANY($1)`, pq.Array(likeIDs))
	if err != nil {
		return 0, err
	}
	defer postRows.Close()

	existing := map[int64]bool{}
	for postRows.Next() {
		var id int64
		if err := postRows.Scan(&id); err != nil {
			return 0, err
		}
		existing[id] = true
	}
	if err := postRows.Err(); err != nil {
		return 0, err
	}
	if len(existing) == 0 {
		return 0, nil
	}

	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	processed := 0
	for _, id := range likeIDs {
		if !existing[id] {
			continue
		}
		res, err := tx.ExecContext(ctx,
			`UPDATE posts SET is_liked = TRUE WHERE id = $1`, id)
		if err != nil {
			return 0, err
		}
		affected, _ := res.RowsAffected()
		if affected > 0 {
			if _, err := tx.ExecContext(ctx, `DELETE FROM likes WHERE id = $1`, id); err != nil {
				return 0, err
			}
			processed++
		}
	}
	if err := tx.Commit(); err != nil {
		return 0, err
	}
	return processed, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
