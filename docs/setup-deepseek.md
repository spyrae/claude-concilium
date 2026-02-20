# DeepSeek Setup

DeepSeek uses the existing [`deepseek-mcp-server`](https://www.npmjs.com/package/deepseek-mcp-server) npm package — no custom server needed.

## Prerequisites

- Node.js 18+
- DeepSeek API key ([platform.deepseek.com](https://platform.deepseek.com))

## Installation

### 1. Get API Key

1. Go to [platform.deepseek.com](https://platform.deepseek.com)
2. Create an account and add credits
3. Generate an API key

### 2. Add to MCP config

In your `.mcp.json`:

```json
{
  "deepseek": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "deepseek-mcp-server"],
    "env": {
      "DEEPSEEK_API_KEY": "your-api-key-here"
    }
  }
}
```

No local installation needed — `npx -y` downloads and runs it automatically.

### 3. Verify

The server will start when Claude Code connects to it. You can test manually:

```bash
DEEPSEEK_API_KEY=your-key npx deepseek-mcp-server
```

## Available Tools

The `deepseek-mcp-server` provides:
- `chat_completion` — send prompts to DeepSeek

## Role in Concilium

DeepSeek serves as the **last resort fallback** — it's always available (pay-per-use API, no daily limits):

```
OpenAI → (error) → Qwen → (error) → DeepSeek  ← always works
Gemini → (error) → Qwen → (error) → DeepSeek  ← always works
```

## Pricing

DeepSeek is significantly cheaper than other providers. Check current pricing at [platform.deepseek.com](https://platform.deepseek.com).

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Auth error | Check `DEEPSEEK_API_KEY` is set correctly in `.mcp.json` env. |
| No response | Verify API key has credits at platform.deepseek.com. |
| Slow response | DeepSeek can be slower for complex prompts. Increase Claude Code timeout. |
