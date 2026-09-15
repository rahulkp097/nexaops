# ---- build ----
FROM node:20.20.2-alpine AS build
WORKDIR /app
COPY package.json ./
COPY services/mock-business/package.json services/mock-business/package.json
RUN npm install --workspace=services/mock-business --no-audit --no-fund
COPY services/mock-business services/mock-business
RUN npm run build --workspace=services/mock-business
# Strips devDependencies (tsc, jest, ts-node-dev, ...) and the raw TS
# source now that dist/ exists — none of it belongs in a production image.
RUN npm prune --omit=dev \
    && rm -rf services/mock-business/src services/mock-business/tsconfig.json

# ---- runtime ----
FROM node:20.20.2-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app /app
USER node
EXPOSE 4200
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4200/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "services/mock-business/dist/index.js"]
