# Customization

## Adding Your Own LLM Provider

### MCP Server Template

Create a new server following this template:

```javascript
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";

function log(msg) {
  console.error(`[YourLLM MCP] ${msg}`);
}

function detectError(output) {
  const text = output.toLowerCase();

  // Add your provider-specific error patterns
  if (text.includes("rate limit") || text.includes("quota")) {
    return {
      isError: true,
      errorType: "QUOTA_EXCEEDED",
      message: "YourLLM quota exceeded.",
    };
  }

  if (text.includes("unauthorized") || text.includes("invalid key")) {
    return {
      isError: true,
      errorType: "AUTH_ERROR",
      message: "YourLLM auth failed. Check credentials.",
    };
  }

  return null;
}

function runLLM(prompt, options = {}) {
  const { timeoutMs = 90000 } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn("your-cli-tool", ["-p", prompt], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let killed = false;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { if (!proc.killed) proc.kill("SIGKILL"); } catch {}
      }, 5000);
    }, timeoutMs);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.stdin.end();

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      if (killed) reject(new Error(`Timeout after ${timeoutMs/1000}s`));
      else resolve({ stdout, stderr, exitCode });
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

const mcpServer = new McpServer({
  name: "yourllm-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "yourllm_chat",
  {
    description: "Send a prompt to YourLLM",
    inputSchema: {
      prompt: z.string().describe("The prompt to send"),
      timeout: z.number().default(90).describe("Timeout in seconds"),
    },
  },
  async ({ prompt, timeout = 90 }) => {
    try {
      log(`Chat: ${prompt.length} chars`);
      const startTime = Date.now();

      const { stdout, stderr } = await runLLM(prompt, {
        timeoutMs: timeout * 1000,
      });

      const combined = stdout + stderr;
      const error = detectError(combined);
      if (error) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }

      const response = stdout.trim();
      if (!response) {
        return { content: [{ type: "text", text: "No response" }], isError: true };
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      log(`OK in ${elapsed}s`);

      return { content: [{ type: "text", text: response }] };
    } catch (error) {
      const known = detectError(error.message);
      if (known) return { content: [{ type: "text", text: known.message }], isError: true };
      return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  log("Started and ready");
}

main().catch(console.error);
```

### Package.json Template

```json
{
  "name": "@claude-concilium/mcp-yourllm",
  "version": "1.0.0",
  "description": "MCP server for YourLLM",
  "main": "server.js",
  "bin": { "mcp-yourllm": "./server.js" },
  "type": "module",
  "license": "MIT",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.2",
    "zod": "^3.25.76"
  }
}
```

## Modifying the Fallback Chain

The fallback chain is defined in the Concilium skill (`skill/ai-concilium.md`). Edit the protocol section to change the order:

```
# Default chain:
OpenAI → Qwen → DeepSeek
Gemini → Qwen → DeepSeek

# Example: Add your LLM as first fallback:
OpenAI → YourLLM → Qwen → DeepSeek
Gemini → YourLLM → Qwen → DeepSeek
```

Update the skill's "Error Handling" section accordingly.

## Custom Prompt Strategies

### Code Review (default)

Both agents get the same diff with slightly different framing:
- Agent A: brief description + key changes
- Agent B: full diff + detailed context

### Architecture Decision

Ask different questions to different agents:
- Agent A: "What are the tradeoffs of approach X vs Y?"
- Agent B: "Design a solution for [problem] given [constraints]"

### Debugging

Provide the same error context but ask for different analysis:
- Agent A: "What could cause this error? List top 3 hypotheses."
- Agent B: "Trace the code path that leads to this error. What's wrong?"

## Adjusting Timeouts

Default timeouts are set per tool. Override in your MCP calls:

```
mcp__openai__openai_chat:
  prompt: "..."
  timeout: 180    # Override default 90s for complex prompts
```

For large codebases, use `gemini_analyze` with its 180s default (can be increased further).
