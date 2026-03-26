FROM node:22-alpine AS ts-builder

WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npx tsc

FROM heroiclabs/nakama:3.38.0

COPY --from=ts-builder /server/build/index.js /nakama/data/modules/index.js
COPY nakama/local.yml /nakama/data/modules/local.yml
