// Dev server entry point: serves the game page (../client) and models (../assets) on http://localhost:8080
// Run from the server/ folder: go run .
//
// TODO (next up):
//   - POST /api/save, GET /api/save  : save player data
//   - /ws                            : game room WebSocket (Go must decide hit results, never trust client values)
package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	mux.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir("../assets"))))
	mux.Handle("/", http.FileServer(http.Dir("../client")))

	addr := ":8080"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("zanshin dev server: http://localhost%s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}
