# dev and prod use different ports so you can edit under `make dev` (8081) while a prod binary / `go run .`
# (8080, the server's default) is running for API testing. PORT=xxxx overrides whichever one you start.
DEV_PORT  := 8081
PROD_PORT := 8080
BIN  := server/bin/server
# pid files let `make stop` kill only this project's processes (exec keeps the shell's pid)
DEV_PID  := server/tmp/dev.pid
PROD_PID := server/bin/prod.pid

.PHONY: help dev prod build stop stop-port restart restart-prod clean

help:
	@echo "make dev           - dev server with hot reload (Go via air, html/js/css/glb via browser reload)"
	@echo "make prod          - build and run the production binary (no reload)"
	@echo "make build         - build the production binary only ($(BIN))"
	@echo "make stop          - stop the dev/prod server started by make (+ a leftover of this project on the dev port)"
	@echo "make restart       - stop, then make dev"
	@echo "make restart-prod  - stop, then make prod"
	@echo "make clean         - stop and remove build output"
	@echo "dev: http://localhost:$(DEV_PORT)   prod / go run .: http://localhost:$(PROD_PORT)   (PORT=9000 make dev to override)"

# Go changes -> air rebuilds + restarts; client/assets changes -> the server tells the page to reload.
dev: PORT ?= $(DEV_PORT)
dev: stop-port
	@command -v air >/dev/null || { echo "air not found: go install github.com/air-verse/air@latest"; exit 1; }
	@mkdir -p server/tmp
	cd server && echo $$$$ > ../$(DEV_PID) && exec env DEV=1 PORT=$(PORT) air -c .air.toml

build:
	cd server && go build -o bin/server .

# Must run from server/ because main.go serves ../client and ../assets.
prod: PORT ?= $(PROD_PORT)
prod: build stop-port
	cd server && echo $$$$ > ../$(PROD_PID) && exec env PORT=$(PORT) ./bin/server

stop:
	@for f in $(DEV_PID) $(PROD_PID); do \
		if [ -f $$f ]; then \
			pid=$$(cat $$f); \
			if kill $$pid 2>/dev/null; then echo "stopped pid $$pid ($$f)"; fi; \
			rm -f $$f; \
		fi; \
	done
	@tools/free-port.sh $(or $(PORT),$(DEV_PORT))
	@sleep 1

# before starting: free the port from a leftover server of this project (e.g. an old `go run .`)
stop-port:
	@tools/free-port.sh $(PORT) --strict

restart: stop
	@$(MAKE) --no-print-directory dev

restart-prod: stop
	@$(MAKE) --no-print-directory prod

clean: stop
	rm -rf server/bin server/tmp
