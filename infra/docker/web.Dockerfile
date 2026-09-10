FROM node:20.20.2-alpine
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
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=apps/web"]
