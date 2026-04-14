/**
 * OpenCLAW Agent Workspace Resolution
 *
 * Resolves agent identities from incoming requests and maps them
 * to host-accessible workspace paths. Agent list is loaded from
 * the config system (auto-discovered from openclaw.json or manual).
 */

import type { AgentConfig, ProxyConfig } from "./config.js";

let cachedConfig: ProxyConfig | null = null;

/**
 * Initialize the workspace module with the loaded config.
 * Must be called once at startup.
 */
export function initWorkspaces(config: ProxyConfig): void {
  cachedConfig = config;
  if (config.workspace.enabled) {
    const agents = config.workspace.agents;
    console.error(`[workspaces] Workspace access enabled for ${agents.length} agent(s): ${agents.map(a => a.id).join(", ")}`);
  } else {
    console.error("[workspaces] Workspace access disabled (no agents configured)");
  }
}

/**
 * Resolve an agent ID to its host-accessible workspace path.
 * Returns null if the agent is unknown or workspaces are disabled.
 */
export function resolveWorkspace(agentId: string | null): string | null {
  if (!agentId || !cachedConfig?.workspace.enabled) return null;

  const id = agentId.toLowerCase().trim();
  const agent = cachedConfig.workspace.agents.find(
    a => a.id.toLowerCase() === id
  );

  return agent?.workspace ?? null;
}

/**
 * Get the container-equivalent path for an agent.
 * Used to tell the LLM about path equivalences.
 */
export function getContainerPath(agentId: string): string {
  if (!cachedConfig) return `/home/node/.openclaw/workspace-${agentId}`;

  const id = agentId.toLowerCase().trim();
  const agent = cachedConfig.workspace.agents.find(
    a => a.id.toLowerCase() === id
  );

  return agent?.containerPath ?? `/home/node/.openclaw/workspace-${agentId}`;
}

/**
 * Get the configured tools string.
 */
export function getToolsString(): string {
  return cachedConfig?.workspace.tools ?? "Read,Write,Edit,Bash,Glob,Grep";
}

/**
 * Extract agent identity from an OpenAI messages array.
 *
 * Looks for agent identity in:
 * 1. The "user" field of the request
 * 2. System/developer messages (patterns like "You are Piper", "name: Piper")
 */
export function extractAgentId(
  messages: Array<{ role: string; content: unknown }>,
  user?: string
): string | null {
  if (!cachedConfig?.workspace.enabled) return null;

  const agentIds = cachedConfig.workspace.agents.map(a => a.id.toLowerCase());
  const agentNames = cachedConfig.workspace.agents.map(a => (a.name || a.id).toLowerCase());

  // 1. Check the "user" field
  if (user) {
    const lower = user.toLowerCase();
    for (let i = 0; i < agentIds.length; i++) {
      if (lower === agentIds[i] || lower.includes(agentIds[i])) return agentIds[i];
      if (agentNames[i] && (lower === agentNames[i] || lower.includes(agentNames[i]))) return agentIds[i];
    }
  }

  // 2. Scan system messages for agent identity
  for (const msg of messages) {
    if (msg.role !== "system" && msg.role !== "developer") continue;

    const text = typeof msg.content === "string"
      ? msg.content
      : Array.isArray(msg.content)
        ? (msg.content as Array<{ type: string; text?: string }>)
            .filter(p => p.type === "text" && p.text)
            .map(p => p.text)
            .join("\n")
        : "";

    if (!text) continue;

    // Match patterns like "You are Piper", "name: Piper", "agent: piper"
    for (let i = 0; i < agentIds.length; i++) {
      const name = cachedConfig.workspace.agents[i].name || cachedConfig.workspace.agents[i].id;
      const patterns = [
        new RegExp(`\\bYou are ${name}\\b`, "i"),
        new RegExp(`\\bname:\\s*["']?${name}["']?`, "i"),
        new RegExp(`\\bidentity[^:]*:\\s*["']?${name}["']?`, "i"),
        new RegExp(`\\bagent[^:]*:\\s*["']?${name}["']?`, "i"),
      ];
      if (patterns.some(p => p.test(text))) return agentIds[i];
    }
  }

  return null;
}
