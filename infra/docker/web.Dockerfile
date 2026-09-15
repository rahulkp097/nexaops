# ---- build ----
FROM node:20.20.2-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --workspace=apps/web --workspace=packages/shared-types --no-audit --no-fund
COPY packages/shared-types packages/shared-types
RUN npm run build --workspace=packages/shared-types
COPY apps/web apps/web
# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container start — so this has to be a build ARG, not a compose
# `environment:` entry (which would only affect the running container).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build --workspace=apps/web

# ---- runtime ----
# next.config.mjs sets `output: 'standalone'`, which traces the exact
# node_modules subset this app needs (via @vercel/nft) into
# .next/standalone — @nexaops/shared-types never appears there since every
# import from it is `import type` and gets fully erased at compile time,
# leaving zero runtime footprint to trace. `.next/static` (build-time
# static assets) isn't included in standalone by design and has to be
# copied separately — see Next's own Docker deployment docs.
FROM node:20.20.2-alpine
ENV NODE_ENV=production
# Docker always injects its own HOSTNAME env var (the container id), and
# the standalone server.js Next generates reads `process.env.HOSTNAME` as
# its bind address — without this override it binds to the container's own
# hostname-resolved bridge IP instead of all interfaces, which still
# happens to work for host-mapped traffic (Docker's port-forward targets
# that same bridge IP) but breaks anything hitting the container from
# inside its own network namespace, including this image's own
# HEALTHCHECK.
ENV HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
