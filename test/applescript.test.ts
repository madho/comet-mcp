import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeTabScript,
  COMET_APP_NAME,
  executeJsScript,
  explainOsascriptError,
  isHttpOrHttpsUrl,
  openUrlScript,
  parseActiveTab,
  quoteAppleScriptString,
  versionScript,
  windowCountScript,
} from "../src/applescript.ts";

test("quoteAppleScriptString wraps a plain string in double quotes", () => {
  assert.equal(quoteAppleScriptString("hello"), '"hello"');
});

test("quoteAppleScriptString escapes embedded double quotes", () => {
  assert.equal(quoteAppleScriptString('say "hi"'), '"say \\"hi\\""');
});

test("quoteAppleScriptString escapes backslashes before quotes", () => {
  // A literal backslash must become two; a quote must be escaped once.
  assert.equal(quoteAppleScriptString('a\\b"c'), '"a\\\\b\\"c"');
});

test("quoteAppleScriptString escapes CR and LF", () => {
  assert.equal(quoteAppleScriptString("line1\nline2\r"), '"line1\\nline2\\r"');
});

test("quoteAppleScriptString is injection-safe against a terminating-quote attack", () => {
  const malicious = '"\nend tell\ntell application "Finder" to quit\n--';
  const quoted = quoteAppleScriptString(malicious);
  // Wrapped in quotes, with no raw newline able to break out of the literal.
  assert.match(quoted, /^".*"$/s);
  assert.ok(!/\n/.test(quoted), "newlines must be escaped, not literal");
});

test("isHttpOrHttpsUrl accepts http and https only", () => {
  assert.equal(isHttpOrHttpsUrl("https://example.com"), true);
  assert.equal(isHttpOrHttpsUrl("http://example.com/path?q=1"), true);
  assert.equal(isHttpOrHttpsUrl("ftp://example.com"), false);
  assert.equal(isHttpOrHttpsUrl("javascript:alert(1)"), false);
  assert.equal(isHttpOrHttpsUrl("not a url"), false);
});

test("versionScript targets the Comet application", () => {
  const script = versionScript();
  assert.ok(script.includes(`application "${COMET_APP_NAME}"`));
  assert.ok(script.includes("get version"));
});

test("openUrlScript quotes the URL and uses open location", () => {
  const script = openUrlScript("https://example.com/?a=1&b=2");
  assert.ok(script.includes('open location "https://example.com/?a=1&b=2"'));
  assert.ok(script.includes("activate"));
});

test("openUrlScript neutralizes a quote-laden URL", () => {
  const script = openUrlScript('https://x.test/"');
  assert.ok(script.includes('open location "https://x.test/\\""'));
});

test("windowCountScript counts windows", () => {
  assert.ok(windowCountScript().includes("count windows"));
});

test("activeTabScript reads url and title joined by a length prefix", () => {
  const script = activeTabScript();
  assert.ok(script.includes("URL of active tab of front window"));
  assert.ok(script.includes("title of active tab of front window"));
  assert.ok(script.includes("length of theURL"));
});

test("executeJsScript embeds the snippet and targets the active tab", () => {
  const script = executeJsScript("document.title");
  assert.ok(script.includes('execute javascript "document.title"'));
  assert.ok(script.includes("active tab of front window"));
});

test("executeJsScript escapes a snippet containing quotes and newlines", () => {
  const script = executeJsScript('console.log("hi")\nreturn 1');
  assert.ok(
    script.includes('execute javascript "console.log(\\"hi\\")\\nreturn 1"'),
  );
});

test("parseActiveTab splits url and title using a length prefix", () => {
  const url = "https://example.com";
  const out = `${url.length}:${url}Example Domain`;
  assert.deepEqual(parseActiveTab(out), {
    url,
    title: "Example Domain",
  });
});

test("parseActiveTab strips a trailing newline from osascript", () => {
  const url = "https://a.test";
  const out = `${url.length}:${url}Title\n`;
  assert.deepEqual(parseActiveTab(out), { url, title: "Title" });
});

test("parseActiveTab tolerates a title with spaces and symbols", () => {
  const url = "https://a.test/p?q=1";
  const out = `${url.length}:${url}A | B — C: D`;
  assert.deepEqual(parseActiveTab(out), {
    url,
    title: "A | B — C: D",
  });
});

test("parseActiveTab treats malformed output as url-only", () => {
  assert.deepEqual(parseActiveTab("https://a.test"), {
    url: "https://a.test",
    title: "",
  });
});

test("explainOsascriptError flags the JavaScript-from-Apple-Events prerequisite", () => {
  const msg = explainOsascriptError(
    "execution error: Comet got an error: AppleEvent handler failed. (-2700)",
  );
  assert.ok(msg);
  assert.match(msg, /Allow JavaScript from Apple Events/);
});

test("explainOsascriptError flags automation permission denial (-1743)", () => {
  const msg = explainOsascriptError(
    "execution error: Not authorized to send Apple events to Comet. (-1743)",
  );
  assert.ok(msg);
  assert.match(msg, /Automation/);
});

test("explainOsascriptError flags an app-not-running error (-600)", () => {
  const msg = explainOsascriptError("execution error: Comet isn’t running. (-600)");
  assert.ok(msg);
  assert.match(msg, /not running/);
});

test("explainOsascriptError flags a missing front window (-1728)", () => {
  const msg = explainOsascriptError(
    "execution error: Comet got an error: Can’t get active tab of front window. (-1728)",
  );
  assert.ok(msg);
  assert.match(msg, /window/i);
});

test("explainOsascriptError flags a missing application (-10814)", () => {
  const msg = explainOsascriptError(
    "execution error: An error of type -10814 has occurred.",
  );
  assert.ok(msg);
  assert.match(msg, /installed|found/i);
});

test("explainOsascriptError returns null for an unrecognized error", () => {
  assert.equal(explainOsascriptError("some unrelated failure"), null);
});
