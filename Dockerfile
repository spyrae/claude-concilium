FROM node:18-slim

WORKDIR /app

# Copy package manifests first for layer caching
COPY servers/mcp-openai/package.json servers/mcp-openai/
COPY servers/mcp-gemini/package.json servers/mcp-gemini/
COPY servers/mcp-qwen/package.json servers/mcp-qwen/

# Install dependencies for all servers
RUN cd servers/mcp-openai && npm install --production \
    && cd ../mcp-gemini && npm install --production \
    && cd ../mcp-qwen && npm install --production

# Copy source code
COPY servers/ servers/
COPY test/ test/

# Verify build with smoke test
RUN node test/smoke-test.mjs

# SERVER env selects which server to run: mcp-openai | mcp-gemini | mcp-qwen
ENV SERVER=mcp-openai

ENTRYPOINT ["sh", "-c", "exec node servers/${SERVER}/server.js"]
