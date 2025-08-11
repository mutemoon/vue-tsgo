import { TsgoBackend } from "./tsgo-backend";
import { Logger } from "../utils/logger";

/**
 * TSGo 插件客户端
 * 实现 Vue TypeScript Plugin 的请求接口，将请求转发给 TSGo 后端
 */
export function createTsgoPluginClient(tsgoBackend: TsgoBackend) {
  return {
    async getQuickInfoAtPosition(
      fileName: string,
      position: { line: number; character: number }
    ) {
      try {
        Logger.debug("TSGo Plugin Client: getQuickInfoAtPosition", {
          fileName,
          position,
        });

        // 创建虚拟的 context 对象
        const context = {
          document: {
            uri: `file://${fileName}`,
            languageId: "typescript",
            getText: () => {
              // 这里可能需要从某个地方获取文件内容
              // 暂时返回空字符串，实际使用时TSGo会从文件系统读取
              return "";
            },
          },
        };

        const result = await tsgoBackend.provideHover(context, position);

        if (result && result.contents) {
          // 将 LSP Hover 结果转换为 TypeScript QuickInfo 格式
          const content =
            typeof result.contents === "string"
              ? result.contents
              : Array.isArray(result.contents)
              ? result.contents
                  .map((c) => (typeof c === "string" ? c : c.value))
                  .join("\n")
              : result.contents.value;

          return content;
        }

        return undefined;
      } catch (error) {
        Logger.error("TSGo Plugin Client getQuickInfoAtPosition 失败", error);
        return undefined;
      }
    },

    async getDefinitionAtPosition(
      fileName: string,
      position: { line: number; character: number }
    ) {
      try {
        Logger.debug("TSGo Plugin Client: getDefinitionAtPosition", {
          fileName,
          position,
        });

        const context = {
          document: {
            uri: `file://${fileName}`,
            languageId: "typescript",
          },
        };

        const result = await tsgoBackend.provideDefinition(context, position);

        if (result && Array.isArray(result)) {
          // 将 LSP Location 转换为 TypeScript DefinitionInfo 格式
          return result.map((loc: any) => ({
            fileName: loc.uri.replace("file://", ""),
            textSpan: {
              start: 0, // 需要将 line/character 转换回 position，这里简化处理
              length: 1,
            },
          }));
        }

        return undefined;
      } catch (error) {
        Logger.error("TSGo Plugin Client getDefinitionAtPosition 失败", error);
        return undefined;
      }
    },

    // 其他方法可以根据需要添加
    async getCompletionsAtPosition() {
      // 暂不实现，返回空
      return undefined;
    },

    async getSignatureHelpItems() {
      // 暂不实现，返回空
      return undefined;
    },

    async getReferencesAtPosition() {
      // 暂不实现，返回空
      return undefined;
    },

    async getRenameInfo() {
      // 暂不实现，返回空
      return undefined;
    },

    async getDocumentHighlights() {
      // 暂不实现，返回空
      return undefined;
    },

    async getComponentNames() {
      // 暂不实现，返回空
      return undefined;
    },

    async getElementNames() {
      // 暂不实现，返回空
      return undefined;
    },

    async getComponentProps() {
      // 暂不实现，返回空
      return undefined;
    },

    async getComponentEvents() {
      // 暂不实现，返回空
      return undefined;
    },

    async getComponentDirectives() {
      // 暂不实现，返回空
      return undefined;
    },

    async getComponentSlots() {
      // 暂不实现，返回空
      return undefined;
    },

    async getElementAttrs() {
      // 暂不实现，返回空
      return undefined;
    },

    async getEncodedSemanticClassifications() {
      // 暂不实现，返回空
      return undefined;
    },
  };
}
