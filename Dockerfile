FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
RUN apk add --no-cache python3
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]