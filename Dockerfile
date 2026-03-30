FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ src/
COPY manifest/ manifest/

EXPOSE 3978

ENV MCP_TRANSPORT=http
ENV TEAMS_PORT=3978
ENV LOG_LEVEL=info

CMD ["bun", "run", "src/index.ts"]
