# Claude Concilium

**Multi-agent AI consultation framework for Claude Code via MCP.**

Get a second (and third) opinion from other LLMs when Claude Code alone isn't enough.

```
Claude Code ──┬── OpenAI (Codex CLI) ──► Opinion A
              ├── Gemini (gemini-cli) ─► Opinion B
              │
              └── Synthesis ◄── Consensus or iterate
```

## The Problem

Claude Code is powerful, but one brain can miss bugs, overlook edge cases, or get stuck in a local optimum. Critical decisions benefit from diverse perspectives.

## The Solution

Concilium runs parallel consultations with multiple LLMs through standard [MCP protocol](https://modelcontextprotocol.io/). Each LLM server wraps a CLI tool — no API keys needed for the primary providers (they use OAuth).

**Key features:**
- Parallel consultation with 2+ AI agents
- Production-grade fallback chains with error detection
- Each MCP server works standalone or as part of Concilium
- Plug & play: clone, `npm install`, add to `.mcp.json`

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Claude Code                          │
│                                                          │
│  "Review this code for race conditions"                  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐                      │
│  │  MCP Call #1  │  │  MCP Call #2  │   (parallel)        │
│  └──────┬───────┘  └──────┬───────┘                      │
│         │                  │                              │
└─────────┼──────────────────┼──────────────────────────────┘
          │                  │
          ▼                  ▼
   ┌──────────────┐   ┌──────────────┐
   │  mcp-openai  │   │  mcp-gemini  │     Primary agents
   │  (codex exec)│   │ (gemini -p)  │
   └──────┬───────┘   └──────┬───────┘
          │                  │
          ▼                  ▼
   ┌──────────────┐   ┌──────────────┐
   │   OpenAI     │   │   Google     │     LLM providers
   │   (OAuth)    │   │   (OAuth)    │
   └──────────────┘   └──────────────┘

   Fallback chain (on quota/error):
   OpenAI → Qwen → DeepSeek
   Gemini → Qwen → DeepSeek
```

## Quickstart

### 1. Clone and install

```bash
git clone https://github.com/spyrae/claude-concilium.git
cd claude-concilium

# Install dependencies for each server
cd servers/mcp-openai && npm install && cd ../..
cd servers/mcp-gemini && npm install && cd ../..
cd servers/mcp-qwen && npm install && cd ../..
```

### 2. Set up providers

Pick at least 2 providers:

| Provider | Auth | Free Tier | Setup |
|----------|------|-----------|-------|
| **OpenAI** | `codex login` (OAuth) | ChatGPT Plus weekly credits | [Setup guide](docs/setup-openai.md) |
| **Gemini** | Google OAuth | 1000 req/day | [Setup guide](docs/setup-gemini.md) |
| **Qwen** | `qwen login` or API key | Varies | [Setup guide](docs/setup-qwen.md) |
| **DeepSeek** | API key | Pay-per-use (cheap) | [Setup guide](docs/setup-deepseek.md) |

### 3. Add to Claude Code

Copy `config/mcp.json.example` and update paths:

```bash
# Edit the example with your actual paths
cp config/mcp.json.example .mcp.json
# Update "/path/to/claude-concilium" with actual path
```

Or add servers individually to your existing `.mcp.json`:

```json
{
  "mcpServers": {
    "mcp-openai": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/servers/mcp-openai/server.js"],
      "env": {
        "CODEX_HOME": "~/.codex-minimal"
      }
    },
    "mcp-gemini": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/servers/mcp-gemini/server.js"]
    }
  }
}
```

### 4. Install the skill (optional)

Copy the Concilium skill to your Claude Code commands:

```bash
cp skill/ai-concilium.md ~/.claude/commands/ai-concilium.md
```

Now use `/ai-concilium` in Claude Code to trigger a multi-agent consultation.

## MCP Servers

Each server can be used independently — you don't need all of them.

| Server | CLI Tool | Auth | Tools |
|--------|----------|------|-------|
| [mcp-openai](servers/mcp-openai/) | `codex` | OAuth (ChatGPT Plus) | `openai_chat`, `openai_review` |
| [mcp-gemini](servers/mcp-gemini/) | `gemini` | Google OAuth | `gemini_chat`, `gemini_analyze` |
| [mcp-qwen](servers/mcp-qwen/) | `qwen` | API key / CLI login | `qwen_chat` |

**DeepSeek** uses the existing [`deepseek-mcp-server`](https://www.npmjs.com/package/deepseek-mcp-server) npm package — no custom server needed.

## How It Works

### Consultation Flow

1. **Formulate** — describe the problem concisely (under 500 chars)
2. **Send in parallel** — OpenAI + Gemini get the same prompt
3. **Handle errors** — if a provider fails, fallback chain kicks in (Qwen → DeepSeek)
4. **Synthesize** — compare responses, find consensus
5. **Iterate** (optional) — resolve disagreements with follow-up questions
6. **Decide** — apply the synthesized solution

### Error Detection

All servers detect provider-specific errors and return structured responses:

| Error Type | Meaning | Action |
|------------|---------|--------|
| `QUOTA_EXCEEDED` | Rate/credit limit hit | Use fallback provider |
| `AUTH_EXPIRED` / `AUTH_REQUIRED` | Token needs refresh | Re-authenticate CLI |
| `MODEL_NOT_SUPPORTED` | Model unavailable on plan | Use default model |
| Timeout | Process hung | Auto-killed, use fallback |

### Fallback Chain

```
Primary:   OpenAI ──────────────► Response
           (QUOTA_EXCEEDED?)
                    │
Fallback 1: Qwen ──┴────────────► Response
           (timeout?)
                    │
Fallback 2: DeepSeek ───────────► Response (always available)
```

## When to Use Concilium

| Scenario | Recommended Agents |
|----------|-------------------|
| Code review | OpenAI + Gemini (parallel) |
| Architecture decision | OpenAI + Gemini → iterate if disagree |
| Stuck bug (3+ attempts) | All available agents |
| Performance optimization | Gemini (1M context) + OpenAI |
| Security review | OpenAI + Gemini + manual verification |

## Customization

See [docs/customization.md](docs/customization.md) for:
- Adding your own LLM provider
- Modifying the fallback chain
- MCP server template
- Custom prompt strategies

## Documentation

- [Architecture](docs/architecture.md) — flow diagrams, error handling, design decisions
- [OpenAI Setup](docs/setup-openai.md) — Codex CLI, ChatGPT Plus, minimal config
- [Gemini Setup](docs/setup-gemini.md) — gemini-cli, Google OAuth
- [Qwen Setup](docs/setup-qwen.md) — Qwen CLI, DashScope
- [DeepSeek Setup](docs/setup-deepseek.md) — API key, npm package
- [Customization](docs/customization.md) — add your own LLM, modify chains

## License

MIT
