FROM node:22-alpine

WORKDIR /app
ENV CI=true

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile --filter @arcstar/api... --prod=false

ENV NODE_ENV=production
EXPOSE 8787

CMD ["pnpm", "--filter", "@arcstar/api", "start:tsx"]
