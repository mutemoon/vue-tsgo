import { ExtensionContext, window, workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  State as ClientState,
} from "vscode-languageclient/node";
import { ConfigManager } from "./utils/config";
import { Logger } from "./utils/logger";
import * as path from "path";

let client: LanguageClient | undefined;

/**
 * 扩展激活函数 - 新的双 LSP 架构
 */
export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Vue TSGo 扩展开始激活 (双 LSP 架构)");

  try {
    // 设置扩展安装路径
    ConfigManager.setExtensionPath(context.extensionUri.fsPath);

    // 启动 Vue Language Server
    await startVueLanguageServer(context);

    Logger.log("Vue TSGo 扩展激活完成 (双 LSP 架构)");
    window.setStatusBarMessage("Vue TSGo: 已激活 (双 LSP)", 3000);
  } catch (error) {
    Logger.error("Vue TSGo 扩展激活失败:", error);
    window.showErrorMessage(`Vue TSGo 激活失败: ${String(error)}`);
  }
}

/**
 * 启动 Vue Language Server
 */
async function startVueLanguageServer(
  context: ExtensionContext
): Promise<void> {
  Logger.log("启动 Vue Language Server");

  // Vue Language Server 的路径
  const serverModule = path.join(
    context.extensionPath,
    "dist",
    "language-server",
    "server.js"
  );

  Logger.debug("Vue Language Server 模块路径:", serverModule);

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    // 处理 Vue 文件
    documentSelector: [{ scheme: "file", language: "vue" }],
    synchronize: {
      // 监听 Vue 和相关文件的变更
      fileEvents: workspace.createFileSystemWatcher("**/*.{vue,ts,tsx,json}"),
    },
    outputChannel: window.createOutputChannel("Vue Language Server"),
    revealOutputChannelOn: 4 as any, // RevealOutputChannelOn.Error
    initializationOptions: {
      config: {
        tsgoPath: workspace.getConfiguration("vueTsgo").get<string>("tsgoPath"),
        cacheDir: workspace.getConfiguration("vueTsgo").get<string>("cacheDir"),
      },
    },
    middleware: {
      provideHover: async (document, position, token, next) => {
        try {
          Logger.log("[Client] 提交 Hover 请求", {
            uri: document.uri.toString(),
            position,
          });
          const res = await next(document, position, token);
          Logger.log("[Client] 收到 Hover 响应", res);
          return res;
        } catch (err) {
          Logger.error("[Client] Hover 中间件异常", err);
          throw err;
        }
      },
    },
  };

  client = new LanguageClient(
    "vue-tsgo-server",
    "Vue TSGo Language Server",
    serverOptions,
    clientOptions
  );

  client.onDidChangeState((e) => {
    Logger.log("[Client] LSP 状态变化", {
      old: ClientState[e.oldState],
      new: ClientState[e.newState],
    } as any);
  });

  // 启动客户端
  await client.start();
  Logger.log("Vue Language Server 已启动");

  try {
    // 尝试打开 LSP trace
    (client as any).setTrace?.("messages"); // 降级避免过多同步调用
    Logger.log("已启用 LSP Trace (messages)");
    const output = client.outputChannel;
    output.appendLine("[TSGO-DEBUG] Client trace: messages 已开启");
    output.show(true);
  } catch {}

  // 注册扩展命令
  registerCommands(context);
}

/**
 * 注册扩展命令
 */
function registerCommands(context: ExtensionContext): void {
  const { commands } = require("vscode");

  // 重启服务器命令
  context.subscriptions.push(
    commands.registerCommand("vueTsgo.restartServer", async () => {
      if (client) {
        try {
          Logger.log("重启 Vue Language Server");
          await client.stop();
          await client.start();
          window.setStatusBarMessage("Vue TSGo: 服务器已重启", 3000);
        } catch (error) {
          Logger.error("重启服务器失败:", error);
          window.showErrorMessage(`重启服务器失败: ${String(error)}`);
        }
      }
    })
  );

  // 显示服务器状态命令
  context.subscriptions.push(
    commands.registerCommand("vueTsgo.showServerStatus", () => {
      const status = client?.state || "未知";
      window.showInformationMessage(`Vue Language Server 状态: ${status}`);
    })
  );
}

/**
 * 扩展停用函数
 */
export async function deactivate(): Promise<void> {
  Logger.log("Vue TSGo 扩展开始停用");

  if (client) {
    await client.stop();
  }

  Logger.log("Vue TSGo 扩展停用完成");
}
