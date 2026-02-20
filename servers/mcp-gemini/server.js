#!/usr/bin/env node
/**
 * MCP server wrapping gemini-cli for reliable non-interactive API calls.
 *
 * Key features:
 *   - Uses Google account OAuth (no API key needed)
 *   - Free tier: 1000 req/day with personal Google account
 *   - gemini_chat: General Q&A via `gemini -p`
 *   - gemini_analyze: Deep analysis with extended context (1M tokens)
 *   - Error detection for quota/auth issues
 *   - Proper timeout with SIGTERM/SIGKILL cleanup
 *
 * Prerequisites:
 *   - Gemini CLI installed: npm install -g @anthropic-ai/gemini-cli (or brew)
 *   - Authenticated: run `gemini` in terminal to login via Google
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { spawn } from "child_process";

function log(msg) {
  console.error(`[Gemini MCP] ${msg}`);
}

/**
 * Check output for known error patterns.
 */
function detectError(output) {
  const text = output.toLowerCase();

  if (text.includes("quota") || text.includes("rate limit") || text.includes("resource_exhausted")) {
    return {
      isError: true,
      errorType: "QUOTA_EXCEEDED",
      message: "Gemini daily quota exceeded. Free tier: 1000 req/day. Try again tomorrow or use a fallback provider.",
    };
  }

  if (text.includes("authentication") || text.includes("not authenticated") || text.includes("login")) {
    return {
      isError: true,
      errorType: "AUTH_REQUIRED",
      message: "Gemini not authenticated. Run 'gemini' in terminal to login via Google account.",
    };
  }

  return null;
}

const MAX_BUFFER = 10 * 1024 * 1024; // 10MB stdout/stderr limit

/**
 * Run gemini CLI with timeout and proper SIGTERM/SIGKILL cleanup.
 */
function runGemini(prompt, options = {}) {
  const { timeoutMs = 90000, model, outputFormat = "text" } = options;

  return new Promise((resolve, reject) => {
    const args = ["-p", prompt, "-o", outputFormat];

    if (model) {
      args.push("-m", model);
    }

    const proc = spawn("gemini", args, {
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

    proc.stdin.end();

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      if (killed) {
        reject(new Error(`Gemini killed after ${timeoutMs / 1000}s timeout. Partial: ${stdout.slice(-200)}`));
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
  name: "gemini-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "gemini_chat",
  {
    description:
      "Send a prompt to Gemini via gemini-cli. Free tier: 1000 req/day. Uses Google account auth (no API key). Good for code review, architecture questions, analysis. 1M token context window.",
    inputSchema: {
      prompt: z.string().describe("The prompt to send to Gemini"),
      model: z
        .string()
        .optional()
        .describe("Model override (default: gemini-2.5-pro). Options: gemini-2.5-pro, gemini-2.5-flash"),
      timeout: z
        .number()
        .default(90)
        .describe("Timeout in seconds (default 90)"),
    },
  },
  async ({ prompt, model, timeout = 90 }) => {
    const timeoutMs = timeout * 1000;

    try {
      log(`Chat: ${prompt.length} chars, timeout ${timeout}s, model: ${model || "default"}`);
      const startTime = Date.now();

      const { stdout, stderr, exitCode } = await runGemini(prompt, {
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
          content: [{ type: "text", text: `No response from Gemini. Exit: ${exitCode}. Stderr: ${stderr.slice(-300)}` }],
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
        content: [{ type: "text", text: `Gemini error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "gemini_analyze",
  {
    description:
      "Deep analysis with Gemini — sends a large context (up to 1M tokens). Use for analyzing entire files, large diffs, or complex codebases. Longer timeout (3 min).",
    inputSchema: {
      prompt: z.string().describe("Analysis prompt with full context/code to analyze"),
      model: z
        .string()
        .optional()
        .describe("Model: gemini-2.5-pro (default, best), gemini-2.5-flash (faster)"),
      timeout: z
        .number()
        .default(180)
        .describe("Timeout in seconds (default 180 for large contexts)"),
    },
  },
  async ({ prompt, model, timeout = 180 }) => {
    const timeoutMs = timeout * 1000;

    try {
      log(`Analyze: ${prompt.length} chars, timeout ${timeout}s`);
      const startTime = Date.now();

      const { stdout, stderr, exitCode } = await runGemini(prompt, {
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
        return {
          content: [{ type: "text", text: `No response from Gemini. Exit: ${exitCode}. Stderr: ${stderr.slice(-300)}` }],
          isError: true,
        };
      }

      log(`Analyze OK in ${elapsed}s (${response.length} chars)`);

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
        content: [{ type: "text", text: `Gemini analyze error: ${error.message}` }],
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

process.on("SIGTERM", () => {
  log("Shutting down...");
  mcpServer.close().finally(() => process.exit(0));
});

main().catch(console.error);
