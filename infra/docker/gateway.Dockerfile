FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/gateway/package.json apps/gateway/package.json
RUN npm install --workspace=apps/gateway --no-audit --no-fund
COPY apps/gateway apps/gateway
RUN npm run build --workspace=apps/gateway
EXPOSE 4000
CMD ["node", "apps/gateway/dist/main.js"]
