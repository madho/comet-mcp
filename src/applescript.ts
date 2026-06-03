import { execFile } from "node:child_process";

/**
 * The macOS application name used in every `tell application "…"` block.
 * Comet registers under the plain name "Comet".
 */
export const COMET_APP_NAME = "Comet";

/**
 * Quote an arbitrary JavaScript string so it is safe to embed inside an
 * AppleScript string literal.
 *
 * AppleScript string literals are double-quoted and use backslash escaping,
 * so only backslash and double-quote need to be escaped. Carriage returns and
 * newlines are converted to escaped sequences so generated scripts stay on a
 * single logical line.
 */
export function quoteAppleScriptString(value: string): string {
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
}

/** Script: read the running Comet version. */
export function versionScript(): string {
  return `tell application ${quoteAppleScriptString(COMET_APP_NAME)} to get version`;
}

/** Script: bring Comet to the foreground, launching it if necessary. */
export function activateScript(): string {
  return `tell application ${quoteAppleScriptString(COMET_APP_NAME)} to activate`;
}

/**
 * Script: open a URL in Comet. `open location` reliably opens a window
 * (or a tab in the front window) and launches Comet if it is not running.
 */
export function openUrlScript(url: string): string {
  return [
    `tell application ${quoteAppleScriptString(COMET_APP_NAME)}`,
    `  activate`,
    `  open location ${quoteAppleScriptString(url)}`,
    `end tell`,
  ].join("\n");
}

/** Script: count the number of open Comet windows. */
export function windowCountScript(): string {
  return `tell application ${quoteAppleScriptString(COMET_APP_NAME)} to count windows`;
}

/**
 * Script: read the URL and title of the active tab of the front window,
 * packed into a single line with a length prefix so the URL can be parsed
 * unambiguously even when the title contains spaces, punctuation, or colons.
 */
export function activeTabScript(): string {
  return [
    `tell application ${quoteAppleScriptString(COMET_APP_NAME)}`,
    `  set theURL to URL of active tab of front window`,
    `  set theTitle to title of active tab of front window`,
    `  return ((length of theURL) as text) & ":" & theURL & theTitle`,
    `end tell`,
  ].join("\n");
}

/**
 * Script: execute JavaScript in the active tab of the front window.
 *
 * NOTE: This requires the user to enable
 *   View ▸ Developer ▸ Allow JavaScript from Apple Events
 * in Comet. Without it, AppleScript raises error -2700 / "not allowed".
 */
export function executeJsScript(js: string): string {
  return [
    `tell application ${quoteAppleScriptString(COMET_APP_NAME)}`,
    `  tell active tab of front window`,
    `    execute javascript ${quoteAppleScriptString(js)}`,
    `  end tell`,
    `end tell`,
  ].join("\n");
}

/** Parsed result of {@link activeTabScript}. */
export interface ActiveTab {
  url: string;
  title: string;
}

/**
 * Parse the packed `LEN:URLTITLE` line produced by {@link activeTabScript}.
 * Any trailing newline appended by `osascript` is stripped here.
 */
export function parseActiveTab(output: string): ActiveTab {
  const trimmed = output.replace(/\n$/, "");
  const index = trimmed.indexOf(":");
  if (index === -1) {
    return { url: trimmed, title: "" };
  }
  const declaredLength = Number.parseInt(trimmed.slice(0, index), 10);
  if (!Number.isFinite(declaredLength) || declaredLength < 0) {
    return { url: trimmed, title: "" };
  }
  const start = index + 1;
  return {
    url: trimmed.slice(start, start + declaredLength),
    title: trimmed.slice(start + declaredLength),
  };
}

/** Return true only for absolute http/https URLs. */
export function isHttpOrHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Error thrown when `osascript` exits non-zero, carrying its stderr. */
export class OsascriptError extends Error {
  readonly stderr: string;
  readonly code: number | null;

  constructor(message: string, stderr: string, code: number | null) {
    super(message);
    this.name = "OsascriptError";
    this.stderr = stderr;
    this.code = code;
  }
}

/**
 * Classify a raw `osascript` stderr string into an actionable, human-readable
 * message. Returns null when no specific guidance applies.
 */
export function explainOsascriptError(stderr: string): string | null {
  const s = stderr.toLowerCase();

  if (
    s.includes("-1743") ||
    s.includes("not authorized") ||
    s.includes("not allowed to send apple events")
  ) {
    return (
      "macOS has not granted permission to control Comet. Approve the " +
      "Automation prompt, or enable it under System Settings ▸ Privacy & " +
      "Security ▸ Automation for the app running this MCP server."
    );
  }
  if (s.includes("-2700") || (s.includes("javascript") && s.includes("not allowed"))) {
    return (
      "Comet refused to run JavaScript via Apple Events. Enable it in Comet: " +
      "View ▸ Developer ▸ Allow JavaScript from Apple Events, then retry."
    );
  }
  if (
    s.includes("-600") ||
    s.includes("application isn") ||
    s.includes("isn’t running") ||
    s.includes("isn't running")
  ) {
    return "Comet is not running. Call comet_activate or comet_open_url first.";
  }
  if (
    s.includes("-1728") ||
    s.includes("can’t get") ||
    s.includes("can't get") ||
    s.includes("front window")
  ) {
    return (
      "No Comet window is available. Open one with comet_open_url (or " +
      "comet_activate) before reading the active tab."
    );
  }
  if (
    s.includes("-10814") ||
    s.includes("-10810") ||
    s.includes("application can’t be found") ||
    s.includes("can't be found")
  ) {
    return (
      "Comet does not appear to be installed (the app could not be found). " +
      "Install Perplexity Comet and try again."
    );
  }
  return null;
}

/**
 * Run an AppleScript via `osascript` and return its stdout with any single
 * trailing newline stripped. Throws {@link OsascriptError} on failure.
 */
export function runAppleScript(
  script: string,
  options: { timeoutMs?: number } = {},
): Promise<string> {
  const { timeoutMs = 15_000 } = options;
  return new Promise((resolve, reject) => {
    execFile(
      "osascript",
      ["-e", script],
      { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const code = typeof error.code === "number" ? error.code : null;
          reject(new OsascriptError(error.message, String(stderr ?? ""), code));
          return;
        }
        resolve(String(stdout ?? "").replace(/\n$/, ""));
      },
    );
  });
}
