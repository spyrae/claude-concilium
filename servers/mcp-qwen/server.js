#!/usr/bin/env node
/**
 * MCP server wrapping Qwen CLI for reliable non-interactive API calls.
 *
 * Key improvements over naive exec() approach:
 *   1. Uses spawn() instead of exec() — no shell injection risk
 *   2. Proper SIGTERM/SIGKILL timeout pattern
 *   3. Error detection for quota/auth/timeout issues
 *   4. Structured error responses
 *
 * Prerequisites:
 *   - Qwen CLI installed: npm install -g qwen
 *   - Authenticated: qwen login (or DASHSCOPE_API_KEY env var)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";

function log(msg) {
  console.error(`[Qwen MCP] ${msg}`);
}

/**
 * Check output for known error patterns.
 */
function detectError(output) {
  const text = output.toLowerCase();

  if (text.includes("quota") || text.includes("rate limit") || text.includes("insufficient_quota")) {
    return {
      isError: true,
      errorType: "QUOTA_EXCEEDED",
      message: "Qwen API quota exceeded. Check your DashScope account limits.",
    };
  }

  if (text.includes("authentication") || text.includes("invalid api key") || text.includes("unauthorized")) {
    return {
      isError: true,
      errorType: "AUTH_ERROR",
      message: "Qwen authentication failed. Run 'qwen login' or set DASHSCOPE_API_KEY env var.",
    };
  }

  if (text.includes("model not found") || text.includes("model_not_found")) {
    return {
      isError: true,
      errorType: "MODEL_NOT_FOUND",
      message: "Qwen model not found. Available models: qwen-turbo, qwen-plus, qwen-long.",
    };
  }

  return null;
}

/**
 * Run qwen CLI with timeout and proper SIGTERM/SIGKILL cleanup.
 * Uses spawn() instead of exec() for safety and reliability.
 */
function runQwen(prompt, options = {}) {
  const { timeoutMs = 120000, model = "qwen-turbo" } = options;

  return new Promise((resolve, reject) => {
    const args = ["-p", prompt];

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

    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGTERM");
      setTimeout(() => {
        try { if (!proc.killed) proc.kill("SIGKILL"); } catch {}
      }, 5000);
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.stdin.end();

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`Qwen killed after ${timeoutMs / 1000}s timeout. Partial: ${stdout.slice(-200)}`));
      } else {
        resolve({ stdout, stderr, exitCode });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// --- MCP Server ---

const mcpServer = new McpServer({
  name: "qwen-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "qwen_chat",
  {
    description:
      "Send a prompt to Qwen via qwen CLI. Models: qwen-turbo (fast, default), qwen-plus (deep analysis, code review), qwen-long (large context). Good as fallback when OpenAI/Gemini are unavailable.",
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
  log("Started and ready");
}

main().catch(console.error);
