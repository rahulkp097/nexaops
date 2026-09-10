FROM node:20.20.2-alpine
WORKDIR /app
COPY package.json ./
COPY apps/gateway/package.json apps/gateway/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN npm install --workspace=apps/gateway --workspace=packages/shared-types --no-audit --no-fund
COPY packages/shared-types packages/shared-types
RUN npm run build --workspace=packages/shared-types
COPY apps/gateway apps/gateway
RUN npm run build --workspace=apps/gateway
EXPOSE 4000
CMD ["node", "apps/gateway/dist/main.js"]
