FROM --platform=linux/amd64 public.ecr.aws/docker/library/node:22 AS builder
WORKDIR /app
COPY package.json package-lock.json* .npmrc ./
RUN npm install --omit=dev
COPY tsconfig.json index.ts ./
RUN npx tsc

# Runtime must be arm64 for AgentCore. No RUN steps here (no emulation needed):
# JS + node_modules are arch-independent for this dependency tree.
FROM --platform=linux/arm64 public.ecr.aws/docker/library/node:22
WORKDIR /app
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
EXPOSE 8080
CMD ["node", "dist/index.js"]
