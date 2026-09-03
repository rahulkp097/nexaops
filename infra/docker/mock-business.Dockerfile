FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY services/mock-business/package.json services/mock-business/package.json
RUN npm install --workspace=services/mock-business --no-audit --no-fund
COPY services/mock-business services/mock-business
RUN npm run build --workspace=services/mock-business
EXPOSE 4200
CMD ["node", "services/mock-business/dist/index.js"]
