#!/usr/bin/env node

import { VueLanguageServer } from "./vue-server";
import { Logger } from "../utils/logger";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const LOG_FILE = path.join(os.tmpdir(), "vue-tsgo-lsp.log");
function fileLog(message: string, data?: any) {
  try {
    const line = `[${new Date().toISOString()}] ${message}$${
      data ? " " + String(data) : ""
    }\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {}
}

/**
 * Vue Language Server 启动脚本
 */
async function main() {
  try {
    Logger.log("=== Vue TSGo Language Server 启动 ===");
    // 确认使用 stdio 通信
    Logger.log("LSP 进程通信方式: stdio");
    fileLog("server entry, using stdio");
    const server = new VueLanguageServer();
    Logger.log("创建 VueLanguageServer 实例完成，准备启动");
    await server.start();

    Logger.log("Vue Language Server 启动完成，等待客户端连接...");
    fileLog("server started and listening");
  } catch (error) {
    Logger.error("Vue Language Server 启动失败:", error);
    fileLog("server start failed", (error as any)?.stack || String(error));
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  Logger.error("未捕获的异常:", error);
  fileLog("uncaughtException", error.stack || String(error));
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  Logger.error("未处理的 Promise 拒绝:", reason);
  fileLog("unhandledRejection", (reason as any)?.stack || String(reason));
  process.exit(1);
});

// 启动服务器
main().catch((error) => {
  Logger.error("启动失败:", error);
  process.exit(1);
});
