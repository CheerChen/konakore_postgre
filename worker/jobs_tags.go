package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func (w *Worker) runTagsScheduler(ctx context.Context) {
	taskID := "sync-tags"
	def := taskDef(taskID)
	if w.shouldRunInitialTags(ctx) {
		w.runTagsOnce(ctx)
	}
	next := time.Now().UTC().Add(w.cfg.TagsInterval)
	_ = w.store.UpdateTask(ctx, TaskSnapshot{
		ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
		Status: "scheduled", DesiredStatus: "running", ProgressPct: 100,
		CurrentValue: int64Ptr(1), TotalValue: int64Ptr(1), Unit: "runs",
		State:  map[string]any{"current_step": "waiting_for_next_run"},
		Config: def.Config, NextRunAt: &next,
	})
	for {
		if !sleepContext(ctx, time.Until(next)) {
			w.markTaskStopped(context.Background(), def, "running", "", "context_cancelled")
			return
		}
		w.runTagsOnce(ctx)
		next = time.Now().UTC().Add(w.cfg.TagsInterval)
		_ = w.store.UpdateTask(ctx, TaskSnapshot{
			ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
			Status: "scheduled", DesiredStatus: "running", ProgressPct: 100,
			CurrentValue: int64Ptr(1), TotalValue: int64Ptr(1), Unit: "runs",
			State:  map[string]any{"current_step": "waiting_for_next_run"},
			Config: def.Config, NextRunAt: &next,
		})
	}
}

func (w *Worker) shouldRunInitialTags(ctx context.Context) bool {
	state, err := w.store.GetScheduleState(ctx, "sync-tags")
	if err != nil {
		w.log.Error("failed to read sync-tags state", "event", "schedule_state_read_failed", "task", "sync-tags", "error", err)
		return true
	}
	last := asFloat64(state["last_completed_at"])
	if last == 0 {
		return true
	}
	return time.Since(time.Unix(int64(last), 0)) >= w.cfg.TagsInterval
}

func (w *Worker) runTagsOnce(ctx context.Context) {
	taskID := "sync-tags"
	def := taskDef(taskID)
	runID := runID()
	log := w.log.With("task", taskID, "run_id", runID)
	startedAt := time.Now().UTC()

	_ = w.store.UpdateTask(ctx, TaskSnapshot{
		ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
		Status: "running", DesiredStatus: "running", ProgressPct: 0,
		CurrentValue: int64Ptr(0), Unit: "tags",
		State:  map[string]any{"run_id": runID, "current_step": "fetching remote tags"},
		Config: def.Config, StartedAt: &startedAt, LastRunAt: &startedAt,
	})

	tags, err := w.fetchAllTags(ctx)
	if err != nil {
		w.markTaskError(ctx, def, "running", runID, "fetch_tags", err)
		return
	}
	total := int64(len(tags))
	log.Info("remote tags fetched", "event", "remote_fetch_complete", "count", total)

	newCount := int64(0)
	updatedCount := int64(0)
	for i, tag := range tags {
		created, updated, err := w.upsertTag(ctx, tag)
		if err != nil {
			w.markTaskError(ctx, def, "running", runID, "upsert_tag", err)
			return
		}
		if created {
			newCount++
		}
		if updated {
			updatedCount++
		}
		current := int64(i + 1)
		if current%1000 == 0 || current == total {
			now := time.Now().UTC()
			_ = w.store.UpdateTask(ctx, TaskSnapshot{
				ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
				Status: "running", DesiredStatus: "running", ProgressPct: percent(current, total),
				CurrentValue: int64Ptr(current), TotalValue: int64Ptr(total), Unit: "tags",
				State: map[string]any{
					"run_id": runID, "current_step": "upserting tags",
					"new_count": newCount, "updated_count": updatedCount,
				},
				Config: def.Config, StartedAt: &startedAt, LastRunAt: &now,
			})
		}
	}

	completedAt := time.Now().UTC()
	state, _ := w.store.GetScheduleState(ctx, taskID)
	state["last_sync_count"] = float64(total)
	state["last_sync_new"] = float64(newCount)
	state["last_sync_updated"] = float64(updatedCount)
	state["last_completed_at"] = float64(completedAt.Unix())
	_ = w.store.UpdateScheduleState(ctx, taskID, state)

	_ = w.store.UpdateTask(ctx, TaskSnapshot{
		ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
		Status: "completed", DesiredStatus: "running", ProgressPct: 100,
		CurrentValue: int64Ptr(total), TotalValue: int64Ptr(total), Unit: "tags",
		State: map[string]any{
			"run_id": runID, "current_step": "completed",
			"new_count": newCount, "updated_count": updatedCount,
		},
		Config: def.Config, StartedAt: &startedAt, CompletedAt: &completedAt, LastRunAt: &completedAt,
	})
	log.Info("tags sync completed", "event", "task_complete", "total", total, "new_count", newCount, "updated_count", updatedCount)
}

func (w *Worker) fetchAllTags(ctx context.Context) ([]map[string]any, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://konachan.net/tag.json?limit=0", nil)
	if err != nil {
		return nil, err
	}
	resp, err := w.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("remote status %d", resp.StatusCode)
	}
	decoder := json.NewDecoder(resp.Body)
	decoder.UseNumber()
	var tags []map[string]any
	if err := decoder.Decode(&tags); err != nil {
		return nil, err
	}
	return tags, nil
}

func (w *Worker) upsertTag(ctx context.Context, tag map[string]any) (bool, bool, error) {
	id := asInt64(tag["id"])
	name := asString(tag["name"])
	count := asInt64(tag["count"])
	tagType := asInt64(tag["type"])
	ambiguous := asBool(tag["ambiguous"])
	if id == 0 || name == "" {
		return false, false, nil
	}

	var existingName string
	var existingCount int64
	var existingType int64
	var existingAmbiguous bool
	err := w.db.QueryRowContext(ctx,
		`SELECT name, count, type, ambiguous FROM tags WHERE id = $1`, id).
		Scan(&existingName, &existingCount, &existingType, &existingAmbiguous)
	if err == sql.ErrNoRows {
		_, err = w.db.ExecContext(ctx,
			`INSERT INTO tags (id, name, count, type, ambiguous, last_synced_at)
			 VALUES ($1, $2, $3, $4, $5, NOW())`,
			id, name, count, tagType, ambiguous)
		return err == nil, false, err
	}
	if err != nil {
		return false, false, err
	}
	if existingName == name && existingCount == count && existingType == tagType && existingAmbiguous == ambiguous {
		return false, false, nil
	}
	_, err = w.db.ExecContext(ctx,
		`UPDATE tags SET name = $2, count = $3, type = $4, ambiguous = $5, last_synced_at = NOW()
		 WHERE id = $1`,
		id, name, count, tagType, ambiguous)
	return false, err == nil, err
}
