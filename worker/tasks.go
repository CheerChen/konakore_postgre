package main

import (
	"context"
	"time"
)

var taskDefs = map[string]TaskDefinition{
	"backfill-all": {
		ID:       "backfill-all",
		Name:     "Backfill posts",
		Type:     "backfill",
		Category: "posts",
		Config: map[string]any{
			"batch_size": 100,
		},
	},
	"sync-recent": {
		ID:       "sync-recent",
		Name:     "Sync recent posts",
		Type:     "periodic",
		Category: "posts",
		Config: map[string]any{
			"interval": "48m",
			"pages":    30,
		},
	},
	"sync-tags": {
		ID:       "sync-tags",
		Name:     "Sync tags",
		Type:     "periodic",
		Category: "tags",
		Config: map[string]any{
			"interval": "168h",
		},
	},
	"post-tags": {
		ID:       "post-tags",
		Name:     "Build post tag index",
		Type:     "worker",
		Category: "post_tags",
		Config: map[string]any{
			"batch_size": 100,
		},
	},
	"likes-migration": {
		ID:       "likes-migration",
		Name:     "Migrate legacy likes",
		Type:     "worker",
		Category: "likes",
		Config: map[string]any{
			"batch_size": 100,
		},
	},
	"file-sync": {
		ID:       "file-sync",
		Name:     "File sync",
		Type:     "adaptive",
		Category: "files",
		Config: map[string]any{
			"idle_limit": 10,
		},
	},
}

func (w *Worker) seedTasks(ctx context.Context) error {
	for id, def := range taskDefs {
		status := "stopped"
		desired := "running"
		if id == "file-sync" {
			desired = "stopped"
		}
		if id == "sync-recent" || id == "sync-tags" {
			status = "scheduled"
		}
		if err := w.store.SeedTask(ctx, def, status, desired); err != nil {
			return err
		}
	}
	return nil
}

func (w *Worker) startBackgroundTasks(ctx context.Context) {
	go w.runBackfill(ctx)
	go w.runRecentScheduler(ctx)
	go w.runTagsScheduler(ctx)
	go w.runPostTags(ctx)
	go w.runLikesMigration(ctx)
}

func taskDef(id string) TaskDefinition {
	return taskDefs[id]
}

func runID() string {
	return time.Now().UTC().Format("20060102T150405.000000000")
}

func percent(current, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return float64(current) * 100 / float64(total)
}
