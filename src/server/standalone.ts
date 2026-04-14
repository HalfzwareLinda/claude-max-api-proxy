#!/usr/bin/env node
/**
 * Standalone server entry point
 *
 * Usage:
 *   npm run start
 *   node dist/server/standalone.js [port]
 *   claude-max-api [port]
 */

import { startServer, stopServer } from "./index.js";
import { verifyClaude, verifyAuth } from "../subprocess/manager.js";
import { loadConfig } from "../config/config.js";
import { initWorkspaces } from "../config/workspaces.js";

async function main(): Promise<void> {
  console.log("Claude Max API Proxy");
  console.log("====================\n");

  // Load configuration
  const config = loadConfig();

  // CLI port argument overrides config
  if (process.argv[2]) {
    const cliPort = parseInt(process.argv[2], 10);
    if (!isNaN(cliPort) && cliPort >= 1 && cliPort <= 65535) {
      config.port = cliPort;
    } else {
      console.error(`Invalid port: ${process.argv[2]}`);
      process.exit(1);
    }
  }

  // Initialize workspace/agent resolution
  initWorkspaces(config);

  // Verify Claude CLI
  console.log("Checking Claude CLI...");
  const cliCheck = await verifyClaude();
  if (!cliCheck.ok) {
    console.error(`Error: ${cliCheck.error}`);
    process.exit(1);
  }
  console.log(`  Claude CLI: ${cliCheck.version || "OK"}`);

  // Verify authentication
  console.log("Checking authentication...");
  const authCheck = await verifyAuth();
  if (!authCheck.ok) {
    console.error(`Error: ${authCheck.error}`);
    console.error("Please run: claude auth login");
    process.exit(1);
  }
  console.log("  Authentication: OK");

  // Show workspace status
  if (config.workspace.enabled) {
    console.log(`  Workspaces: ${config.workspace.agents.length} agent(s) configured`);
  } else {
    console.log("  Workspaces: disabled (no agents found)");
  }
  console.log();

  // Start server
  try {
    await startServer({ port: config.port, host: config.host });
    console.log(`\nServer ready at http://${config.host}:${config.port}`);
    console.log("\nTest with:");
    console.log(`  curl -X POST http://localhost:${config.port}/chat/completions \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -d '{"model": "claude-opus-4", "messages": [{"role": "user", "content": "Hello!"}]}'`);
    console.log("\nPress Ctrl+C to stop.\n");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log("\nShutting down...");
    await stopServer();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
