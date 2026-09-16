#!/bin/sh
# Applies pending database migrations, then starts the API.
set -eu
cd /repo/packages/database
node node_modules/typeorm/cli.js migration:run -d dist/data-source.js
cd /repo
exec node apps/api/dist/main.js
