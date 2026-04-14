#!/usr/bin/env node
/**
 * Example wrapper script for claude-max-api-proxy
 *
 * This wrapper:
 * - Binds to 0.0.0.0 so Docker containers can reach the proxy
 * - Uses PROXY_PORT and PROXY_HOST env vars for customization
 * - Verifies Claude CLI is installed and authenticated before starting
 *
 * Usage:
 *   node claude-max-proxy-wrapper.mjs
 *   PROXY_PORT=8080 node claude-max-proxy-wrapper.mjs
 *
 * Installation:
 *   1. Copy this file to ~/.local/bin/ (or anywhere on your PATH)
 *   2. Update PKG to point to your global install of claude-max-api-proxy
 *   3. chmod +x claude-max-proxy-wrapper.mjs
 */

// Update this path to match your global npm modules location.
// Run `npm root -g` to find it.
const PKG = process.env.PROXY_PKG_PATH
  || `${process.env.HOME}/.npm-global/lib/node_modules/claude-max-api-proxy/dist`;

const { startServer, stopServer } = await import(PKG + "/server/index.js");
const { verifyClaude, verifyAuth } = await import(PKG + "/subprocess/manager.js");
const { loadConfig } = await import(PKG + "/config/config.js");
const { initWorkspaces } = await import(PKG + "/config/workspaces.js");

const config = loadConfig();

// Override host to bind to all interfaces (needed for Docker bridge access)
config.host = process.env.PROXY_HOST || "0.0.0.0";
if (process.env.PROXY_PORT) {
  config.port = parseInt(process.env.PROXY_PORT, 10) || config.port;
}

console.log("Claude Max API Proxy (wrapper)");
console.log("==============================\n");

// Initialize workspace/agent resolution
initWorkspaces(config);

console.log("Checking Claude CLI...");
const cliCheck = await verifyClaude();
if (!cliCheck.ok) { console.error(`Error: ${cliCheck.error}`); process.exit(1); }
console.log(`  Claude CLI: ${cliCheck.version || "OK"}`);

console.log("Checking authentication...");
const authCheck = await verifyAuth();
if (!authCheck.ok) { console.error(`Error: ${authCheck.error}`); process.exit(1); }
console.log("  Authentication: OK");

if (config.workspace.enabled) {
  console.log(`  Workspaces: ${config.workspace.agents.length} agent(s)`);
}
console.log();

await startServer({ port: config.port, host: config.host });
console.log(`\nServer ready on ${config.host}:${config.port}\n`);

const shutdown = async () => { console.log("\nShutting down..."); await stopServer(); process.exit(0); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
