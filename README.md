# @hermes/comet-mcp

A small, local [Model Context Protocol](https://modelcontextprotocol.io) (MCP)
server that lets an AI agent drive the [Perplexity Comet](https://www.perplexity.ai/comet)
browser on **macOS** through AppleScript (`osascript`).

It speaks MCP over stdio and exposes six focused tools for inspecting and
controlling Comet windows and tabs.

## Tools

| Tool | Description |
| --- | --- |
| `comet_version` | Return the installed Comet version. |
| `comet_activate` | Bring Comet to the foreground (launches it if needed). |
| `comet_open_url` | Open an absolute URL in Comet (opens a window if none exists). |
| `comet_window_count` | Count open Comet windows. |
| `comet_get_active_tab` | Return the URL and title of the front window's active tab. |
| `comet_execute_js` | Run JavaScript in the active tab and return the result. |

## Requirements

- **macOS** with Perplexity Comet installed.
- **Node.js ≥ 20**.
- The first time the server controls Comet, macOS shows an **Automation**
  permission prompt — approve it. You can manage it later under
  *System Settings ▸ Privacy & Security ▸ Automation*.

## ⚠️ JavaScript prerequisite (`comet_execute_js`)

`comet_execute_js` will **fail until you enable JavaScript from Apple Events in
Comet**. This is a per-browser security switch that ships disabled.

Enable it once:

> **Comet ▸ View ▸ Developer ▸ Allow JavaScript from Apple Events**

Until that box is checked, `execute javascript` returns an Apple Events error
(`-2700`). The other five tools work without it. The server detects this case
and returns an actionable message telling you to enable the setting.

## Install

```bash
# clone, then:
npm install
npm run build
```

This compiles `src/` to `dist/`. The executable entry point is
`dist/index.js` (exposed as the `comet-mcp` bin).

## Hermes MCP configuration

Add the server to your Hermes MCP config (stdio transport):

```json
{
  "mcpServers": {
    "comet": {
      "command": "node",
      "args": ["/absolute/path/to/comet-mcp/dist/index.js"]
    }
  }
}
```

If you install it globally / from npm, you can instead use the bin name:

```json
{
  "mcpServers": {
    "comet": {
      "command": "comet-mcp"
    }
  }
}
```

## Usage examples

Once connected, an agent can call:

- `comet_open_url` with `{ "url": "https://example.com" }`
- `comet_get_active_tab` → `{ "url": "...", "title": "..." }`
- `comet_execute_js` with `{ "javascript": "document.title" }`
  *(requires the prerequisite above)*

## How it works

Each tool builds a small AppleScript and runs it via `osascript -e`. User input
(URLs, JavaScript) is escaped before being embedded in an AppleScript string
literal, so quotes and newlines cannot break out of the script. The active-tab
reader packs the URL and title around an ASCII Unit Separator (`0x1F`) so titles
containing spaces or punctuation parse unambiguously.

## Development

```bash
npm test        # run the unit tests (quoting, script building, parsing, errors)
npm run build   # type-check and emit dist/
```

Tests cover the pure helpers — AppleScript quoting/injection-safety, script
construction, active-tab parsing, and error classification — without needing
Comet installed.

## Limitations

- macOS only (depends on `osascript` and Comet's AppleScript dictionary).
- `comet_execute_js` requires the Apple Events JavaScript setting above.
- Tab/window targeting uses Comet's *front window* and *active tab*.

## License

[MIT](./LICENSE)
