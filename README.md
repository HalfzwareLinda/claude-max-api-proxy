# Claude Max API Proxy

**Use your Claude Max subscription ($200/month) with any OpenAI-compatible client — no separate API costs!**

This provider wraps the Claude Code CLI as a subprocess and exposes an OpenAI-compatible HTTP API, allowing tools like OpenCLAW, Continue.dev, or any OpenAI-compatible client to use your Claude Max subscription instead of paying per-API-call.

> **This is a fork of [`mnemon-dev/claude-max-api-proxy`](https://github.com/mnemon-dev/claude-max-api-proxy)** with fixes for OpenCLAW compatibility. See [What this fork fixes](#what-this-fork-fixes) below. Install from this fork until the [upstream PR](https://github.com/mnemon-dev/claude-max-api-proxy/pull/1) is merged.

## What This Fork Fixes

The upstream proxy has two issues when used with OpenCLAW:

1. **Missing `/chat/completions` route** — OpenCLAW's `openai-completions` provider appends `/chat/completions` to the base URL without a `/v1` prefix. The upstream proxy only registers `/v1/chat/completions`, so every request returns 404. This fork registers both paths.

2. **`[object Object]` in messages** — OpenCLAW sends message content as structured arrays (`[{type: "text", text: "..."}]`). The upstream's compiled `dist/` is out of date and doesn't include the `extractContentText()` function that already exists in the TypeScript source. This fork ships a current build.

## Why This Exists

| Approach | Cost | Limitation |
|----------|------|------------|
| Claude API | ~$15/M input, ~$75/M output tokens | Pay per use |
| Claude Max | $200/month flat | OAuth blocked for third-party API use |
| **This Proxy** | $0 extra (uses Max subscription) | Routes through CLI |

Anthropic blocks OAuth tokens from being used directly with third-party API clients. However, the Claude Code CLI *can* use OAuth tokens. This proxy bridges that gap by wrapping the CLI and exposing a standard API.

## How It Works

```
Your App (OpenCLAW, Continue.dev, etc.)
         |
    HTTP Request (OpenAI format)
         |
   Claude Max API Proxy (this project)
         |
   Claude Code CLI (subprocess)
         |
   OAuth Token (from Max subscription)
         |
   Anthropic API
         |
   Response -> OpenAI format -> Your App
```

## Features

- **OpenAI-compatible API** — Works with any client that supports OpenAI's chat completions format
- **Streaming support** — Real-time token streaming via Server-Sent Events
- **Multiple models** — Claude Opus, Sonnet, and Haiku
- **Flexible routing** — Both `/v1/chat/completions` and `/chat/completions` work
- **Session management** — Maintains conversation context
- **Zero configuration** — Uses existing Claude CLI authentication
- **Secure by design** — Uses `spawn()` to prevent shell injection

## Prerequisites

1. **Claude Max subscription** ($200/month) — [Subscribe here](https://claude.ai)
2. **Node.js** (v18+)
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
claude-max-api    # or: node $(npm root -g)/claude-max-api-proxy/dist/server/standalone.js

# If built from source
node dist/server/standalone.js
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

# Streaming
curl -N -X POST http://localhost:3456/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-opus-4",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/v1/models` | GET | List available models |
| `/models` | GET | List available models (alias) |
| `/v1/chat/completions` | POST | Chat completions (streaming & non-streaming) |
| `/chat/completions` | POST | Chat completions (alias) |

Both `/v1/...` and `/...` paths work identically.

## Available Models

| Model ID | Claude Model |
|----------|-------------|
| `claude-opus-4` | Claude Opus 4 |
| `claude-sonnet-4` | Claude Sonnet 4 |
| `claude-haiku-4` | Claude Haiku 4 |

Any unrecognized model ID defaults to Opus.

## Configuration with OpenCLAW

Three things must be configured in your `openclaw.json`. Missing any one of them will cause silent failures.

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

**This step is critical and easy to miss.** Without it, OpenCLAW silently rejects the model internally — the proxy never receives a request and the agent shows a `model_not_found` error.

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

> **Note:** Do NOT include `/v1` in the `baseUrl`. OpenCLAW appends `/chat/completions` directly to the base URL.

## Configuration with Continue.dev

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

## Configuration with Python (OpenAI SDK)

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

## Running as a Service

### Linux (systemd)

Create `~/.config/systemd/user/claude-max-proxy.service`:

```ini
[Unit]
Description=Claude Max API Proxy
After=network.target

[Service]
ExecStart=/usr/bin/node %h/.npm-global/lib/node_modules/claude-max-api-proxy/dist/server/standalone.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
Environment=PATH=%h/.npm-global/bin:%h/.local/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=default.target
```

Then enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable claude-max-proxy
systemctl --user start claude-max-proxy

# Check status
systemctl --user status claude-max-proxy

# Follow logs
journalctl --user -u claude-max-proxy -f
```

> **Note:** Adjust the `ExecStart` path if you installed Node.js or the package in a different location. Run `npm root -g` to find your global modules path.

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

Then load:

```bash
launchctl load ~/Library/LaunchAgents/com.claude-max-proxy.plist
```

> **Note:** Adjust paths to match your Node.js installation. Run `which node` and `npm root -g` to find the correct paths.

## Troubleshooting

### 404 / model_not_found

- Make sure you installed from **this fork**, not the upstream. The upstream only registers `/v1/chat/completions`.
- Check that `agents.defaults.models` in `openclaw.json` includes `"claude-max/claude-opus-4": {}`. Without this, OpenCLAW rejects the model internally before ever contacting the proxy.

### [object Object] in messages

You're running the upstream version with a stale `dist/` build. Reinstall from this fork:

```bash
npm uninstall -g claude-max-api-proxy
npm install -g github:HalfzwareLinda/claude-max-api-proxy
```

### Agent doesn't respond (hangs forever)

1. Check the proxy is running: `curl http://localhost:3456/health`
2. Check Claude CLI auth: `claude auth status`
3. Test the proxy directly:
   ```bash
   curl -X POST http://localhost:3456/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"claude-opus-4","messages":[{"role":"user","content":"hi"}],"max_tokens":10}'
   ```

### Docker / container setup

If OpenCLAW runs in a Docker container and the proxy runs on the host:

1. Bind the proxy to `0.0.0.0` instead of `127.0.0.1` (create a wrapper script or set `HOST=0.0.0.0`)
2. Use the Docker bridge gateway IP as `baseUrl`: `http://172.17.0.1:3456`

### "Claude CLI not found"

Install and authenticate the CLI:

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

## Architecture

```
src/
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

## Security

- Uses Node.js `spawn()` instead of shell execution to prevent injection attacks
- No API keys stored or transmitted by this proxy
- All authentication handled by Claude CLI's secure keychain storage
- Prompts passed as CLI arguments, not through shell interpretation

## License

MIT

## Acknowledgments

- Fork of [mnemon-dev/claude-max-api-proxy](https://github.com/mnemon-dev/claude-max-api-proxy)
- Powered by [Claude Code CLI](https://github.com/anthropics/claude-code)
