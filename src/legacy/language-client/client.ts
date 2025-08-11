import { workspace } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
} from "vscode-languageclient/node";
import { VueTsgoMiddleware } from "./middleware";
import { ConfigManager } from "../utils/config";
import { Logger } from "../utils/logger";

/**
 * Language Client 管理器
 */
export class VueTsgoClient {
  private client: LanguageClient | undefined;
  private serverCwd: string | undefined;

  constructor(private middleware: VueTsgoMiddleware) {
    this.serverCwd = ConfigManager.pickServerCwd();
  }

  /**
   * 创建并启动 Language Client
   */
  async start(): Promise<void> {
    if (this.client) {
      await this.stop();
    }

    const tsgoPath = await ConfigManager.getTsgoPath();
    Logger.log("启动 TSGo 服务器:", tsgoPath);

    this.client = this.createClient(tsgoPath);
    await this.client.start();
    Logger.log("TSGo 服务器已启动");
  }

  /**
   * 停止 Language Client
   */
  async stop(): Promise<void> {
    if (this.client) {
      await this.client.stop();
      this.client = undefined;
      Logger.log("TSGo 服务器已停止");
    }
  }

  /**
   * 重启 Language Client
   */
  async restart(): Promise<void> {
    Logger.log("重启 TSGo 服务器");
    await this.stop();
    await this.start();
  }

  /**
   * 获取当前客户端实例
   */
  getClient(): LanguageClient | undefined {
    return this.client;
  }

  /**
   * 创建 Language Client 实例
   */
  private createClient(tsgoPath: string): LanguageClient {
    const serverOptions: ServerOptions = {
      command: tsgoPath,
      args: ["--lsp", "--stdio"],
      options: { cwd: this.serverCwd },
    };

    const clientOptions: LanguageClientOptions = {
      // 不自动管理任何文档，防止 .vue 文件被发送给 tsgo 导致解析崩溃
      documentSelector: [],
      synchronize: {
        // 仅监听 TS 变更
        fileEvents: workspace.createFileSystemWatcher("**/*.{ts,tsx}"),
      },
      // 使用我们的中间件
      middleware: this.middleware.createMiddleware(),
    };

    return new LanguageClient(
      "vue-tsgo",
      "Vue TSGo Language Server",
      serverOptions,
      clientOptions
    );
  }
}
