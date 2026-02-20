# Architecture

## Design Principles

1. **CLI wrappers, not direct API** — each MCP server wraps a CLI tool (`codex`, `gemini`, `qwen`) rather than calling APIs directly. This means auth is handled by the CLI (OAuth flows, token refresh) and we don't manage API keys for primary providers.

2. **Spawn, not exec** — all servers use Node.js `spawn()` instead of `exec()` to avoid shell injection risks. Prompts are passed as arguments or via stdin, never interpolated into shell strings.

3. **Fail fast, fallback clean** — error detection happens at the MCP server level. If a provider returns a quota error, the server returns a structured `isError: true` response with the error type. The orchestrator (Claude Code + Concilium skill) handles fallback routing.

4. **Each server is standalone** — you can use `mcp-openai` alone for OpenAI access, without the Concilium skill. The skill is an orchestration layer on top.

## Flow Diagram

```
User asks Claude Code a hard question
         │
         ▼
Claude Code tries to solve it
         │
    ┌────┴────┐
    │ Solved? │
    └────┬────┘
    Yes  │  No (after 3 attempts)
    ▼    │
  Done   ▼
    ┌─────────────────┐
    │  AI Concilium   │
    │  (skill trigger) │
    └────────┬────────┘
             │
    ┌────────┴────────┐
    │  Formulate      │
    │  problem (<500c)│
    └────────┬────────┘
             │
    ┌────────┴────────────────────┐
    │         PARALLEL            │
    ▼                             ▼
┌───────────┐             ┌───────────┐
│  OpenAI   │             │  Gemini   │
│  MCP call │             │  MCP call │
└─────┬─────┘             └─────┬─────┘
      │                         │
      ▼                         ▼
┌───────────┐             ┌───────────┐
│ Response A│             │ Response B│
│ or Error  │             │ or Error  │
└─────┬─────┘             └─────┬─────┘
      │                         │
      │ (on error)              │ (on error)
      ▼                         ▼
┌───────────┐             ┌───────────┐
│   Qwen    │             │   Qwen    │
│ (fallback)│             │ (fallback)│
└─────┬─────┘             └─────┬─────┘
      │ (on error)              │ (on error)
      ▼                         ▼
┌───────────┐             ┌───────────┐
│ DeepSeek  │             │ DeepSeek  │
│ (fallback)│             │ (fallback)│
└─────┬─────┘             └─────┬─────┘
      │                         │
      └───────────┬─────────────┘
                  │
                  ▼
         ┌────────────────┐
         │   Synthesize   │
         │   responses    │
         └───────┬────────┘
                 │
         ┌───────┴───────┐
         │  Consensus?   │
         └───────┬───────┘
         Yes     │  No
         ▼       │
       Apply     ▼
              Iterate (optional)
```

## Error Detection Patterns

Each MCP server implements `detectError(output)` that checks CLI output for known patterns:

### OpenAI (`mcp-openai`)
```
"usage limit" / "hit your usage limit" → QUOTA_EXCEEDED
"not supported when using codex"       → MODEL_NOT_SUPPORTED
"auth" + ("expired" / "login")         → AUTH_EXPIRED
```

### Gemini (`mcp-gemini`)
```
"quota" / "rate limit" / "resource_exhausted" → QUOTA_EXCEEDED
"authentication" / "not authenticated"         → AUTH_REQUIRED
```

### Qwen (`mcp-qwen`)
```
"quota" / "rate limit" / "insufficient_quota"  → QUOTA_EXCEEDED
"authentication" / "invalid api key"           → AUTH_ERROR
"model not found" / "model_not_found"          → MODEL_NOT_FOUND
```

## Timeout Handling

All servers use the same SIGTERM/SIGKILL pattern:

```javascript
// 1. Set timeout
const timer = setTimeout(() => {
  killed = true;
  proc.kill("SIGTERM");           // Graceful shutdown
  setTimeout(() => {
    if (!proc.killed) proc.kill("SIGKILL");  // Force kill after 5s
  }, 5000);
}, timeoutMs);

// 2. Clean up on close
proc.on("close", () => {
  clearTimeout(timer);
  if (killed) reject(new Error("timeout"));
  else resolve({ stdout, stderr, exitCode });
});
```

Default timeouts:
- `openai_chat`: 90s
- `openai_review`: 120s
- `gemini_chat`: 90s
- `gemini_analyze`: 180s
- `qwen_chat`: 120s

## Why CLI Wrappers vs Direct API?

| Aspect | CLI Wrapper | Direct API |
|--------|-------------|------------|
| Auth | CLI handles OAuth flows | Need API keys |
| Cost | Free tiers via OAuth | Pay per token |
| Maintenance | CLI updates automatically | SDK version pinning |
| Reliability | CLI tested by provider | Custom error handling |
| Flexibility | Limited to CLI features | Full API access |

We chose CLI wrappers because:
1. **No API keys for primary providers** — OAuth via CLI is free/cheap
2. **Less code** — no SDK dependencies, no token management
3. **Provider-tested** — CLI tools are maintained by the providers themselves
4. **Simple** — spawn a process, get stdout, done
