# mcp-qwen

MCP server wrapping [Qwen CLI](https://github.com/QwenLM/qwen) with stdin-based prompt delivery, OAuth support, error detection, and proper timeout handling.

## Tools

| Tool | Description |
|------|-------------|
| `qwen_chat` | Send prompts to Qwen with model selection (prompt via stdin) |

## Prerequisites

1. **Install Qwen CLI:**
   ```bash
   npm install -g qwen
   ```

2. **Authenticate** (pick one):

   a) **OAuth (recommended)** — run `qwen` interactively, then set `QWEN_AUTH_TYPE`:
   ```bash
   qwen  # Follow OAuth flow in browser
   # Then configure env var for non-interactive use:
   QWEN_AUTH_TYPE=qwen-oauth
   ```

   b) **API key:**
   ```bash
   export DASHSCOPE_API_KEY=your-api-key-here
   ```

## Configuration

Add to your `.mcp.json`:

```json
{
  "mcp-qwen": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/servers/mcp-qwen/server.js"],
    "env": {
      "QWEN_AUTH_TYPE": "qwen-oauth"
    }
  }
}
```

If using API key auth, omit `QWEN_AUTH_TYPE` and set `DASHSCOPE_API_KEY` instead.

## Models

| Model | Use Case |
|-------|----------|
| `qwen-turbo` | Fast responses (default) |
| `qwen-plus` | Deep analysis, code review |
| `qwen-long` | Large context processing |

## Error Detection

The server automatically detects:
- **AUTH_NOT_CONFIGURED** — auth type not set (missing `QWEN_AUTH_TYPE` or login)
- **QUOTA_EXCEEDED** — API quota limit reached
- **AUTH_EXPIRED** — token expired, needs re-login
- **MODEL_NOT_AVAILABLE** — unsupported model name

## v2.0 Improvements

- **Prompt via stdin** (`-p -`) — safe for any content, no shell injection or length limits
- **OAuth auth-type support** via `QWEN_AUTH_TYPE` env var
- **AUTH_NOT_CONFIGURED detection** — catches the common "no auth type is selected" error
- **Graceful shutdown** — SIGTERM handler for clean process exit
