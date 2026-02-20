# Qwen Setup

## Prerequisites

- Node.js 18+
- DashScope account (for API key) or Qwen CLI login

## Installation

### 1. Install Qwen CLI

```bash
npm install -g qwen
```

### 2. Authenticate

Option A — CLI login:
```bash
qwen login
```

Option B — API key:
```bash
export DASHSCOPE_API_KEY=your-api-key-here
```

### 3. Add to MCP config

In your `.mcp.json`:

```json
{
  "mcp-qwen": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/claude-concilium/servers/mcp-qwen/server.js"]
  }
}
```

If using API key auth:

```json
{
  "mcp-qwen": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/claude-concilium/servers/mcp-qwen/server.js"],
    "env": {
      "DASHSCOPE_API_KEY": "your-api-key-here"
    }
  }
}
```

### 4. Verify

```bash
qwen -p "Say hello"
```

## Available Tools

### `qwen_chat`
Send prompts with model selection.

Parameters:
- `prompt` (required) — the prompt to send
- `model` (optional, default `qwen-turbo`) — model to use
- `timeout` (optional, default 120) — timeout in seconds

## Models

| Model | Best For | Speed |
|-------|----------|-------|
| `qwen-turbo` | Quick answers, simple tasks | Fast |
| `qwen-plus` | Deep analysis, code review | Medium |
| `qwen-long` | Large context processing | Slower |

## Role in Concilium

Qwen serves as the **first fallback** when primary agents (OpenAI, Gemini) are unavailable:

```
OpenAI → (error) → Qwen → (error) → DeepSeek
Gemini → (error) → Qwen → (error) → DeepSeek
```

Use `qwen-plus` model for code review fallback tasks (better analysis quality).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `QUOTA_EXCEEDED` | Check DashScope account limits. |
| `AUTH_ERROR` | Run `qwen login` or check `DASHSCOPE_API_KEY`. |
| `MODEL_NOT_FOUND` | Use one of: `qwen-turbo`, `qwen-plus`, `qwen-long`. |
| Timeout | Increase `timeout` parameter. |
