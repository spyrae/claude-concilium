# mcp-gemini

MCP server wrapping [Gemini CLI](https://github.com/google-gemini/gemini-cli) for non-interactive API calls via Google OAuth.

## Tools

| Tool | Description |
|------|-------------|
| `gemini_chat` | General Q&A via `gemini -p` (90s timeout) |
| `gemini_analyze` | Deep analysis with large context up to 1M tokens (180s timeout) |

## Prerequisites

1. **Install Gemini CLI:**
   ```bash
   npm install -g @anthropic-ai/gemini-cli
   # or
   brew install gemini
   ```

2. **Authenticate:**
   ```bash
   gemini
   # Follow the Google OAuth flow in your browser
   ```

## Configuration

Add to your `.mcp.json`:
```json
{
  "mcp-gemini": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/servers/mcp-gemini/server.js"]
  }
}
```

## Features

- **No API key needed** — uses Google account OAuth
- **Free tier** — 1000 requests/day with personal Google account
- **1M token context** — use `gemini_analyze` for large codebases
- **Error detection** — auto-detects quota exceeded and auth issues
- **Models** — `gemini-2.5-pro` (default), `gemini-2.5-flash` (faster)
