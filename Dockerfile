FROM node:20-bookworm AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY frontend/package*.json ./frontend/
RUN npm ci --prefix frontend

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build:all

FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/public ./public

RUN mkdir -p /app/uploads

EXPOSE 3000

CMD ["node", "dist/index.js"]
