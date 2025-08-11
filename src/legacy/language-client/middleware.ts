import * as vscode from "vscode";
import { Location, Position, Range, Uri, workspace } from "vscode";
import { Middleware } from "vscode-languageclient/node";
import { VueParser } from "../vue-parser/parser";
import { MappingUtils } from "../virtual-docs/mapping";
import { ScriptExtractor } from "../vue-parser/script-extractor";
import { Logger } from "../utils/logger";

/**
 * LSP 中间件 - 处理 Vue 文件和 TypeScript 之间的转换
 */
export class VueTsgoMiddleware {
  constructor(private vueParser: VueParser) {}

  /**
   * 创建 LSP 中间件 - 只处理结果映射，不处理 Vue 文件转换
   */
  createMiddleware(): Middleware {
    return {
      // 处理定义跳转的结果映射
      provideDefinition: async (document, position, token, next) => {
        Logger.debug("中间件 provideDefinition 开始", {
          documentUri: document.uri.toString(),
          position,
        });

        const result = await next(document, position, token);
        Logger.debug("LSP 返回结果:", result);

        if (!result) {
          return result;
        }

        // 映射虚拟文件结果回 Vue 文件
        return this.mapDefinitionResults(result);
      },
    };
  }

  /**
   * 映射定义结果回 Vue 文件
   */
  private async mapDefinitionResults(result: any): Promise<any> {
    if (!result) {
      return result;
    }

    const locations = Array.isArray(result) ? result : [result];
    const mappedLocations: Location[] = [];

    for (const location of locations) {
      let targetUri: Uri;
      let targetRange: Range;

      if ("targetUri" in location) {
        // LocationLink 类型
        targetUri =
          typeof location.targetUri === "string"
            ? Uri.parse(location.targetUri)
            : location.targetUri;
        targetRange = this.toVsRange(location.targetRange);
      } else {
        // Location 类型
        targetUri = location.uri;
        targetRange = location.range;
      }

      // 映射虚拟文件到 Vue 文件
      const mappedUri = await MappingUtils.mapVirtualToVueFile(targetUri);
      mappedLocations.push(new Location(mappedUri, targetRange));
    }

    return Array.isArray(result) ? mappedLocations : mappedLocations[0] || null;
  }

  /**
   * 转换 LSP 范围到 VS Code 范围
   */
  private toVsRange(r: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }): Range {
    return new Range(
      new Position(r.start.line, r.start.character),
      new Position(r.end.line, r.end.character)
    );
  }
}
