# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim

# uv for the Python pipeline, copied from the official uv image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# curl + ca-certificates: uv needs them to fetch standalone Python 3.12
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# OG metadata domain baked at build time; override with
# `docker compose build --build-arg NEXT_PUBLIC_SITE_URL=https://...`
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL

# Node deps first (better-sqlite3 ships prebuilt binaries); layer-cache friendly
COPY package.json package-lock.json ./
RUN npm ci

# Python pipeline venv: standalone Python 3.12 managed by uv
COPY pipeline/pyproject.toml pipeline/
RUN cd pipeline && uv sync --python 3.12 --no-dev

# alembic must be on PATH: the pipeline spawns `alembic upgrade head`
ENV PATH="/app/pipeline/.venv/bin:${PATH}"

# App source + production build
COPY . .
RUN npm run build

RUN mkdir -p /app/data
VOLUME /app/data

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:3000/api/health || exit 1

CMD ["npm", "run", "start"]
