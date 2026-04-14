/**
 * Proxy Configuration
 *
 * Loads configuration from (in order of priority):
 * 1. Environment variables
 * 2. proxy.config.json in the current working directory
 * 3. ~/.config/claude-max-proxy/config.json
 * 4. Built-in defaults
 */

import fs from "fs";
import path from "path";
import os from "os";

export interface AgentConfig {
  /** Agent ID (e.g. "piper") */
  id: string;
  /** Display name (e.g. "Piper") — used for identity detection in system messages */
  name?: string;
  /** Host-accessible workspace path for this agent */
  workspace: string;
  /** Container-internal workspace path (for path context in prompts) */
  containerPath?: string;
}

export interface WorkspaceConfig {
  /** Whether workspace tool access is enabled */
  enabled: boolean;
  /** Tools to enable for agents (comma-separated) */
  tools: string;
  /** Agent list — auto-discovered from openclaw.json or manually configured */
  agents: AgentConfig[];
}

export interface ProxyConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to ("127.0.0.1" for local only, "0.0.0.0" for all interfaces) */
  host: string;
  /** Workspace / agent tool access configuration */
  workspace: WorkspaceConfig;
}

const DEFAULT_CONFIG: ProxyConfig = {
  port: 3456,
  host: "127.0.0.1",
  workspace: {
    enabled: false,
    tools: "Read,Write,Edit,Bash,Glob,Grep",
    agents: [],
  },
};

/**
 * Attempt to auto-discover agents from an OpenCLAW openclaw.json file.
 *
 * Reads the agent list and translates container workspace paths to
 * host-accessible paths using the provided volume base path.
 */
function discoverAgentsFromOpenclawJson(
  openclawJsonPath: string,
  volumeBasePath: string,
  mainWorkspacePath?: string
): AgentConfig[] {
  try {
    const raw = fs.readFileSync(openclawJsonPath, "utf-8");
    const config = JSON.parse(raw);
    const agentList = config?.agents?.list;
    if (!Array.isArray(agentList)) return [];

    const agents: AgentConfig[] = [];
    for (const agent of agentList) {
      if (!agent.id) continue;

      const id = agent.id as string;
      const name = (agent.name as string) || id;
      const containerWorkspace = (agent.workspace as string) || `/home/node/.openclaw/workspace`;

      // Translate container path to host path
      let hostWorkspace: string;
      if (id === "main" || !agent.workspace) {
        // Main agent uses the separate workspace volume (or defaults)
        hostWorkspace = mainWorkspacePath || `${volumeBasePath}/workspace`;
      } else {
        // Named agents: extract the workspace-{id} suffix from container path
        const basename = path.basename(containerWorkspace);
        hostWorkspace = `${volumeBasePath}/${basename}`;
      }

      agents.push({
        id,
        name,
        workspace: hostWorkspace,
        containerPath: containerWorkspace,
      });
    }

    console.error(`[config] Auto-discovered ${agents.length} agent(s) from ${openclawJsonPath}`);
    return agents;
  } catch (err) {
    // Not an error — file may not exist in non-Docker setups
    return [];
  }
}

/**
 * Try to load a JSON config file, returning null if it doesn't exist.
 */
function loadJsonFile(filePath: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Load and merge configuration from all sources.
 */
export function loadConfig(): ProxyConfig {
  const config: ProxyConfig = { ...DEFAULT_CONFIG, workspace: { ...DEFAULT_CONFIG.workspace } };

  // --- Load config file (proxy.config.json) ---
  const configLocations = [
    path.join(process.cwd(), "proxy.config.json"),
    path.join(os.homedir(), ".config", "claude-max-proxy", "config.json"),
  ];

  let fileConfig: Record<string, unknown> | null = null;
  for (const loc of configLocations) {
    fileConfig = loadJsonFile(loc);
    if (fileConfig) {
      console.error(`[config] Loaded config from ${loc}`);
      break;
    }
  }

  if (fileConfig) {
    if (typeof fileConfig.port === "number") config.port = fileConfig.port;
    if (typeof fileConfig.host === "string") config.host = fileConfig.host;

    const ws = fileConfig.workspace as Record<string, unknown> | undefined;
    if (ws) {
      if (typeof ws.enabled === "boolean") config.workspace.enabled = ws.enabled;
      if (typeof ws.tools === "string") config.workspace.tools = ws.tools;
      if (Array.isArray(ws.agents)) {
        config.workspace.agents = ws.agents as AgentConfig[];
      }
    }
  }

  // --- Environment variable overrides ---
  if (process.env.PROXY_PORT) {
    config.port = parseInt(process.env.PROXY_PORT, 10) || config.port;
  }
  if (process.env.PROXY_HOST) {
    config.host = process.env.PROXY_HOST;
  }

  // --- Auto-discover agents from OpenCLAW if no agents configured yet ---
  if (config.workspace.agents.length === 0) {
    const openclawJson = process.env.OPENCLAW_CONFIG_PATH
      || findOpenclawJson();

    const volumeBase = process.env.OPENCLAW_VOLUME_PATH
      || "/var/lib/docker/volumes/openclaw-config/_data";

    const mainWorkspace = process.env.OPENCLAW_MAIN_WORKSPACE_PATH
      || "/var/lib/docker/volumes/openclaw-workspace/_data";

    if (openclawJson) {
      const discovered = discoverAgentsFromOpenclawJson(openclawJson, volumeBase, mainWorkspace);
      if (discovered.length > 0) {
        config.workspace.agents = discovered;
        config.workspace.enabled = true;
      }
    }
  }

  // If agents are configured (manually or auto-discovered), enable workspace access
  if (config.workspace.agents.length > 0) {
    config.workspace.enabled = true;
  }

  return config;
}

/**
 * Search common locations for openclaw.json
 */
function findOpenclawJson(): string | null {
  const candidates = [
    // Docker volume path (most common for containerized OpenCLAW)
    "/var/lib/docker/volumes/openclaw-config/_data/openclaw.json",
    // Native install paths
    path.join(os.homedir(), ".openclaw", "openclaw.json"),
    // Current directory (for development)
    path.join(process.cwd(), "openclaw.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}
