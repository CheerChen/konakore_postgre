package main

import (
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
