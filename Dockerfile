# Portal as a long-running local container: `npm run deploy` builds and (re)starts it.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=1

# dependencies first, so code edits don't reinstall them (postinstall runs prisma generate)
COPY package.json package-lock.json ./
COPY prisma/schema.prisma prisma/
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "docker/start.sh"]
