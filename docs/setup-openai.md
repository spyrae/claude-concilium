# OpenAI Setup (Codex CLI)

## Prerequisites

- Node.js 18+
- ChatGPT Plus subscription (or OpenAI API access)

## Installation

### 1. Install Codex CLI

```bash
npm install -g @openai/codex
```

### 2. Authenticate

```bash
codex login
```

This opens a browser for OAuth authentication. Your token is saved at `~/.codex/auth.json`.

### 3. Create Minimal Config

The default Codex config may include MCP servers that slow down startup. Create a minimal config for fast, non-interactive queries:

```bash
mkdir -p ~/.codex-minimal

# Copy the example config
cp config/codex-minimal.toml.example ~/.codex-minimal/config.toml

# Link auth from main codex config
ln -s ~/.codex/auth.json ~/.codex-minimal/auth.json
```

### 4. Verify

```bash
# Test that codex works with minimal config
CODEX_HOME=~/.codex-minimal codex exec --ephemeral -p "Say hello"
```

### 5. Add to MCP config

In your `.mcp.json`:

```json
{
  "mcp-openai": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/claude-concilium/servers/mcp-openai/server.js"],
    "env": {
      "CODEX_HOME": "/Users/yourname/.codex-minimal"
    }
  }
}
```

## Available Tools

### `openai_chat`
Send a prompt via `codex exec`. Non-interactive, fast startup.

Parameters:
- `prompt` (required) — the prompt to send
- `model` (optional) — model override
- `timeout` (optional, default 90) — timeout in seconds
- `cwd` (optional) — working directory

### `openai_review`
Code review via `codex review`. Reviews git changes.

Parameters:
- `instructions` (optional) — review focus areas
- `uncommitted` (default true) — review uncommitted changes
- `base` (optional) — review against base branch
- `commit` (optional) — review specific commit
- `timeout` (optional, default 120) — timeout in seconds
- `cwd` (optional) — git repo root

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `QUOTA_EXCEEDED` | ChatGPT Plus credits reset weekly. Wait or upgrade. |
| `MODEL_NOT_SUPPORTED` | Don't specify `model`, use the default. |
| `AUTH_EXPIRED` | Run `codex login` again. |
| Slow startup | Ensure `CODEX_HOME` points to minimal config (no MCP servers). |
| No response | Check `~/.codex-minimal/auth.json` exists and is valid. |

## Notes

- ChatGPT Plus gives weekly credit limits for Codex usage
- Credits reset at a specific time each week (shown in error message)
- The minimal config avoids loading MCP servers, reducing startup from ~10s to <1s
