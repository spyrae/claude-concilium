# Gemini Setup (gemini-cli)

## Prerequisites

- Node.js 18+
- Google account

## Installation

### 1. Install Gemini CLI

```bash
npm install -g @anthropic-ai/gemini-cli
# or
brew install gemini
```

### 2. Authenticate

```bash
gemini
```

This opens Google OAuth in your browser. Follow the prompts to authenticate.

### 3. Add to MCP config

In your `.mcp.json`:

```json
{
  "mcp-gemini": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/claude-concilium/servers/mcp-gemini/server.js"]
  }
}
```

### 4. Verify

```bash
gemini -p "Say hello" -o text
```

## Available Tools

### `gemini_chat`
General Q&A. 90s default timeout.

Parameters:
- `prompt` (required) — the prompt to send
- `model` (optional) — `gemini-2.5-pro` (default) or `gemini-2.5-flash`
- `timeout` (optional, default 90) — timeout in seconds

### `gemini_analyze`
Deep analysis for large contexts (up to 1M tokens). 180s default timeout.

Parameters:
- `prompt` (required) — analysis prompt with full context
- `model` (optional) — `gemini-2.5-pro` (default) or `gemini-2.5-flash`
- `timeout` (optional, default 180) — timeout in seconds

## Free Tier

- **1000 requests/day** with personal Google account
- No API key needed — authentication via Google OAuth
- `gemini-2.5-pro` is the default (best quality)
- `gemini-2.5-flash` is available for faster, cheaper responses

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `QUOTA_EXCEEDED` | 1000 req/day limit. Wait until tomorrow or upgrade to AI Pro. |
| `AUTH_REQUIRED` | Run `gemini` in terminal to re-authenticate. |
| Timeout | Increase `timeout` parameter or use `gemini-2.5-flash` for faster responses. |
| "Loaded cached credentials" in output | Normal stderr message, ignored by the server. |
