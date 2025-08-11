import { Uri } from "vscode";
import { VIRTUAL_SCHEME } from "./manager";

/**
 * 映射工具 - 处理虚拟文件到真实 Vue 文件的映射
 */
export class MappingUtils {
  /**
   * 将虚拟 TypeScript 文件 URI 映射回对应的 Vue 文件 URI
   */
  static async mapVirtualToVueFile(uri: Uri): Promise<Uri> {
    console.log("[TSGO-DEBUG] mapVirtualToVueFile", uri.toString());

    if (uri.scheme === VIRTUAL_SCHEME && /\.vue\.setup\.ts$/i.test(uri.path)) {
      // 从虚拟文件路径提取对应的 Vue 文件路径
      const vueFilePath = uri.path.replace(/\.setup\.ts$/i, "");
      const result = Uri.file(vueFilePath);
      console.log("[TSGO-DEBUG] 映射虚拟文件到", result.toString());
      return result;
    }

    // 如果不是虚拟文件，直接返回原 URI
    return uri;
  }

  /**
   * 检查给定的 URI 是否需要映射
   */
  static needsMapping(uri: Uri): boolean {
    return uri.scheme === VIRTUAL_SCHEME && /\.vue\.setup\.ts$/i.test(uri.path);
  }

  /**
   * 批量映射 URIs
   */
  static async mapUris(uris: Uri[]): Promise<Uri[]> {
    return Promise.all(uris.map((uri) => this.mapVirtualToVueFile(uri)));
  }
}
