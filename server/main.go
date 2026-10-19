// Dev server entry point: serves the game page (../client) and models (../assets) on http://localhost:8080
// Run from the server/ folder: go run .
//
// TODO (next up):
//   - POST /api/save, GET /api/save  : save player data
//   - /ws                            : game room WebSocket (Go must decide hit results, never trust client values)
package main

import (
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
)

var safeName = regexp.MustCompile(`^[\w.\-]{1,100}\.(png|json)$`)

// POST /debug/save?name=<file> — dev-only: the client's "Capture 8" button writes its PNG/JSON into ../out/.
// Same-origin only, plain file names only (no paths), 64 MB max.
func saveCapture(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "POST only", http.StatusMethodNotAllowed)
		return
	}
	if o := r.Header.Get("Origin"); o != "" {
		if u, err := url.Parse(o); err != nil || u.Host != r.Host {
			http.Error(w, "cross-origin", http.StatusForbidden)
			return
		}
	}
	name := r.URL.Query().Get("name")
	if !safeName.MatchString(name) {
		http.Error(w, "bad name", http.StatusBadRequest)
		return
	}
	if err := os.MkdirAll("../out", 0o755); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	f, err := os.Create(filepath.Join("../out", name))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer f.Close()
	if _, err := io.Copy(f, http.MaxBytesReader(w, r.Body, 64<<20)); err != nil {
		http.Error(w, err.Error(), http.StatusRequestEntityTooLarge)
		return
	}
	log.Printf("saved out/%s", name)
	w.Write([]byte("ok"))
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("/debug/save", saveCapture)
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("../assets"))))
	var handler http.Handler = mux
	if devMode {
		mux.Handle("/", clientHandler())
		handler = enableDevReload(mux)
	} else {
		mux.Handle("/", http.FileServer(http.Dir("../client")))
	}

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("Path of the Shinobi: Blood Moon server: http://localhost%s (live reload: %v)", addr, devMode)
	log.Fatal(http.ListenAndServe(addr, handler))
}
