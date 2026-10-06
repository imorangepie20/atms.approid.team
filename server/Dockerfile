FROM node:24.19.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY tsconfig.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
# Client generation needs a syntactically valid URL; no DB connection is made.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM build AS migrate
USER node
CMD ["npm", "run", "db:deploy"]

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4300
COPY package*.json ./
RUN npm ci --omit=dev --omit=optional
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4300
CMD ["node", "dist/main.js"]
