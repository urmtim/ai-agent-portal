#!/bin/sh
# Container entrypoint: bring the DB schema up to date, seed a fresh DB once, start Next.
set -e
db="${DATABASE_URL#file:}"
fresh=0
[ -f "$db" ] || fresh=1
# adds new tables/columns; refuses changes that would drop data
node_modules/.bin/prisma db push --skip-generate
if [ "$fresh" = 1 ]; then node_modules/.bin/tsx prisma/seed.ts; fi
exec node_modules/.bin/next start -p 3000
