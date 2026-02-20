# mcp-qwen

MCP server wrapping [Qwen CLI](https://github.com/QwenLM/qwen) with spawn-based execution, error detection, and proper timeout handling.

## Tools

| Tool | Description |
|------|-------------|
| `qwen_chat` | Send prompts to Qwen with model selection |

## Prerequisites

1. **Install Qwen CLI:**
   ```bash
   npm install -g qwen
   ```

2. **Authenticate:**
   ```bash
   qwen login
   # Or set DASHSCOPE_API_KEY environment variable
   ```

## Configuration

Add to your `.mcp.json`:
```json
{
  "mcp-qwen": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/servers/mcp-qwen/server.js"]
  }
}
```

## Models

| Model | Use Case |
|-------|----------|
| `qwen-turbo` | Fast responses (default) |
| `qwen-plus` | Deep analysis, code review |
| `qwen-long` | Large context processing |

## Error Detection

The server automatically detects:
- **QUOTA_EXCEEDED** — API quota limit reached
- **AUTH_ERROR** — invalid or missing API key
- **MODEL_NOT_FOUND** — unsupported model name

## Improvements Over Naive Approach

This server uses `spawn()` instead of `exec()`:
- No shell injection risk (prompt passed as argument, not interpolated into shell string)
- Proper SIGTERM/SIGKILL timeout pattern (graceful shutdown, then force kill after 5s)
- Structured error responses with error type classification
