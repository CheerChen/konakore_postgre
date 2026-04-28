package main

import (
	"context"
	"time"
)

func (w *Worker) markTaskError(ctx context.Context, def TaskDefinition, desired, runID, phase string, err error) {
	now := time.Now().UTC()
	_ = w.store.UpdateTask(ctx, TaskSnapshot{
		ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
		Status: "error", DesiredStatus: desired, ProgressPct: 0,
		State: map[string]any{
			"run_id": runID, "current_step": "error", "phase": phase,
		},
		Config: def.Config, ErrorMessage: err.Error(), CompletedAt: &now, LastRunAt: &now,
	})
	w.log.Error("task failed", "event", "task_error", "task", def.ID, "run_id", runID, "phase", phase, "error", err)
}

func (w *Worker) markTaskStopped(ctx context.Context, def TaskDefinition, desired, runID, reason string) {
	now := time.Now().UTC()
	_ = w.store.UpdateTask(ctx, TaskSnapshot{
		ID: def.ID, Name: def.Name, Type: def.Type, Category: def.Category,
		Status: "stopped", DesiredStatus: desired, ProgressPct: 0,
		State: map[string]any{
			"run_id": runID, "current_step": "stopped", "reason": reason,
		},
		Config: def.Config, CompletedAt: &now, LastRunAt: &now,
	})
	w.log.Info("task stopped", "event", "task_stop", "task", def.ID, "run_id", runID, "reason", reason)
}
