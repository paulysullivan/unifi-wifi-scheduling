#!/bin/sh
set -e

cd /app/backend

echo "Running database migrations..."
alembic upgrade head

echo "Starting Network Schedule Manager on port ${PORT:-7323}..."
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-7323}"
