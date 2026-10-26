# ერთი image სამი usectl აპისთვის (docs/10-deployment.md):
#   api      — ნაგულისხმევი ბრძანება (node dist/main.js)
#   worker   — node dist/worker.js
#   migrate  — node_modules/.bin/prisma migrate deploy   (release, ყოველი deploy-ის წინ)

FROM node:24-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml prisma.config.ts ./
COPY prisma ./prisma
# postinstall აგენერირებს Prisma client-ს
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
  # Prisma-ს migrate engine ჩამოიტვირთება აქ, რომ runtime-ში ინტერნეტი არ დასჭირდეს
  && pnpm prisma --version \
  && pnpm prune --prod --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]
