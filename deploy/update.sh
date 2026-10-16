#!/usr/bin/env sh
# Pull the latest code and restart with it. Data in the volumes is kept.
set -e
cd "$(dirname "$0")"
git pull --ff-only
docker compose up -d --build
docker image prune -f
