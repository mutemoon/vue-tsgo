import { Uri, workspace } from "vscode";
import { ScriptExtractor, ScriptSetupInfo } from "./script-extractor";
import { VirtualDocumentManager, ScriptMapping } from "../virtual-docs/manager";

/**
 * Vue 文件解析器 - 处理 Vue 文件的解析和虚拟 TypeScript 文件生成
 */
export class VueParser {
  constructor(private virtualDocManager: VirtualDocumentManager) {}

  /**
   * 解析 Vue 文件并创建对应的虚拟 TypeScript 文件
   */
  async parseVueFile(
    vueUri: Uri
  ): Promise<{ tsUri: Uri; tsText: string } | null> {
    try {
      // 读取 Vue 文件内容
      const document = await workspace.openTextDocument(vueUri);
      const content = document.getText();

      // 提取 script setup 内容
      const scriptInfo = ScriptExtractor.extractScriptSetup(content);
      if (!scriptInfo) {
        return null;
      }

      // 创建虚拟 TypeScript URI
      const tsUri = this.virtualDocManager.createVirtualUri(vueUri);

      // 准备 TypeScript 内容（目前直接使用 script setup 内容）
      const tsText = scriptInfo.code;

      // 计算映射信息
      const { line: startLine, char: startChar } =
        ScriptExtractor.getScriptPosition(content, scriptInfo.start);

      const mapping: ScriptMapping = {
        sourceUri: vueUri,
        scriptStartLine: startLine,
        scriptStartChar: startChar,
      };

      // 设置虚拟文档
      this.virtualDocManager.setVirtualDocument(tsUri, tsText, mapping);

      return { tsUri, tsText };
    } catch (error) {
      console.error("[TSGO-DEBUG] 解析 Vue 文件失败:", error);
      return null;
    }
  }

  /**
   * 检查文件是否为可处理的 Vue 文件
   */
  isValidVueFile(uri: Uri): boolean {
    return uri.scheme === "file" && uri.path.endsWith(".vue");
  }

  /**
   * 清理虚拟文档
   */
  cleanupVirtualDocument(vueUri: Uri): void {
    const tsUri = this.virtualDocManager.createVirtualUri(vueUri);
    this.virtualDocManager.disposeVirtualDocument(tsUri);
  }
}
