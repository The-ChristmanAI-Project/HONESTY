# Honesty Above All Else — one image, both halves, both binds.
#
#   The desk          0.0.0.0:8788   TanStack Start / Nitro, node-server preset
#   Honesty Local     0.0.0.0:8787   honesty.py, Python 3 standard library only
#
# Read this before you trust it: inside a container, Honesty Local reads the
# CONTAINER's process list, not the home station's. That is the truth of a
# namespace, not a defect in the watcher. Run it on the home station when you
# want the home station's answer.

# ---------- build the desk ----------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Deps first so a source edit does not re-resolve the tree.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# node-server, not vercel. vite.config.ts falls back to "vercel" when this is
# unset, so nothing about the Vercel deploy path moved.
ENV NITRO_PRESET=node-server
# No DATABASE_URL here on purpose: scripts/migrate.mjs skips, and the PGLite
# fallback applies the same files at startup. A build must not need a database.
RUN npm run build

# ---------- run both halves ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# procps supplies `ps`. Without it honesty.py reports an empty process list and
# calls it a clean scan — a silent lie. It ships or the watcher does not.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 procps tini curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NITRO_HOST=0.0.0.0 \
    NITRO_PORT=8788 \
    HONESTY_LOCAL_HOST=0.0.0.0 \
    HONESTY_LOCAL_PORT=8787

COPY --from=build /app/.output ./.output
COPY honesty-local/ ./honesty-local/
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
# 0755, not `chmod +x`: the source file is 0600, and `+x` under umask
# leaves it unreadable to the unprivileged `node` user the container runs as.
# Ledger lives in /data. Never volume-mount over honesty.py.
RUN mkdir -p /data \
 && chmod 0755 /usr/local/bin/docker-entrypoint.sh \
 && chmod -R u+rwX,go+rX /app/honesty-local \
 && chown -R node:node /app/honesty-local /data

ENV HONESTY_DATA_DIR=/data
VOLUME ["/data"]

USER node

# Count them. Do not round.
EXPOSE 8787 8788

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -sf -o /dev/null http://127.0.0.1:8788/ \
   && curl -sf -o /dev/null http://127.0.0.1:8787/api/status || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
