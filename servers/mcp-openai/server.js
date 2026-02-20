#!/usr/bin/env node
/**
 * MCP server wrapping OpenAI Codex CLI for reliable, non-interactive API calls.
 *
 * Key features:
 *   1. Uses CODEX_HOME env var (or ~/.codex-minimal) for fast startup without MCP servers
 *   2. `codex exec` non-interactive mode with configurable timeout
 *   3. Detects quota/auth errors and returns clear messages
 *   4. `codex review` for git-based code review
 *   5. Proper cleanup (ephemeral sessions, temp files)
 *
 * Prerequisites:
 *   - Codex CLI installed: npm install -g @openai/codex
 *   - Authenticated: codex login
 *   - Minimal config at CODEX_HOME (see docs/setup-openai.md)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFile, unlink } from "fs/promises";
import { spawn } from "child_process";
import { tmpdir, homedir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), ".codex-minimal");

function log(msg) {
  console.error(`[OpenAI MCP] ${msg}`);
}

function tempFile(prefix) {
  return join(tmpdir(), `${prefix}-${randomBytes(4).toString("hex")}.txt`);
}

/**
 * Check if output contains a known error pattern.
 * Returns { isError, errorType, message } or null if no error detected.
 */
function detectError(output) {
  const combined = output.toLowerCase();

  if (combined.includes("usage limit") || combined.includes("hit your usage limit")) {
    const match = output.match(/try again at (.+?)[\.\n]/);
    const resetDate = match ? match[1] : "unknown";
    return {
      isError: true,
      errorType: "QUOTA_EXCEEDED",
      message: `Codex usage limit reached. Credits reset at: ${resetDate}. Use a fallback provider.`,
    };
  }

  if (combined.includes("not supported when using codex with a chatgpt account")) {
    return {
      isError: true,
      errorType: "MODEL_NOT_SUPPORTED",
      message: "This model is not available with ChatGPT Plus. Use the default model.",
    };
  }

  if (combined.includes("auth") && (combined.includes("expired") || combined.includes("login"))) {
    return {
      isError: true,
      errorType: "AUTH_EXPIRED",
      message: "Codex auth token expired. Run 'codex login' to re-authenticate.",
    };
  }

  return null;
}

/**
 * Extract the actual response from codex exec output.
 * Prefers the -o file output (clean last message), falls back to stdout parsing.
 */
function extractResponse(stdout, outputFileContent) {
  if (outputFileContent && outputFileContent.trim()) {
    return outputFileContent.trim();
  }

  const lines = stdout.split("\n");
  let inResponse = false;
  let response = [];

  for (const line of lines) {
    if (line.trim() === "codex") {
      inResponse = true;
      continue;
    }
    if (inResponse && line.startsWith("tokens used")) {
      break;
    }
    if (inResponse) {
      response.push(line);
    }
  }

  if (response.length > 0) {
    return response.join("\n").trim();
  }

  return stdout.trim();
}

/**
 * Run codex CLI with timeout and proper cleanup.
 * Uses CODEX_HOME for minimal config (no MCP servers = fast startup).
 */
