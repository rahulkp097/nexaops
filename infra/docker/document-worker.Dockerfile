# glibc (not Alpine/musl): @xenova/transformers unconditionally requires
# onnxruntime-node, whose native binary needs glibc and hard-crashes on
# musl (verified: ld-linux-*.so not found under node:20-alpine).
FROM node:20-slim
WORKDIR /app
COPY package.json ./
COPY services/document-worker/package.json services/document-worker/package.json
RUN npm install --workspace=services/document-worker --no-audit --no-fund
COPY services/document-worker services/document-worker
RUN npm run build --workspace=services/document-worker
EXPOSE 4100
CMD ["node", "services/document-worker/dist/index.js"]
