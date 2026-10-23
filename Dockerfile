# Build: compile TypeScript, then keep only production dependencies.
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build && pnpm prune --prod --ignore-scripts

# Runtime: stdio by default. For HTTP set PUSHOVER_MCP_TRANSPORT=http,
# PUSHOVER_MCP_HOST=0.0.0.0 and PUSHOVER_MCP_AUTH_TOKEN.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/cli.js"]
