# mcp-openai

MCP server wrapping [OpenAI Codex CLI](https://github.com/openai/codex) for non-interactive API calls with error detection.

## Tools

| Tool | Description |
|------|-------------|
| `openai_chat` | Send prompts via `codex exec` (fast, non-interactive) |
| `openai_review` | Code review via `codex review` (git-based) |

## Prerequisites

1. **Install Codex CLI:**
   ```bash
   npm install -g @openai/codex
   ```

2. **Authenticate:**
   ```bash
   codex login
   ```

3. **Create minimal config** (for fast startup without MCP servers):
   ```bash
   mkdir -p ~/.codex-minimal
   cp ../../config/codex-minimal.toml.example ~/.codex-minimal/config.toml
   # Link auth from main codex config:
   ln -s ~/.codex/auth.json ~/.codex-minimal/auth.json
   ```

## Configuration

The server uses `CODEX_HOME` env var to find the Codex config directory. Defaults to `~/.codex-minimal`.

Set it in your `.mcp.json`:
```json
{
  "mcp-openai": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/servers/mcp-openai/server.js"],
    "env": {
      "CODEX_HOME": "/path/to/.codex-minimal"
    }
  }
}
```

## Error Detection

The server automatically detects and reports:
- **QUOTA_EXCEEDED** — ChatGPT Plus weekly credit limit reached
- **MODEL_NOT_SUPPORTED** — model not available on your plan
- **AUTH_EXPIRED** — OAuth token needs refresh

## Why Minimal Config?

The default `codex mcp-server` loads ALL configured MCP servers on startup, making it slow and unreliable. This server uses `codex exec` with a separate `CODEX_HOME` that has no MCP servers configured, resulting in instant startup.
