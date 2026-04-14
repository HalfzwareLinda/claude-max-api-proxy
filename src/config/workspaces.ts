/**
 * OpenCLAW Agent Workspace Resolution
 *
 * Maps agent identities to their host-accessible workspace paths.
 * When OpenCLAW runs in Docker, workspace files live in Docker volumes
 * that are accessible on the host at /var/lib/docker/volumes/...
 * When running natively, workspaces are at ~/.openclaw/workspace-{agent}/
 */

// Environment-configurable base path for OpenCLAW workspaces
// Docker: /var/lib/docker/volumes/openclaw-config/_data
// Native: ~/.openclaw (or wherever OpenCLAW stores data)
const VOLUME_BASE = process.env.OPENCLAW_VOLUME_PATH
  || "/var/lib/docker/volumes/openclaw-config/_data";

// Separate volume for the "main" agent's workspace (Docker only)
const MAIN_WORKSPACE = process.env.OPENCLAW_MAIN_WORKSPACE_PATH
  || "/var/lib/docker/volumes/openclaw-workspace/_data";

// Known agent IDs
const AGENT_IDS = ["main", "james", "reese", "nate", "max", "sage", "piper"];

/**
 * Resolve an agent ID to its host-accessible workspace path.
 * Returns null if the agent is unknown.
 */
export function resolveWorkspace(agentId: string | null): string | null {
  if (!agentId) return null;

  const id = agentId.toLowerCase().trim();

  if (id === "main" || id === "default") {
    return MAIN_WORKSPACE;
  }

  if (AGENT_IDS.includes(id)) {
    return `${VOLUME_BASE}/workspace-${id}`;
  }

  // Unknown agent — try workspace-{id} anyway (forward-compatible)
  return `${VOLUME_BASE}/workspace-${id}`;
}

/**
 * Extract agent identity from an OpenAI messages array.
 *
 * OpenCLAW embeds agent identity in the system prompt. We look for patterns like:
 *   - "You are Piper" / "name: Piper" / "identity: Piper"
 *   - Agent ID in the user field
 */
export function extractAgentId(
  messages: Array<{ role: string; content: unknown }>,
  user?: string
): string | null {
  // 1. Check the "user" field (OpenCLAW may put agent ID here)
  if (user) {
    const lower = user.toLowerCase();
    for (const id of AGENT_IDS) {
      if (lower === id || lower.includes(id)) return id;
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

    // Match patterns like "You are Piper", "name: Piper", "identity.name: Piper"
    for (const id of AGENT_IDS) {
      const patterns = [
        new RegExp(`\\bYou are ${id}\\b`, "i"),
        new RegExp(`\\bname:\\s*["']?${id}["']?`, "i"),
        new RegExp(`\\bidentity[^:]*:\\s*["']?${id}["']?`, "i"),
        new RegExp(`\\bagent[^:]*:\\s*["']?${id}["']?`, "i"),
      ];
      if (patterns.some(p => p.test(text))) return id;
    }
  }

  return null;
}

/**
 * Get the container-equivalent path for a host workspace path.
 * Used to tell the LLM about path equivalences.
 */
export function getContainerPath(agentId: string): string {
  const id = agentId.toLowerCase().trim();
  if (id === "main" || id === "default") {
    return "/home/node/.openclaw/workspace";
  }
  return `/home/node/.openclaw/workspace-${id}`;
}

export { VOLUME_BASE, MAIN_WORKSPACE, AGENT_IDS };
