# Qwen Setup

## Prerequisites

- Node.js 20+
- Qwen account (for OAuth) or DashScope account (for API key)

## Installation

### 1. Install Qwen CLI

```bash
npm install -g qwen
```

### 2. Authenticate

**Option A — OAuth (recommended, no API key needed):**

```bash
# Step 1: Interactive login
qwen
# Follow the OAuth flow in your browser

# Step 2: Verify settings have selectedType
cat ~/.qwen/settings.json
# Should contain: "selectedType": "qwen-oauth"

# If selectedType is missing, add it:
# Edit ~/.qwen/settings.json and set:
# "security": { "auth": { "selectedType": "qwen-oauth" } }
```

**Option B — API key:**

```bash
export DASHSCOPE_API_KEY=your-api-key-here
```

### 3. Add to MCP config

In your `.mcp.json`:

**For OAuth auth (recommended):**

```json
{
  "mcp-qwen": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/claude-concilium/servers/mcp-qwen/server.js"],
    "env": {
      "QWEN_AUTH_TYPE": "qwen-oauth"
    }
  }
}
```

**For API key auth:**

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
# With OAuth:
qwen --auth-type qwen-oauth -p "Say hello"

# With API key:
DASHSCOPE_API_KEY=your-key qwen -p "Say hello"
```

## Available Tools

### `qwen_chat`
Send prompts with model selection. Prompt is sent via stdin for safety.

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

## Common Issue: "No auth type is selected"

This happens when `~/.qwen/settings.json` doesn't have `selectedType` configured. This is common after CLI updates.

**Fix:**

1. Edit `~/.qwen/settings.json`:
   ```json
   {
     "security": {
       "auth": {
         "selectedType": "qwen-oauth"
       }
     },
     "$version": 3
   }
   ```

2. Or set `QWEN_AUTH_TYPE=qwen-oauth` in your MCP config env.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `AUTH_NOT_CONFIGURED` | Set `QWEN_AUTH_TYPE=qwen-oauth` in env or fix `~/.qwen/settings.json` |
| `AUTH_EXPIRED` | Run `qwen` interactively to re-login via OAuth |
| `QUOTA_EXCEEDED` | Check account limits, try again later |
| `MODEL_NOT_AVAILABLE` | Use one of: `qwen-turbo`, `qwen-plus`, `qwen-long` |
| Timeout | Increase `timeout` parameter or switch to `qwen-turbo` |
