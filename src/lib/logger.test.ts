import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Logger", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function importLogger() {
    const mod = await import("./logger");
    return mod;
  }

  it("createLogger returns object with debug/info/warn/error methods", async () => {
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("includes ISO timestamp and module name in output", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "debug");
    const { createLogger } = await importLogger();
    const logger = createLogger("myModule");
    logger.info("hello");
    expect(logSpy).toHaveBeenCalledOnce();
    const firstArg = logSpy.mock.calls[0][0] as string;
    expect(firstArg).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z\] \[myModule\]$/);
    expect(logSpy.mock.calls[0][1]).toBe("hello");
  });

  it("uses console.log for debug and info", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "debug");
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.debug("d");
    logger.info("i");
    expect(logSpy).toHaveBeenCalledTimes(2);
  });

  it("uses console.warn for warn level", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "debug");
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.warn("w");
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("uses console.error for error level", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "debug");
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.error("e");
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("suppresses debug and info when level is warn", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "warn");
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("error messages always appear regardless of configured level", async () => {
    vi.stubEnv("VITE_LOG_LEVEL", "error");
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("critical");
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledOnce();
  });

  it("defaults to debug level in dev mode", async () => {
    // No VITE_LOG_LEVEL set, PROD is false by default in test
    const { createLogger } = await importLogger();
    const logger = createLogger("test");
    logger.debug("d");
    expect(logSpy).toHaveBeenCalledOnce();
  });
});
