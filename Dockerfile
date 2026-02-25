# Build
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json yarn.lock* package-lock.json* ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build:deploy

# Run
FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/examples/custom-data ./examples/custom-data
COPY --from=builder /app/data ./data
COPY server.js ./

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000

CMD ["node", "server.js"]
