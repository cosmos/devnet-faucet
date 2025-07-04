#!/bin/bash

# Default port
DEFAULT_PORT=8088
PORT=$DEFAULT_PORT

# Check if default port is in use
if lsof -i :$PORT >/dev/null 2>&1; then
	echo "Port $PORT is already in use. Finding an available port..."
	# Find next available port starting from 8089
	for ((i=$PORT+1; i<=$PORT+100; i++)); do
		if ! lsof -i :$i >/dev/null 2>&1; then
			PORT=$i
			break
		fi
	done
	echo "Using port $PORT instead."
fi

# Run docker compose with the available port
docker compose run --rm --remove-orphans -e HOST=0.0.0.0 -p $PORT:8088 faucet