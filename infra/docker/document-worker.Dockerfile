# glibc (not Alpine/musl): @xenova/transformers unconditionally requires
# onnxruntime-node, whose native binary needs glibc and hard-crashes on
# musl (verified: ld-linux-*.so not found under node:20-alpine).

# ---- build ----
FROM node:20.20.2-slim AS build
WORKDIR /app
COPY package.json ./
COPY services/document-worker/package.json services/document-worker/package.json
RUN npm install --workspace=services/document-worker --no-audit --no-fund
COPY services/document-worker services/document-worker
RUN npm run build --workspace=services/document-worker
RUN npm prune --omit=dev \
    && rm -rf services/document-worker/src services/document-worker/tsconfig.json

# ---- runtime ----
FROM node:20.20.2-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
# Volumes (document_storage, model_cache) mount over these paths at
# container start — Docker seeds a new named volume's initial content from
# whatever's already on disk here, ownership included, so this has to
# happen before USER switches off root.
RUN mkdir -p /app/storage /app/.cache/transformers \
    && chown -R node:node /app/storage /app/.cache/transformers
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/document-worker/dist/index.js"]
