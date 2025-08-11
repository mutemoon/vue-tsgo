import * as fs from "fs/promises";
import * as path from "path";

/**
 * Server-side configuration manager
 * 不依赖 vscode 模块，适用于 language server 进程
 */
export class ServerConfigManager {
  private static workspaceFolders: string[] = [];
  private static config: { [key: string]: any } = {};

  /**
   * 设置工作区文件夹
   */
  static setWorkspaceFolders(folders: string[]): void {
    this.workspaceFolders = folders;
  }

  /**
   * 设置配置项
   */
  static setConfig(config: { [key: string]: any }): void {
    this.config = config;
  }

  /**
   * 获取 TSGo 可执行文件路径
   */
  static async getTsgoPath(): Promise<string> {
    // 首先检查用户配置
    const configured = this.config.tsgoPath as string | undefined;

    if (configured && configured.trim().length > 0) {
      console.log("[TSGO-DEBUG] 使用配置的 tsgo 路径:", configured);
      return configured;
    }

    // 在工作区中查找
    console.log("[TSGO-DEBUG] 工作区文件夹数量:", this.workspaceFolders.length);

    // 优先查找所有工作区文件夹（包括子文件夹和父文件夹）
    const searchPaths: string[] = [];

    // 添加所有工作区文件夹
    searchPaths.push(...this.workspaceFolders);

    // 添加工作区文件夹的父文件夹（在monorepo的情况下）
    for (const folderPath of this.workspaceFolders) {
      const parentPath = path.dirname(folderPath);
      if (parentPath !== folderPath && !searchPaths.includes(parentPath)) {
        searchPaths.push(parentPath);
      }
    }

    for (const folderPath of searchPaths) {
      const candidate = path.join(
        folderPath,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "tsgo.cmd" : "tsgo"
      );

      try {
        await fs.access(candidate);
        console.log("[TSGO-DEBUG] 找到 tsgo:", candidate);
        return candidate;
      } catch {
        // 静默跳过不存在的路径
      }
    }

    // 返回默认值，假设在 PATH 中
    console.log("[TSGO-DEBUG] 使用默认 tsgo 命令");
    return "tsgo";
  }

  /**
   * 选择服务器工作目录
   */
  static pickServerCwd(): string | undefined {
    if (this.workspaceFolders.length === 0) {
      return undefined;
    }

    // 优先选择名为 playground 的文件夹
    const prefer = this.workspaceFolders.find((folderPath) =>
      /(?:^|\/)playground$/i.test(folderPath)
    );

    return prefer || this.workspaceFolders[0];
  }

  /**
   * 获取缓存目录配置
   */
  static getCacheDir(): string {
    return (this.config.cacheDir as string) || ".vue-tsgo/cache";
  }
}
