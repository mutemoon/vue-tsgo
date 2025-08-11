import { spawn, ChildProcess } from "child_process";
import { ServerConfigManager } from "../utils/server-config";
import { Logger } from "../utils/logger";

/**
 * TSGo 后端通信类
 * 负责与 TSGo LSP 服务器的通信，作为 TypeScript 分析的后端
 */
export class TsgoBackend {
  private tsgoProcess: ChildProcess | undefined;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
    }
  >();

  /**
   * 启动 TSGo 后端服务
   */
  async start(): Promise<void> {
    Logger.log("启动 TSGo 后端服务");

    try {
      const tsgoPath = await ServerConfigManager.getTsgoPath();
      const serverCwd = ServerConfigManager.pickServerCwd();

      Logger.debug("TSGo 配置", { tsgoPath, serverCwd });

      this.tsgoProcess = spawn(tsgoPath, ["--lsp", "--stdio"], {
        cwd: serverCwd,
        stdio: ["pipe", "pipe", "pipe"],
      });

      if (!this.tsgoProcess.stdin || !this.tsgoProcess.stdout) {
        throw new Error("无法创建 TSGo 进程的输入输出流");
      }

      // 设置数据处理
      this.setupProcessHandlers();

      // 等待进程启动
      await new Promise<void>((resolve, reject) => {
        let resolved = false;

        const onError = (error: Error) => {
          if (!resolved) {
            resolved = true;
            Logger.error("TSGo 进程启动失败", error);
            reject(new Error(`TSGo 进程启动失败: ${error.message}`));
          }
        };

        const onExit = (code: number | null, signal: string | null) => {
          if (!resolved) {
            resolved = true;
            const msg = `TSGo 进程异常退出: code=${code}, signal=${signal}`;
            Logger.error(msg);
            reject(new Error(msg));
          }
        };

        this.tsgoProcess!.on("error", onError);
        this.tsgoProcess!.on("exit", onExit);

        // 给进程一些时间启动，如果没有立即出错，认为启动成功
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            this.tsgoProcess!.off("error", onError);
            this.tsgoProcess!.off("exit", onExit);
            resolve();
          }
        }, 1000);
      });

      // 初始化 LSP 连接
      await this.initializeLsp();

      Logger.log("TSGo 后端服务启动完成");
    } catch (error) {
      Logger.error("TSGo 后端服务启动失败", error);
      // 不要重新抛出错误，让语言服务器继续运行，只是没有 TSGo 后端
      Logger.warn("语言服务器将在没有 TSGo 后端的情况下继续运行");
    }
  }

  /**
   * 停止 TSGo 后端服务
   */
  async stop(): Promise<void> {
    Logger.log("停止 TSGo 后端服务");

    if (this.tsgoProcess) {
      // 发送 shutdown 请求
      try {
        await this.sendRequest("shutdown", null);
        await this.sendNotification("exit", null);
      } catch (error) {
        Logger.error("停止 TSGo 时出错:", error);
      }

      this.tsgoProcess.kill();
      this.tsgoProcess = undefined;
    }

    // 清理待处理的请求
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error("TSGo 后端服务已停止"));
    }
    this.pendingRequests.clear();
  }

  /**
   * 提供定义信息
   */
  async provideDefinition(context: any, position: any): Promise<any> {
    Logger.debug("TSGo 后端: 提供定义", { context, position });

    try {
      // 首先打开文档
      await this.openDocument(context.document);

      // 发送定义请求
      const result = await this.sendRequest("textDocument/definition", {
        textDocument: { uri: context.document.uri },
        position: { line: position.line, character: position.character },
      });

      Logger.debug("TSGo 定义结果:", result);
      return result;
    } catch (error) {
      Logger.error("TSGo 提供定义失败:", error);
      return null;
    }
  }

  /**
   * 提供悬停信息
   */
  async provideHover(context: any, position: any): Promise<any> {
    try {
      if (!context?.document) {
        Logger.error("TSGo Hover: 缺少 document");
        return null;
      }

      await this.openDocument(context.document);

      const params = {
        textDocument: { uri: context.document.uri },
        position: { line: position.line, character: position.character },
      };

      const result = await this.sendRequest("textDocument/hover", params);
      Logger.debug("TSGo Hover 结果", {
        uri: context.document.uri,
        hasResult: !!result,
      });
      return result;
    } catch (error) {
      Logger.error("TSGo 提供悬停失败:", error);
      return null;
    }
  }

  /**
   * 打开文档到 TSGo
   */
  private async openDocument(document: any): Promise<void> {
    await this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: document.uri,
        languageId: "typescript",
        version: document.version || 1,
        text: document.getText(),
      },
    });
  }

  /**
   * 关闭文档
   */
  private async closeDocument(documentUri: string): Promise<void> {
    await this.sendNotification("textDocument/didClose", {
      textDocument: { uri: documentUri },
    });
  }

  /**
   * 初始化 LSP 连接
   */
  private async initializeLsp(): Promise<void> {
    const initializeParams = {
      processId: process.pid,
      clientInfo: {
        name: "vue-tsgo-bridge",
        version: "1.0.0",
      },
      rootUri: null,
      capabilities: {
        textDocument: {
          definition: { linkSupport: true },
          hover: { contentFormat: ["markdown", "plaintext"] },
        },
      },
    };

    const result = await this.sendRequest("initialize", initializeParams);
    Logger.debug("TSGo 初始化结果:", result);

    await this.sendNotification("initialized", {});
  }

  /**
   * 设置进程处理器
   */
  private setupProcessHandlers(): void {
    if (!this.tsgoProcess || !this.tsgoProcess.stdout) {
      throw new Error("TSGo 进程未正确启动");
    }

    let buffer = "";

    this.tsgoProcess.stdout.on("data", (data: Buffer) => {
      buffer += data.toString();

      // 处理 LSP 消息（每个消息以 \r\n\r\n 分隔）
      let index;
      while ((index = buffer.indexOf("\r\n\r\n")) !== -1) {
        const headerStr = buffer.substring(0, index);
        const headers = this.parseHeaders(headerStr);
        const contentLength = parseInt(headers["content-length"] || "0");

        if (buffer.length >= index + 4 + contentLength) {
          const content = buffer.substring(
            index + 4,
            index + 4 + contentLength
          );
          buffer = buffer.substring(index + 4 + contentLength);

          try {
            const message = JSON.parse(content);
            this.handleMessage(message);
          } catch (error) {
            Logger.error("解析 TSGo 消息失败:", error);
          }
        } else {
          break;
        }
      }
    });

    this.tsgoProcess.stderr?.on("data", (data: Buffer) => {
      Logger.error("TSGo 错误输出:", data.toString());
    });

    this.tsgoProcess.on("exit", (code) => {
      Logger.warn("TSGo 进程退出，代码:", code);
      this.tsgoProcess = undefined;
    });
  }

  /**
   * 解析 LSP 头部
   */
  private parseHeaders(headerStr: string): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const line of headerStr.split("\r\n")) {
      const [key, value] = line.split(": ");
      if (key && value) {
        headers[key.toLowerCase()] = value;
      }
    }
    return headers;
  }

  /**
   * 处理来自 TSGo 的消息
   */
  private handleMessage(message: any): void {
    Logger.debug("收到 TSGo 消息:", message);

    if (message.id !== undefined && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || "TSGo 请求失败"));
      } else {
        resolve(message.result);
      }
    }
  }

  /**
   * 发送请求到 TSGo
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.tsgoProcess || !this.tsgoProcess.stdin) {
        reject(new Error("TSGo 进程未运行"));
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, { resolve, reject });

      const message = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.sendMessage(message);

      // 设置超时
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error("TSGo 请求超时"));
        }
      }, 30000); // 30秒超时
    });
  }

  /**
   * 发送通知到 TSGo
   */
  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.tsgoProcess || !this.tsgoProcess.stdin) {
      throw new Error("TSGo 进程未运行");
    }

    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.sendMessage(message);
  }

  /**
   * 发送消息到 TSGo
   */
  private sendMessage(message: any): void {
    if (!this.tsgoProcess || !this.tsgoProcess.stdin) {
      throw new Error("TSGo 进程未运行");
    }

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
    const fullMessage = header + content;

    Logger.debug("发送消息到 TSGo:", message);
    this.tsgoProcess.stdin.write(fullMessage);
  }
}
