#!/usr/bin/env node

import { VueLanguageServer } from "./vue-server";
import { Logger } from "../utils/logger";

/**
 * Vue Language Server 启动脚本
 */
async function main() {
  try {
    Logger.log("=== Vue TSGo Language Server 启动 ===");

    const server = new VueLanguageServer();
    await server.start();

    Logger.log("Vue Language Server 启动完成，等待客户端连接...");
  } catch (error) {
    Logger.error("Vue Language Server 启动失败:", error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  Logger.error("未捕获的异常:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  Logger.error("未处理的 Promise 拒绝:", reason);
  process.exit(1);
});

// 启动服务器
main().catch((error) => {
  Logger.error("启动失败:", error);
  process.exit(1);
});
