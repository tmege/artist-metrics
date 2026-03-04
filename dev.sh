#!/usr/bin/env bash
set -e

trap 'kill 0' EXIT

echo "Starting API (port 3001)..."
pnpm dev:api &

echo "Starting Web (port 3000)..."
pnpm dev:web &

wait
