#!/bin/sh
# Usage: free-port.sh <port> [--strict]
# Kills a leftover server of THIS project (cwd = <project>/server, e.g. an old `go run .`) that is still
# listening on <port>. A listener that belongs to something else is never killed: --strict reports it and
# exits 1 (used before starting a server), without --strict it is just skipped (used by `make stop`).
port=${1:?port}
strict=$2
server_dir="$(cd "$(dirname "$0")/.." && pwd)/server"

pids=$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)
for pid in $pids; do
	cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
	if [ "$cwd" = "$server_dir" ]; then
		kill "$pid" && echo "stopped leftover server pid $pid on :$port"
	elif [ "$strict" = "--strict" ]; then
		echo "port $port is used by another program (pid $pid: $(ps -o command= -p "$pid" | cut -c1-80))" >&2
		echo "free it, or pick another port: PORT=9000 make dev" >&2
		exit 1
	fi
done

# wait up to 3 s for the port to be released
i=0
while [ $i -lt 15 ] && [ -n "$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null)" ]; do
	sleep 0.2
	i=$((i + 1))
done
exit 0
