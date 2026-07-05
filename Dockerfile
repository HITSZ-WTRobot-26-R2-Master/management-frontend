FROM oven/bun:1 AS builder

WORKDIR /app

ENV BUN_CONFIG_REGISTRY=https://registry.npmmirror.com

COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile

COPY . .
RUN bun run build


FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 5714

CMD ["nginx", "-g", "daemon off;"]
