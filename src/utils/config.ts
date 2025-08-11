import * as fs from "fs/promises";
import * as path from "path";
import { workspace } from "vscode";

/**
 * 配置管理工具
 */
export class ConfigManager {
  private static extensionPath: string | undefined;

  /**
   * 设置扩展安装路径
   */
  static setExtensionPath(path: string): void {
    this.extensionPath = path;
  }

  /**
   * 获取 TSGo 可执行文件路径
   */
  static async getTsgoPath(): Promise<string> {
    // 首先检查用户配置
    const configured = workspace
      .getConfiguration("vueTsgo")
      .get<string>("tsgoPath");

    if (configured && configured.trim().length > 0) {
      console.log("[TSGO-DEBUG] 使用配置的 tsgo 路径:", configured);
      return configured;
    }

    // 在工作区中查找
    const workspaceFolders = workspace.workspaceFolders ?? [];
    console.log("[TSGO-DEBUG] 工作区文件夹数量:", workspaceFolders.length);

    for (const folder of workspaceFolders) {
      const candidate = path.join(
        folder.uri.fsPath,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "tsgo.cmd" : "tsgo"
      );

      console.log("[TSGO-DEBUG] 检查工作区路径:", candidate);
      try {
        await fs.access(candidate);
        console.log("[TSGO-DEBUG] 找到 tsgo:", candidate);
        return candidate;
      } catch {
        console.log("[TSGO-DEBUG] 路径不存在:", candidate);
      }
    }

    // 在扩展安装路径中查找
    if (this.extensionPath) {
      const candidate = path.join(
        this.extensionPath,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "tsgo.cmd" : "tsgo"
      );

      console.log("[TSGO-DEBUG] 检查扩展路径:", candidate);
      try {
        await fs.access(candidate);
        console.log("[TSGO-DEBUG] 在扩展路径找到 tsgo:", candidate);
        return candidate;
      } catch {
        console.log("[TSGO-DEBUG] 扩展路径不存在:", candidate);
      }
    } else {
      console.log("[TSGO-DEBUG] 扩展路径未设置");
    }

    // 返回默认值，假设在 PATH 中
    console.log("[TSGO-DEBUG] 使用默认 tsgo 命令");
    return "tsgo";
  }

  /**
   * 选择服务器工作目录
   */
  static pickServerCwd(): string | undefined {
    const folders = workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }

    // 优先选择名为 playground 的文件夹
    const prefer = folders.find((f) =>
      /(?:^|\/)playground$/i.test(f.uri.fsPath)
    );

    return (prefer || folders[0]).uri.fsPath;
  }

  /**
   * 获取缓存目录配置
   */
  static getCacheDir(): string {
    return (
      workspace.getConfiguration("vueTsgo").get<string>("cacheDir") ||
      ".vue-tsgo/cache"
    );
  }
}
