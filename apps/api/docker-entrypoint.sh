#!/bin/sh
set -e

echo "Applying database migrations..."
(cd apps/api && npx prisma migrate deploy)

echo "Starting API..."
exec node apps/api/dist/main.js
