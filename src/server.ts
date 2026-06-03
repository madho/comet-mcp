import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  activateScript,
  activeTabScript,
  executeJsScript,
  explainOsascriptError,
  isHttpOrHttpsUrl,
  openUrlScript,
  OsascriptError,
  parseActiveTab,
  runAppleScript,
  versionScript,
  windowCountScript,
} from "./applescript.js";

/** The MCP tool result shape we return everywhere. */
type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

function fail(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Run a script and convert any failure into an actionable tool error rather
 * than throwing — MCP clients render `isError` results inline for the model.
 */
async function runTool(
  script: string,
  format: (stdout: string) => string,
): Promise<ToolResult> {
  try {
    const stdout = await runAppleScript(script);
    return ok(format(stdout));
  } catch (error) {
    if (error instanceof OsascriptError) {
      const guidance = explainOsascriptError(error.stderr);
      const detail = error.stderr.trim() || error.message.trim();
      return fail(guidance ? `${guidance}\n\n(osascript: ${detail})` : `osascript failed: ${detail}`);
    }
    return fail(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Build the configured MCP server (transport is connected by the caller). */
export function createServer(): McpServer {
  const server = new McpServer({
    name: "comet-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "comet_version",
    {
      title: "Comet version",
      description: "Return the version of the installed Perplexity Comet browser.",
      inputSchema: {},
    },
    () => runTool(versionScript(), (v) => `Comet version: ${v}`),
  );

  server.registerTool(
    "comet_activate",
    {
      title: "Activate Comet",
      description: "Bring Comet to the foreground, launching it if it is not already running.",
      inputSchema: {},
    },
    () => runTool(activateScript(), () => "Comet activated."),
  );

  server.registerTool(
    "comet_open_url",
    {
      title: "Open URL in Comet",
      description:
        "Open a URL in Comet. Launches Comet and opens a window if none exists. " +
        "Only http and https URLs are allowed.",
      inputSchema: {
        url: z
          .string()
          .url("Provide an absolute URL including a scheme, e.g. https://example.com")
          .refine(isHttpOrHttpsUrl, "Only http and https URLs are allowed."),
      },
    },
    ({ url }) => runTool(openUrlScript(url), () => `Opened ${url} in Comet.`),
  );

  server.registerTool(
    "comet_window_count",
    {
      title: "Comet window count",
      description: "Return the number of open Comet windows.",
      inputSchema: {},
    },
    () => runTool(windowCountScript(), (n) => `Open Comet windows: ${n}`),
  );

  server.registerTool(
    "comet_get_active_tab",
    {
      title: "Get active Comet tab",
      description:
        "Return the URL and title of the active tab of Comet's front window. " +
        "Requires at least one open window.",
      inputSchema: {},
    },
    () =>
      runTool(activeTabScript(), (stdout) => {
        const { url, title } = parseActiveTab(stdout);
        return JSON.stringify({ url, title }, null, 2);
      }),
  );

  server.registerTool(
    "comet_execute_js",
    {
      title: "Execute JavaScript in Comet",
      description:
        "Execute JavaScript in the active tab of Comet's front window and return its result. " +
        "PREREQUISITE: enable View ▸ Developer ▸ Allow JavaScript from Apple Events in Comet, " +
        "otherwise this fails with a permissions error.",
      inputSchema: {
        javascript: z.string().min(1, "Provide a non-empty JavaScript snippet to run."),
      },
    },
    ({ javascript }) =>
      runTool(executeJsScript(javascript), (result) =>
        result === "" ? "(no result returned)" : result,
      ),
  );

  return server;
}
