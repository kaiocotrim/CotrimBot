const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function parseServerUrl(value, development = false) {
  const url = new URL(value);
  const localDevelopment = development && url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
  if ((!localDevelopment && url.protocol !== "https:") || url.username || url.password) {
    throw new Error("O servidor deve usar HTTPS, sem credenciais na URL.");
  }
  return url.href;
}

function isServerUrl(value, serverUrl) {
  try {
    const url = new URL(value);
    const server = new URL(serverUrl);
    return url.protocol === server.protocol && url.origin === server.origin && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isExternalUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:", "mailto:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function canRequestPermission(permission, details = {}) {
  if (permission === "notifications") return true;
  return permission === "media" && details.mediaTypes?.length > 0
    && details.mediaTypes.every(type => type === "audio");
}

module.exports = { parseServerUrl, isServerUrl, isExternalUrl, canRequestPermission };
