# Claude Max API Proxy

**Use your Claude Max subscription ($200/month) with any OpenAI-compatible client — no separate API costs!**

This provider wraps the Claude Code CLI as a subprocess and exposes an OpenAI-compatible HTTP API, allowing tools like OpenCLAW, Continue.dev, or any OpenAI-compatible client to use your Claude Max subscription instead of paying per-API-call.

> **This is a fork of [`mnemon-dev/claude-max-api-proxy`](https://github.com/mnemon-dev/claude-max-api-proxy)** with fixes for OpenCLAW compatibility and workspace tool access for agents. Install from this fork until the [upstream PR](https://github.com/mnemon-dev/claude-max-api-proxy/pull/1) is merged.

## What This Fork Adds

On top of the upstream proxy, this fork provides:

1. **Missing `/chat/completions` route** — OpenCLAW's `openai-completions` provider omits the `/v1` prefix. This fork registers both `/v1/chat/completions` and `/chat/completions`.

2. **Structured message content** — Handles OpenCLAW's array-format message content (`[{type: "text", text: "..."}]`) without corrupting it to `[object Object]`.

3. **Workspace file access for agents** — Automatically detects OpenCLAW agent identities and enables Claude CLI tools (Read, Write, Edit, Bash, Glob, Grep) against each agent's workspace directory. Agents running in Docker containers can read and write their workspace files through the proxy.

## How It Works

```
Your App (OpenCLAW, Continue.dev, etc.)
         |
    HTTP Request (OpenAI format)
         |
   Claude Max API Proxy (this project)
         |
   Claude Code CLI (subprocess, with tools if agent detected)
         |
   OAuth Token (from Max subscription)
         |
   Anthropic API
         |
   Response -> OpenAI format -> Your App
```

When an OpenCLAW agent is detected in the request, the proxy also passes `--tools` and `--add-dir` flags to the CLI subprocess, giving it read/write access to the agent's workspace directory on the host.

## Prerequisites

1. **Claude Max subscription** ($200/month) — [Subscribe here](https://claude.ai)
2. **Node.js** (v20+)
3. **Claude Code CLI** installed and authenticated:
   ```bash
   npm install -g @anthropic-ai/claude-code
   claude auth login
   ```

## Installation

### Quick install (recommended)

```bash
npm install -g github:HalfzwareLinda/claude-max-api-proxy
```

### From source

```bash
git clone https://github.com/HalfzwareLinda/claude-max-api-proxy.git
cd claude-max-api-proxy
npm install
npm run build
```

## Usage

### Start the server

```bash
# If installed globally
claude-max-api

# If built from source
npm start
```

The server runs at `http://localhost:3456` by default.

### Test it

```bash
# Health check
curl http://localhost:3456/health

# List models
curl http://localhost:3456/models

# Chat completion
curl -X POST http://localhost:3456/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Configuration

The proxy can be configured via a config file, environment variables, or auto-discovery.

### Config file

Create `proxy.config.json` in the working directory, or `~/.config/claude-max-proxy/config.json`:

```json
{
  "port": 3456,
  "host": "0.0.0.0",
  "workspace": {
    "enabled": true,
    "tools": "Read,Write,Edit,Bash,Glob,Grep",
    "agents": [
      {
        "id": "piper",
        "name": "Piper",
        "workspace": "/var/lib/docker/volumes/openclaw-config/_data/workspace-piper",
        "containerPath": "/home/node/.openclaw/workspace-piper"
      }
    ]
  }
}
```

See [`proxy.config.example.json`](proxy.config.example.json) for a full example.

**Config fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `port` | number | `3456` | Port to listen on |
| `host` | string | `"127.0.0.1"` | Bind address (`"0.0.0.0"` for Docker access) |
| `workspace.enabled` | boolean | `false` | Enable workspace tool access for agents |
| `workspace.tools` | string | `"Read,Write,Edit,Bash,Glob,Grep"` | CLI tools to enable |
| `workspace.agents` | array | `[]` | Agent-to-workspace mappings (see below) |

**Agent fields:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Agent ID (e.g. `"piper"`) |
| `name` | string | no | Display name used for detection in system messages |
| `workspace` | string | yes | Host-accessible workspace path |
| `containerPath` | string | no | Container-internal path (for prompt context) |

### Environment variables

These override the config file:

| Variable | Description |
|----------|-------------|
| `PROXY_PORT` | Port to listen on |
| `PROXY_HOST` | Bind address |
| `OPENCLAW_CONFIG_PATH` | Path to `openclaw.json` for auto-discovery |
| `OPENCLAW_VOLUME_PATH` | Docker volume base path for workspace resolution |
| `OPENCLAW_MAIN_WORKSPACE_PATH` | Host path for the "main" agent's workspace volume |

### Auto-discovery from OpenCLAW

If no agents are configured in the config file, the proxy automatically searches for `openclaw.json` in these locations:

1. `/var/lib/docker/volumes/openclaw-config/_data/openclaw.json` (Docker)
2. `~/.openclaw/openclaw.json` (native install)
3. `./openclaw.json` (current directory)

When found, it reads the agent list and translates container workspace paths to host-accessible Docker volume paths. No manual agent configuration needed.

### Priority order

1. Environment variables (highest)
2. `proxy.config.json` in working directory
3. `~/.config/claude-max-proxy/config.json`
4. Auto-discovery from `openclaw.json`
5. Built-in defaults (lowest)

## Workspace Access for Agents

When an OpenCLAW agent sends a request through the proxy, the proxy:

1. **Detects the agent** — Scans the system message for identity patterns like `"You are Piper"` or `"name: Piper"`, and checks the `user` field
2. **Resolves the workspace** — Maps the agent ID to a host-accessible directory
3. **Enables CLI tools** — Spawns `claude --print` with `--tools`, `--add-dir`, and `--dangerously-skip-permissions`
4. **Sets working directory** — The CLI subprocess runs inside the workspace directory

The CLI handles file operations internally and returns the final text result. Requests without a recognized agent identity work as before (no tools, text-only).

### How workspace paths work

OpenCLAW agents have workspace directories inside their container at paths like `/home/node/.openclaw/workspace-piper/`. These same files are accessible on the Docker host via volume mounts:

| Location | Path |
|----------|------|
| Inside container | `/home/node/.openclaw/workspace-piper/` |
| On Docker host | `/var/lib/docker/volumes/openclaw-config/_data/workspace-piper/` |

The proxy tells the Claude CLI about the host path, so it can read and write files that the container agent sees.

For **native installs** (no Docker), workspace paths are already on the local filesystem (e.g. `~/.openclaw/workspace-piper/`) and no translation is needed.

## Configuration with OpenCLAW

Three things must be configured in your `openclaw.json`:

### 1. Add the provider (`models.providers`)

```json
{
  "models": {
    "providers": {
      "claude-max": {
        "baseUrl": "http://localhost:3456",
        "apiKey": "not-needed",
        "api": "openai-completions",
        "models": [
          {
            "id": "claude-opus-4",
            "name": "Claude Opus 4 (Max Proxy)",
            "reasoning": true,
            "input": ["text", "image"],
            "contextWindow": 1000000,
            "maxTokens": 64000
          },
          {
            "id": "claude-sonnet-4",
            "name": "Claude Sonnet 4 (Max Proxy)",
            "reasoning": false,
            "input": ["text", "image"],
            "contextWindow": 1000000,
            "maxTokens": 64000
          }
        ]
      }
    }
  }
}
```

If OpenCLAW runs in Docker, use the Docker bridge IP: `"baseUrl": "http://172.17.0.1:3456"` and bind the proxy to `0.0.0.0`.

### 2. Set the default model (`agents.defaults.model`)

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "claude-max/claude-opus-4"
      }
    }
  }
}
```

### 3. Add to the models allowlist (`agents.defaults.models`)

**This step is critical and easy to miss.** Without it, OpenCLAW silently rejects the model — the proxy never receives a request and agents show `model_not_found`.

```json
{
  "agents": {
    "defaults": {
      "models": {
        "claude-max/claude-opus-4": {},
        "claude-max/claude-sonnet-4": {}
      }
    }
  }
}
```

> **Note:** Do NOT include `/v1` in the `baseUrl`. OpenCLAW appends `/chat/completions` directly.

## Running as a Service

### Linux (systemd)

Copy the example service file:

```bash
cp examples/claude-max-proxy.service ~/.config/systemd/user/claude-max-proxy.service
```

Edit it to match your paths (see comments in the file), then:

```bash
systemctl --user daemon-reload
systemctl --user enable claude-max-proxy
systemctl --user start claude-max-proxy

# Check status / follow logs
systemctl --user status claude-max-proxy
journalctl --user -u claude-max-proxy -f
```

### Docker wrapper script

If OpenCLAW runs in a Docker container, use the wrapper script which binds to `0.0.0.0`:

```bash
cp examples/claude-max-proxy-wrapper.mjs ~/.local/bin/
# Edit the PKG path in the script, then update your systemd service ExecStart
```

See [`examples/`](examples/) for the wrapper script and systemd unit file.

### macOS (launchd)

Create `~/Library/LaunchAgents/com.claude-max-proxy.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.claude-max-proxy</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/usr/local/lib/node_modules/claude-max-api-proxy/dist/server/standalone.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/claude-max-proxy.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/claude-max-proxy.err</string>
</dict>
</plist>
```

Then: `launchctl load ~/Library/LaunchAgents/com.claude-max-proxy.plist`

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` or `/models` | GET | List available models |
| `/v1/chat/completions` or `/chat/completions` | POST | Chat completions (streaming & non-streaming) |

## Available Models

| Model ID | Claude Model |
|----------|-------------|
| `claude-opus-4` | Claude Opus 4 |
| `claude-sonnet-4` | Claude Sonnet 4 |
| `claude-haiku-4` | Claude Haiku 4 |

Any unrecognized model ID defaults to Opus.

## Configuration with Other Clients

### Continue.dev

```json
{
  "models": [{
    "title": "Claude (Max)",
    "provider": "openai",
    "model": "claude-opus-4",
    "apiBase": "http://localhost:3456/v1",
    "apiKey": "not-needed"
  }]
}
```

### Python (OpenAI SDK)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3456/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="claude-opus-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

## Troubleshooting

### 404 / model_not_found

- Install from **this fork**, not the upstream
- Check `agents.defaults.models` in `openclaw.json` includes your model

### Agents can't access workspace files

- Check that workspace auto-discovery found your agents: look for `[config] Auto-discovered N agent(s)` in the proxy logs
- If auto-discovery doesn't work, create a `proxy.config.json` with explicit agent mappings
- Verify the Docker volume is readable: `ls /var/lib/docker/volumes/openclaw-config/_data/`
- For native installs, set `OPENCLAW_VOLUME_PATH` to `~/.openclaw`

### Agent hangs or times out

The default subprocess timeout is 15 minutes. Agentic tasks with tool use may take longer than text-only responses.

### Docker / container setup

1. Bind the proxy to `0.0.0.0` (use the wrapper script or set `"host": "0.0.0.0"` in config)
2. Use the Docker bridge gateway IP as `baseUrl` in openclaw.json: `http://172.17.0.1:3456`

## Architecture

```
src/
├── config/
│   ├── config.ts          # Configuration loading (file, env, auto-discovery)
│   └── workspaces.ts      # Agent identity detection & workspace resolution
├── types/
│   ├── claude-cli.ts      # Claude CLI JSON output types
│   └── openai.ts          # OpenAI API types
├── adapter/
│   ├── openai-to-cli.ts   # Convert OpenAI requests -> CLI format
│   └── cli-to-openai.ts   # Convert CLI responses -> OpenAI format
├── subprocess/
│   └── manager.ts         # Claude CLI subprocess management
├── session/
│   └── manager.ts         # Session ID mapping
├── server/
│   ├── index.ts           # Express server setup
│   ├── routes.ts          # API route handlers
│   └── standalone.ts      # Entry point
└── index.ts               # Package exports
```

## License

MIT

## Acknowledgments

- Fork of [mnemon-dev/claude-max-api-proxy](https://github.com/mnemon-dev/claude-max-api-proxy)
- Powered by [Claude Code CLI](https://github.com/anthropics/claude-code)
