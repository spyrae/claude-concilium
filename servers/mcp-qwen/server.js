#!/usr/bin/env node
/**
 * MCP server wrapping Qwen CLI for reliable non-interactive API calls.
 *
 * v2.0 improvements:
 *   1. Prompt via stdin (-p -) — safe for any content, no length limits
 *   2. --auth-type support via QWEN_AUTH_TYPE env var (e.g., "qwen-oauth")
 *   3. Detects "no auth type is selected" error
 *   4. spawn() with proper SIGTERM/SIGKILL timeout pattern
 *   5. MAX_BUFFER protection against runaway output
 *
 * Prerequisites:
 *   - Qwen CLI installed: npm install -g qwen
 *   - Authenticated: one of:
 *     a) qwen login (interactive OAuth)
 *     b) Set QWEN_AUTH_TYPE=qwen-oauth (if already authenticated)
 *     c) Set DASHSCOPE_API_KEY env var (API key auth)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";

const QWEN_AUTH_TYPE = process.env.QWEN_AUTH_TYPE || "";

function log(msg) {
  console.error(`[Qwen MCP] ${msg}`);
}

/**
 * Check output for known error patterns.
 */
function detectError(output) {
  const text = output.toLowerCase();

  if (text.includes("no auth type is selected") || text.includes("please configure an auth type")) {
    return {
      isError: true,
      errorType: "AUTH_NOT_CONFIGURED",
      message: "Qwen auth type not configured. Set QWEN_AUTH_TYPE env var (e.g., 'qwen-oauth') or run 'qwen' interactively to login.",
    };
  }

  if (text.includes("quota") || text.includes("rate limit") || text.includes("insufficient_quota") || text.includes("resource_exhausted")) {
    return {
      isError: true,
      errorType: "QUOTA_EXCEEDED",
      message: "Qwen quota exceeded. Check your account limits or try again later.",
    };
  }

  if (text.includes("authentication") || text.includes("invalid api key") || text.includes("unauthorized") || text.includes("token expired")) {
    return {
      isError: true,
      errorType: "AUTH_EXPIRED",
      message: "Qwen authentication failed. Run 'qwen' in terminal to re-login, or check DASHSCOPE_API_KEY.",
    };
  }

  if (text.includes("model not found") || text.includes("model_not_found") || text.includes("model is not available")) {
    return {
      isError: true,
      errorType: "MODEL_NOT_AVAILABLE",
      message: "Qwen model not found. Available: qwen-turbo, qwen-plus, qwen-long.",
    };
  }

  return null;
}

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB stdout/stderr limit

/**
 * Run qwen CLI with timeout and proper SIGTERM/SIGKILL cleanup.
 * Passes prompt via stdin (-p -) for safety and no length limits.
 */
function runQwen(prompt, options = {}) {
  const { timeoutMs = 120000, model = "qwen-turbo" } = options;

  return new Promise((resolve, reject) => {
    const args = [];

    // Pass --auth-type if configured via env var
    if (QWEN_AUTH_TYPE) {
      args.push("--auth-type", QWEN_AUTH_TYPE);
    }

    // Use stdin for prompt (-p -)
    args.push("-p", "-");

    if (model && model !== "qwen-turbo") {
      args.push("-m", model);
    }

    const proc = spawn("qwen", args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    let killTimer;

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      killTimer = setTimeout(() => {
        try { if (!proc.killed) proc.kill("SIGKILL"); } catch {}
      }, 5000);
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      if (stdout.length > MAX_BUFFER) {
        killed = true;
        proc.kill("SIGTERM");
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
      if (stderr.length > MAX_BUFFER) {
        killed = true;
        proc.kill("SIGTERM");
      }
    });

    // Send prompt via stdin
    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`Qwen killed after ${timeoutMs / 1000}s timeout. Partial: ${stdout.slice(-200)}`));
      } else {
        resolve({ stdout, stderr, exitCode });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      reject(err);
    });
  });
}

// --- MCP Server ---

const mcpServer = new McpServer({
  name: "qwen-mcp",
  version: "2.0.0",
});

mcpServer.registerTool(
  "qwen_chat",
  {
    description:
      "Send a prompt to Qwen via qwen CLI. Prompt sent via stdin (safe for any content). Models: qwen-turbo (fast, default), qwen-plus (deep analysis, code review), qwen-long (large context). Detects quota/auth errors.",
    inputSchema: {
      prompt: z.string().describe("The prompt to send to Qwen"),
      model: z
        .string()
        .default("qwen-turbo")
        .describe("Model: qwen-turbo (fast), qwen-plus (deep analysis), qwen-long (large context)"),
      timeout: z
        .number()
        .default(120)
        .describe("Timeout in seconds (default 120)"),
    },
  },
  async ({ prompt, model = "qwen-turbo", timeout = 120 }) => {
    const timeoutMs = timeout * 1000;

    try {
      log(`Chat: ${prompt.length} chars, model: ${model}, timeout ${timeout}s`);
      const startTime = Date.now();

      const { stdout, stderr, exitCode } = await runQwen(prompt, {
        timeoutMs,
        model,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const combined = stdout + stderr;

      const error = detectError(combined);
      if (error) {
        log(`${error.errorType}: ${error.message}`);
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }

      const response = stdout.trim();

      if (!response) {
        log(`No response (exit: ${exitCode})`);
        return {
          content: [{ type: "text", text: `No response from Qwen. Exit: ${exitCode}. Stderr: ${stderr.slice(-300)}` }],
          isError: true,
        };
      }

      log(`OK in ${elapsed}s (${response.length} chars)`);

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      const knownError = detectError(error.message);
      if (knownError) {
        return {
          content: [{ type: "text", text: knownError.message }],
          isError: true,
        };
      }

      log(`Error: ${error.message}`);
      return {
        content: [{ type: "text", text: `Qwen error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  log(`Started and ready (v2.0.0, auth-type: ${QWEN_AUTH_TYPE || "auto"})`);
}

process.on("SIGTERM", () => {
  log("Shutting down...");
  mcpServer.close().finally(() => process.exit(0));
});

main().catch(console.error);
