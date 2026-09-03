FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY services/document-worker/package.json services/document-worker/package.json
RUN npm install --workspace=services/document-worker --no-audit --no-fund
COPY services/document-worker services/document-worker
RUN npm run build --workspace=services/document-worker
EXPOSE 4100
CMD ["node", "services/document-worker/dist/index.js"]
