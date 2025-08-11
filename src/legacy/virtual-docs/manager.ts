import * as vscode from "vscode";
import { Uri } from "vscode";

export const VIRTUAL_SCHEME = "vue-tsgo";

export interface ScriptMapping {
  sourceUri: Uri;
  scriptStartLine: number;
  scriptStartChar: number;
}

/**
 * 虚拟文档管理器 - 管理 Vue 文件到 TypeScript 的虚拟映射
 */
export class VirtualDocumentManager
  implements vscode.TextDocumentContentProvider
{
  private uriToText = new Map<string, string>();
  private uriToMapping = new Map<string, ScriptMapping>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.uriToText.get(uri.toString()) ?? "";
  }

  /**
   * 设置虚拟文档内容和映射信息
   */
  setVirtualDocument(uri: Uri, text: string, mapping: ScriptMapping): void {
    const key = uri.toString();
    this.uriToText.set(key, text);
    this.uriToMapping.set(key, mapping);
    this.emitter.fire(uri);
  }

  /**
   * 获取虚拟文档的文本内容
   */
  getText(uri: Uri): string | undefined {
    return this.uriToText.get(uri.toString());
  }

  /**
   * 获取虚拟文档的映射信息
   */
  getMapping(uri: Uri): ScriptMapping | undefined {
    return this.uriToMapping.get(uri.toString());
  }

  /**
   * 销毁虚拟文档
   */
  disposeVirtualDocument(uri: Uri): void {
    const key = uri.toString();
    this.uriToText.delete(key);
    this.uriToMapping.delete(key);
    this.emitter.fire(uri);
  }

  /**
   * 创建虚拟 TypeScript URI
   */
  createVirtualUri(vueUri: Uri): Uri {
    const virtualPath = vueUri.path + ".setup.ts";
    return Uri.from({ scheme: VIRTUAL_SCHEME, path: virtualPath });
  }

  /**
   * 检查是否为虚拟文件
   */
  isVirtualFile(uri: Uri): boolean {
    return uri.scheme === VIRTUAL_SCHEME && /\.vue\.setup\.ts$/i.test(uri.path);
  }
}