function runCodex(args, options = {}) {
  const { timeoutMs = 90000, stdin: stdinData, cwd } = options;

  return new Promise((resolve, reject) => {
    const proc = spawn("codex", args, {
      cwd: cwd || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        CODEX_HOME,
      },
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

    if (stdinData) {
      proc.stdin.write(stdinData);
      proc.stdin.end();
    } else {
      proc.stdin.end();
    }

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      if (killed) {
        reject(new Error(`Process killed after ${timeoutMs / 1000}s timeout. Partial output: ${(stdout + stderr).slice(-200)}`));
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
  name: "openai-mcp",
  version: "1.0.0",
});

mcpServer.registerTool(
  "openai_chat",
  {
    description:
      "Send a prompt to OpenAI via Codex exec. Non-interactive, fast startup (no MCP servers loaded), with timeout. Returns clear error on quota limits. For code review, use openai_review instead.",
    inputSchema: {
      prompt: z.string().describe("The prompt to send"),
      model: z
        .string()
        .optional()
        .describe("Model override (optional). Note: some models may not be available on ChatGPT Plus"),
      timeout: z
        .number()
        .default(90)
        .describe("Timeout in seconds (default 90)"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory for codex"),
    },
  },
  async ({ prompt, model, timeout = 90, cwd }) => {
    const timeoutMs = timeout * 1000;
    const outputFile = tempFile("codex-chat");

    try {
      log(`Chat: ${prompt.length} chars, timeout ${timeout}s`);
      const startTime = Date.now();

      const args = [
        "exec",
        "--sandbox", "read-only",
        "--ephemeral",
        "-o", outputFile,
      ];

      if (model) {
        args.push("-m", model);
      }

      args.push("-");

      const { stdout, stderr, exitCode } = await runCodex(args, {
        timeoutMs,
        stdin: prompt,
        cwd,
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const combined = stdout + stderr;

      const error = detectError(combined);
      if (error) {
        log(`${error.errorType}: ${error.message}`);
        try { await unlink(outputFile); } catch {}
        return {
          content: [{ type: "text", text: error.message }],
          isError: true,
        };
      }

      let outputFileContent = "";
      try {
        outputFileContent = await readFile(outputFile, "utf-8");
      } catch {}

      try { await unlink(outputFile); } catch {}

      const response = extractResponse(stdout, outputFileContent);

      if (!response) {
        log(`No response (exit: ${exitCode}, stdout: ${stdout.length}, stderr: ${stderr.length})`);
        return {
          content: [{ type: "text", text: `No response from Codex. Exit code: ${exitCode}. Output: ${combined.slice(-300)}` }],
          isError: true,
        };
      }

      log(`OK in ${elapsed}s (${response.length} chars)`);

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      try { await unlink(outputFile); } catch {}

      const knownError = detectError(error.message);
      if (knownError) {
        log(`${knownError.errorType}: ${knownError.message}`);
        return {
          content: [{ type: "text", text: knownError.message }],
          isError: true,
        };
      }

      log(`Error: ${error.message}`);
      return {
        content: [{ type: "text", text: `Codex error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

mcpServer.registerTool(
  "openai_review",
  {
    description:
      "Code review via Codex review (non-interactive). Reviews uncommitted changes or changes against a base branch.",
    inputSchema: {
      instructions: z
        .string()
        .optional()
        .describe("Custom review instructions (e.g., 'Focus on error handling and race conditions')"),
      uncommitted: z
        .boolean()
        .default(true)
        .describe("Review uncommitted changes (default true)"),
      base: z
        .string()
        .optional()
        .describe("Review against this base branch"),
      commit: z
        .string()
        .optional()
        .describe("Review a specific commit SHA"),
      timeout: z
        .number()
        .default(120)
        .describe("Timeout in seconds (default 120)"),
      cwd: z
        .string()
        .optional()
        .describe("Working directory (git repo root)"),
    },
  },
  async ({ instructions, uncommitted = true, base, commit, timeout = 120, cwd }) => {
    const timeoutMs = timeout * 1000;

    try {
      log(`Review: uncommitted=${uncommitted}, base=${base || "none"}, timeout=${timeout}s`);
      const startTime = Date.now();

      const args = ["review", "--ephemeral"];

      if (uncommitted) {
        args.push("--uncommitted");
      }
      if (base) {
        args.push("--base", base);
      }
      if (commit) {
        args.push("--commit", commit);
      }

      if (instructions) {
        args.push("-");
      }

      const { stdout, stderr, exitCode } = await runCodex(args, {
        timeoutMs,
        stdin: instructions || undefined,
        cwd,
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

      const response = combined.trim() || "No review output";
      log(`Review OK in ${elapsed}s (${response.length} chars)`);

      return {
        content: [{ type: "text", text: response }],
      };
    } catch (error) {
      const knownError = detectError(error.message);
      if (knownError) {
        log(`${knownError.errorType}: ${knownError.message}`);
        return {
          content: [{ type: "text", text: knownError.message }],
          isError: true,
        };
      }

      log(`Error: ${error.message}`);
      return {
        content: [{ type: "text", text: `Codex review error: ${error.message}` }],
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
