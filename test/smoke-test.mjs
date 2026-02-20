#!/usr/bin/env node
/**
 * Smoke test for MCP servers.
 *
 * Tests that each server:
 *   1. Starts without errors
 *   2. Responds to MCP initialize handshake
 *   3. Lists its tools via tools/list
 *
 * Does NOT require CLI tools (codex, gemini, qwen) to be installed.
 *
 * Usage:
 *   node test/smoke-test.mjs                    # Test all servers
 *   node test/smoke-test.mjs servers/mcp-openai  # Test one server
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function testServer(serverDir, name) {
  return new Promise((resolveP) => {
    let done = false;

    function finish(pass) {
      if (done) return;
      done = true;
      resolveP(pass);
    }

    const serverPath = resolve(ROOT, serverDir, "server.js");
    const proc = spawn("node", [serverPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CODEX_HOME: "/tmp/mcp-smoke-test" },
    });

    let stdout = "";
    let responses = [];
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
      const lines = stdout.split("\n");
      stdout = lines.pop();
      for (const line of lines) {
        if (line.trim()) {
          try { responses.push(JSON.parse(line)); } catch {}
        }
      }
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    function send(msg) {
      proc.stdin.write(JSON.stringify(msg) + "\n");
    }

    send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "1.0.0" },
      },
    });

    setTimeout(() => {
      if (done) return;
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

      setTimeout(() => {
        if (done) return;
        proc.kill();

        const initResp = responses.find(r => r.id === 1);
        const toolsResp = responses.find(r => r.id === 2);
        const tools = toolsResp?.result?.tools || [];
        const pass = !!(initResp?.result && toolsResp?.result && tools.length > 0);

        console.log(`${pass ? "PASS" : "FAIL"} ${name}`);
        console.log(`  Server: ${initResp?.result?.serverInfo?.name || "?"} v${initResp?.result?.serverInfo?.version || "?"}`);
        console.log(`  Tools: ${tools.map(t => t.name).join(", ") || "none"}`);
        if (!pass) {
          console.log(`  Stderr: ${stderr.trim().split("\n")[0]}`);
        }
        console.log();

        finish(pass);
      }, 2000);
    }, 2000);

    // Safety timeout
    setTimeout(() => {
      proc.kill();
      if (!done) {
        console.log(`FAIL ${name} (timeout)\n`);
        finish(false);
      }
    }, 10000);
  });
}

async function main() {
  const specific = process.argv[2];

  const servers = specific
    ? [{ dir: specific, name: specific.split("/").pop() }]
    : [
        { dir: "servers/mcp-openai", name: "mcp-openai" },
        { dir: "servers/mcp-gemini", name: "mcp-gemini" },
        { dir: "servers/mcp-qwen", name: "mcp-qwen" },
      ];

  console.log("MCP Server Smoke Tests\n");

  let allPassed = true;
  for (const { dir, name } of servers) {
    const passed = await testServer(dir, name);
    if (!passed) allPassed = false;
  }

  console.log(allPassed ? "All tests passed." : "Some tests failed.");
  process.exit(allPassed ? 0 : 1);
}

main();
