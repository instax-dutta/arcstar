FROM node:22-alpine AS build

WORKDIR /app
ENV CI=true

RUN corepack enable

COPY . .

RUN pnpm install --frozen-lockfile --filter @arcstar/api... --prod=false
RUN pnpm --filter @arcstar/api... build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV CI=true

COPY --from=build /app .

RUN addgroup -S arcstar && adduser -S arcstar -G arcstar && chown -R arcstar:arcstar /app

USER arcstar

EXPOSE 8787

CMD ["node", "apps/api/dist/index.js"]
