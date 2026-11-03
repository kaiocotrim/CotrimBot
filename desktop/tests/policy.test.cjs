const test = require("node:test");
const assert = require("node:assert/strict");
const { parseServerUrl, isServerUrl, isExternalUrl, canRequestPermission } = require("../policy.cjs");
const server = "https://cotrim.infordoc.net/";

test("production server requires HTTPS; development allows only loopback HTTP", () => {
  assert.equal(parseServerUrl(server), server);
  for (const url of ["http://cotrim.infordoc.net", "file:///C:/Windows", "javascript:alert(1)", "https://user:pass@cotrim.infordoc.net"]) {
    assert.throws(() => parseServerUrl(url));
  }
  assert.equal(parseServerUrl("http://127.0.0.1:3000", true), "http://127.0.0.1:3000/");
  assert.throws(() => parseServerUrl("http://example.com", true));
});

test("navigation trusts exact server origin, never lookalike hosts or credentials", () => {
  assert.ok(isServerUrl(`${server}dashboard/?view=chat`, server));
  for (const url of ["https://cotrim.infordoc.net.evil.test", "https://cotrim.infordoc.net@evil.test", "https://user@cotrim.infordoc.net", "http://cotrim.infordoc.net", "https://cotrim.infordoc.net:444", "blob:https://cotrim.infordoc.net/id", "not a url"]) {
    assert.equal(isServerUrl(url, server), false, url);
  }
});

test("external links cannot launch local files, scripts, or custom programs", () => {
  assert.ok(isExternalUrl("https://example.com/file.pdf"));
  assert.ok(isExternalUrl("mailto:support@example.com"));
  for (const url of ["file:///C:/Windows/system32/cmd.exe", "javascript:alert(1)", "ms-settings:privacy", "data:text/html,test", "https://user:password@example.com"]) {
    assert.equal(isExternalUrl(url), false);
  }
});

test("only notifications and audio recording can request permission", () => {
  assert.ok(canRequestPermission("notifications"));
  assert.ok(canRequestPermission("media", { mediaTypes: ["audio"] }));
  assert.equal(canRequestPermission("media", { mediaTypes: ["audio", "video"] }), false);
  assert.equal(canRequestPermission("media"), false);
  assert.equal(canRequestPermission("geolocation"), false);
  assert.equal(canRequestPermission("display-capture"), false);
});
