import {
  ExtensionContext,
  commands,
  workspace,
  window,
  languages,
} from "vscode";
import { VirtualDocumentManager, VIRTUAL_SCHEME } from "./virtual-docs/manager";
import { VueParser } from "./vue-parser/parser";
import { VueTsgoMiddleware } from "./language-client/middleware";
import { VueTsgoClient } from "./language-client/client";
import { VueLanguageProviders } from "./providers/vue-providers";
import { ConfigManager } from "./utils/config";
import { Logger } from "./utils/logger";

let client: VueTsgoClient | undefined;
let virtualDocManager: VirtualDocumentManager | undefined;

/**
 * 扩展激活函数
 */
export async function activate(context: ExtensionContext): Promise<void> {
  Logger.log("Vue TSGo 扩展开始激活");

  try {
    // 设置扩展安装路径
    ConfigManager.setExtensionPath(context.extensionUri.fsPath);
    // 初始化虚拟文档管理器
    virtualDocManager = new VirtualDocumentManager();

    // 注册虚拟文档内容提供者
    context.subscriptions.push(
      workspace.registerTextDocumentContentProvider(
        VIRTUAL_SCHEME,
        virtualDocManager
      )
    );

    // 初始化 Vue 解析器
    const vueParser = new VueParser(virtualDocManager);

    // 初始化中间件
    const middleware = new VueTsgoMiddleware(vueParser);

    // 初始化并启动 Language Client
    client = new VueTsgoClient(middleware);
    await client.start();

    // 注册 Vue 文件的 Language Providers
    const vueProviders = new VueLanguageProviders(vueParser, () =>
      client?.getClient()
    );

    context.subscriptions.push(
      languages.registerHoverProvider(
        { language: "vue" },
        vueProviders.createHoverProvider()
      )
    );

    context.subscriptions.push(
      languages.registerDefinitionProvider(
        { language: "vue" },
        vueProviders.createDefinitionProvider()
      )
    );

    // 注册命令
    registerCommands(context);

    Logger.log("Vue TSGo 扩展激活完成");
    window.setStatusBarMessage("Vue TSGo: 已激活", 3000);
  } catch (error) {
    Logger.error("Vue TSGo 扩展激活失败:", error);
    window.showErrorMessage(`Vue TSGo 激活失败: ${String(error)}`);
  }
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

/**
 * 注册扩展命令
 */
function registerCommands(context: ExtensionContext): void {
  // 重启服务器命令
  context.subscriptions.push(
    commands.registerCommand("vueTsgo.restartServer", async () => {
      if (client) {
        try {
          await client.restart();
          window.setStatusBarMessage("Vue TSGo: 服务器已重启", 3000);
        } catch (error) {
          Logger.error("重启服务器失败:", error);
          window.showErrorMessage(`重启服务器失败: ${String(error)}`);
        }
      }
    })
  );

  // 清理虚拟文档命令（调试用）
  context.subscriptions.push(
    commands.registerCommand("vueTsgo.clearVirtualDocs", () => {
      if (virtualDocManager) {
        // 这里可以添加清理逻辑
        Logger.log("清理虚拟文档");
        window.setStatusBarMessage("Vue TSGo: 虚拟文档已清理", 3000);
      }
    })
  );
}
