// node_modules/evlog/dist/utils.mjs
var LEVEL_ORDER = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};
function isLevelEnabled(level, minLevel) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}
var colors = {
  reset: "\x1B[0m",
  bold: "\x1B[1m",
  dim: "\x1B[2m",
  red: "\x1B[31m",
  green: "\x1B[32m",
  yellow: "\x1B[33m",
  blue: "\x1B[34m",
  magenta: "\x1B[35m",
  cyan: "\x1B[36m",
  white: "\x1B[37m",
  gray: "\x1B[90m"
};
var levelColorMap = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.cyan,
  debug: colors.gray
};
var cssColors = {
  dim: "color: #6b7280",
  red: "color: #ef4444; font-weight: bold",
  green: "color: #22c55e",
  yellow: "color: #f59e0b; font-weight: bold",
  cyan: "color: #06b6d4; font-weight: bold",
  gray: "color: #6b7280; font-weight: bold",
  reset: "color: inherit; font-weight: normal"
};
var cssLevelColorMap = {
  error: cssColors.red,
  warn: cssColors.yellow,
  info: cssColors.cyan,
  debug: cssColors.gray
};
function getCssLevelColor(level) {
  return cssLevelColorMap[level] ?? cssColors.reset;
}
function escapeFormatString(str) {
  return str.replace(/%/g, "%%");
}

// node_modules/evlog/dist/runtime/client/log.mjs
function browserConsoleMethod(level) {
  if (level === "debug")
    return "log";
  return level;
}
var clientEnabled = true;
var clientConsole = true;
var clientPretty = true;
var clientMinLevel = "debug";
var clientService = "client";
var transportEnabled = false;
var transportEndpoint = "/api/_evlog/ingest";
var transportCredentials = "same-origin";
var identityContext = {};
function setIdentity(identity) {
  identityContext = { ...identity };
}
function clearIdentity() {
  identityContext = {};
}
function initLog(options = {}) {
  clientEnabled = typeof options.enabled === "boolean" ? options.enabled : true;
  clientConsole = typeof options.console === "boolean" ? options.console : true;
  clientPretty = typeof options.pretty === "boolean" ? options.pretty : true;
  clientMinLevel = options.minLevel ?? "debug";
  clientService = options.service ?? "client";
  transportEnabled = options.transport?.enabled ?? false;
  transportEndpoint = options.transport?.endpoint ?? "/api/_evlog/ingest";
  transportCredentials = options.transport?.credentials ?? "same-origin";
}
function setMinLevel(level) {
  clientMinLevel = level;
}
async function sendToServer(event) {
  if (!transportEnabled)
    return;
  try {
    await fetch(transportEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: transportCredentials
    });
  } catch {}
}
function emitLog(level, event) {
  if (!clientEnabled)
    return;
  if (!isLevelEnabled(level, clientMinLevel))
    return;
  const formatted = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    service: clientService,
    ...identityContext,
    ...event
  };
  if (clientConsole) {
    const method = browserConsoleMethod(level);
    if (clientPretty) {
      const { level: lvl, service, ...rest } = formatted;
      console[method](`%c[${escapeFormatString(String(service))}]%c ${lvl}`, getCssLevelColor(lvl), cssColors.reset, rest);
    } else
      console[method](JSON.stringify(formatted));
  }
  sendToServer(formatted);
}
function emitTaggedLog(level, tag, message) {
  if (!clientEnabled)
    return;
  if (!isLevelEnabled(level, clientMinLevel))
    return;
  if (clientPretty) {
    if (clientConsole)
      console[browserConsoleMethod(level)](`%c[${escapeFormatString(tag)}]%c ${escapeFormatString(message)}`, getCssLevelColor(level), cssColors.reset);
    sendToServer({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      level,
      service: clientService,
      ...identityContext,
      tag,
      message
    });
  } else
    emitLog(level, {
      tag,
      message
    });
}
function createLogMethod(level) {
  return function logMethod(tagOrEvent, message) {
    if (typeof window === "undefined")
      return;
    if (typeof tagOrEvent === "string" && message !== undefined)
      emitTaggedLog(level, tagOrEvent, message);
    else if (typeof tagOrEvent === "object")
      emitLog(level, tagOrEvent);
    else
      emitTaggedLog(level, "log", String(tagOrEvent));
  };
}
var _clientLog = {
  info: createLogMethod("info"),
  error: createLogMethod("error"),
  warn: createLogMethod("warn"),
  debug: createLogMethod("debug")
};
export {
  setMinLevel,
  setIdentity,
  _clientLog as log,
  initLog,
  clearIdentity
};
