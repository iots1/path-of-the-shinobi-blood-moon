// Dev-only live reload (DEV=1, set by `make dev`): watches ../client and ../assets and tells open pages
// to reload over Server-Sent Events. Go source changes are handled by air (see .air.toml), which restarts
// this process; the page's EventSource reconnects to the new process and reloads as well.
package main

import (
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

var devMode = os.Getenv("DEV") == "1"

// Directories (relative to server/) and extensions whose changes trigger a browser reload.
var (
	watchDirs = []string{"../client", "../assets"}
	watchExt  = map[string]bool{".html": true, ".js": true, ".css": true, ".glb": true}
)

const reloadSnippet = `<script>(()=>{try{const es=new EventSource('/__dev/reload');let seen=false;` +
	`es.onopen=()=>{if(seen)location.reload();seen=true};` +
	`es.addEventListener('reload',()=>location.reload())}catch(e){}})();</script>`

type reloadHub struct {
	mu   sync.Mutex
	subs map[chan struct{}]struct{}
}

func (h *reloadHub) subscribe() chan struct{} {
	ch := make(chan struct{}, 1)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *reloadHub) unsubscribe(ch chan struct{}) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

func (h *reloadHub) broadcast() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
}

// snapshot returns every watched file's mtime+size; polling avoids an fsnotify dependency.
func snapshot() map[string]string {
	m := map[string]string{}
	for _, dir := range watchDirs {
		filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !watchExt[strings.ToLower(filepath.Ext(p))] {
				return nil
			}
			if info, err := d.Info(); err == nil {
				m[p] = fmt.Sprintf("%d/%d", info.ModTime().UnixNano(), info.Size())
			}
			return nil
		})
	}
	return m
}

func watchFiles(h *reloadHub) {
	prev := snapshot()
	for range time.Tick(300 * time.Millisecond) {
		cur := snapshot()
		changed := len(cur) != len(prev)
		for p, sig := range cur {
			if prev[p] != sig {
				changed = true
				break
			}
		}
		if changed {
			prev = cur
			h.broadcast()
		}
	}
}

func serveEvents(h *reloadHub) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		fl, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming unsupported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		fmt.Fprint(w, ": connected\n\n")
		fl.Flush()

		ch := h.subscribe()
		defer h.unsubscribe(ch)
		ping := time.NewTicker(15 * time.Second)
		defer ping.Stop()
		for {
			select {
			case <-ch:
				fmt.Fprint(w, "event: reload\ndata: 1\n\n")
			case <-ping.C:
				fmt.Fprint(w, ": ping\n\n")
			case <-r.Context().Done():
				return
			}
			fl.Flush()
		}
	}
}

// clientHandler serves ../client like http.FileServer, but injects the reload script into HTML pages.
func clientHandler() http.Handler {
	root := http.Dir("../client")
	files := http.FileServer(root)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := path.Clean("/" + r.URL.Path)
		if strings.HasSuffix(r.URL.Path, "/") {
			p = path.Join(p, "index.html")
		}
		if path.Ext(p) != ".html" {
			files.ServeHTTP(w, r)
			return
		}
		f, err := root.Open(p)
		if err != nil {
			files.ServeHTTP(w, r)
			return
		}
		defer f.Close()
		body, err := io.ReadAll(f)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		page := string(body)
		if i := strings.LastIndex(page, "</body>"); i >= 0 {
			page = page[:i] + reloadSnippet + page[i:]
		} else {
			page += reloadSnippet
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		io.WriteString(w, page)
	})
}

// noStore stops the browser from keeping stale copies of anything (the glb is cached otherwise).
func noStore(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

func enableDevReload(mux *http.ServeMux) http.Handler {
	hub := &reloadHub{subs: map[chan struct{}]struct{}{}}
	go watchFiles(hub)
	mux.HandleFunc("/__dev/reload", serveEvents(hub))
	return noStore(mux)
}
