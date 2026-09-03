FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace=apps/web --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build --workspace=apps/web
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web"]
