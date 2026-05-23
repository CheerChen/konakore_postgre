package main

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

func (w *Worker) newHTTPServer() *http.Server {
	mux := http.NewServeMux()
	startedAt := time.Now().UTC()

	mux.HandleFunc("/health", func(rw http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodGet {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		writeJSON(rw, map[string]any{
			"status":         "healthy",
			"service":        serviceName,
			"started_at":     startedAt.Format(time.RFC3339),
			"uptime_seconds": int(time.Since(startedAt).Seconds()),
			"file_sync":      w.fileSync.Status(),
		})
	})

	mux.HandleFunc("/v1/profile:update", func(rw http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			PostID int64 `json:"post_id"`
		}
		if err := json.NewDecoder(req.Body).Decode(&payload); err != nil || payload.PostID == 0 {
			http.Error(rw, "invalid payload", http.StatusBadRequest)
			return
		}
		// Decouple from the API request: profile rebuild can take ~50-200ms
		// for thousands of liked posts, and the API caller doesn't need to wait.
		go func(id int64) {
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			if err := w.updateUserProfileForLike(ctx, id); err != nil {
				w.log.Warn("profile update failed", "event", "profile_update_failed", "post_id", id, "error", err)
			}
		}(payload.PostID)
		rw.WriteHeader(http.StatusAccepted)
		_, _ = rw.Write([]byte(`{"status":"accepted"}`))
	})

	mux.HandleFunc("/v1/embeddings:rebuild", func(rw http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		if !w.embeddingsRebuildLock.TryLock() {
			http.Error(rw, "rebuild already in progress", http.StatusConflict)
			return
		}
		go func() {
			defer w.embeddingsRebuildLock.Unlock()
			// Long-running task; detach from the HTTP request lifecycle.
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Hour)
			defer cancel()
			if err := w.runEmbeddingsRebuild(ctx); err != nil {
				w.log.Error("embeddings rebuild failed", "event", "rebuild_failed", "error", err)
			}
		}()
		rw.WriteHeader(http.StatusAccepted)
		_, _ = rw.Write([]byte(`{"status":"accepted"}`))
	})

	mux.HandleFunc("/trigger", func(rw http.ResponseWriter, req *http.Request) {
		if req.Method != http.MethodPost {
			http.Error(rw, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		var payload struct {
			Action string `json:"action"`
		}
		_ = json.NewDecoder(req.Body).Decode(&payload)
		if payload.Action == "" {
			payload.Action = "start"
		}
		switch payload.Action {
		case "start":
			writeJSON(rw, w.fileSync.Start("http_trigger"))
		case "stop":
			writeJSON(rw, w.fileSync.Stop("http_trigger"))
		case "status":
			writeJSON(rw, w.fileSync.Status())
		default:
			http.Error(rw, "invalid action", http.StatusBadRequest)
		}
	})

	return &http.Server{
		Addr:              w.cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func writeJSON(rw http.ResponseWriter, value any) {
	rw.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(rw).Encode(value)
}
