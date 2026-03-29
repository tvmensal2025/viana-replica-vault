export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function getConfiguredLevel(): LogLevel {
  const env = import.meta.env.VITE_LOG_LEVEL as string | undefined;
  if (env && env in LOG_LEVEL_PRIORITY) return env as LogLevel;
  return import.meta.env.PROD ? "warn" : "debug";
}

function shouldLog(messageLevel: LogLevel, configuredLevel: LogLevel): boolean {
  if (import.meta.env.PROD && messageLevel === "debug") return false;
  return LOG_LEVEL_PRIORITY[messageLevel] >= LOG_LEVEL_PRIORITY[configuredLevel];
}

const CONSOLE_METHOD: Record<LogLevel, "log" | "warn" | "error"> = {
  debug: "log",
  info: "log",
  warn: "warn",
  error: "error",
};

export function createLogger(module: string): Logger {
  const configuredLevel = getConfiguredLevel();

  function log(level: LogLevel, message: string, ...args: unknown[]) {
    if (!shouldLog(level, configuredLevel)) return;
    const timestamp = new Date().toISOString();
    console[CONSOLE_METHOD[level]](`[${timestamp}] [${module}]`, message, ...args);
  }

  return {
    debug: (message, ...args) => log("debug", message, ...args),
    info: (message, ...args) => log("info", message, ...args),
    warn: (message, ...args) => log("warn", message, ...args),
    error: (message, ...args) => log("error", message, ...args),
  };
}

// Re-export for testing
export { LOG_LEVEL_PRIORITY, shouldLog, getConfiguredLevel };
