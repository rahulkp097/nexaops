# ---- build ----
FROM node:20.20.2-alpine AS build
WORKDIR /app
COPY package.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --workspace=apps/gateway --workspace=packages/shared-types --no-audit --no-fund
COPY packages/shared-types packages/shared-types
RUN npm run build --workspace=packages/shared-types
COPY apps/gateway apps/gateway
RUN npm run build --workspace=apps/gateway
# Strips devDependencies (tsc, jest, ts-jest, eslint, ...) and raw TS
# source now that both workspaces' dist/ exist — none of it belongs in a
# production image.
RUN npm prune --omit=dev \
    && rm -rf apps/gateway/src apps/gateway/tsconfig.json packages/shared-types/src packages/shared-types/tsconfig.json

# ---- runtime ----
FROM node:20.20.2-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
# document_storage mounts over this path at container start — see
# document-worker.Dockerfile's comment on why ownership is set before USER
# switches off root, and why only the one writable directory is chowned
# rather than the whole tree (node_modules only needs to be readable).
RUN mkdir -p /app/storage \
    && chown -R node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/gateway/dist/main.js"]
