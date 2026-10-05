FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY backend/package.json ./backend/package.json
COPY --from=build /app/backend/dist ./backend/dist
COPY content ./content
RUN mkdir -p backend/uploads && chown -R node:node backend/uploads
USER node
EXPOSE 4000
CMD ["node", "backend/dist/server.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/frontend/dist /srv
COPY deploy/aws/Caddyfile /etc/caddy/Caddyfile
EXPOSE 80 443
