import * as vscode from "vscode";
import { Position, Range, Location, Hover, workspace } from "vscode";
import { LanguageClient } from "vscode-languageclient/node";
import { VueParser } from "../vue-parser/parser";
import { ScriptExtractor } from "../vue-parser/script-extractor";
import { MappingUtils } from "../virtual-docs/mapping";
import { Logger } from "../utils/logger";

/**
 * Vue 文件的 Language Provider
 */
export class VueLanguageProviders {
  constructor(
    private vueParser: VueParser,
    private getClient: () => LanguageClient | undefined
  ) {}

  /**
   * 创建 Hover Provider
   */
  createHoverProvider(): vscode.HoverProvider {
    return {
      provideHover: async (
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
      ): Promise<vscode.Hover | undefined> => {
        Logger.debug("Vue HoverProvider 开始", {
          uri: document.uri.toString(),
          position,
        });

        const client = this.getClient();
        if (!client) {
          Logger.debug("Language Client 不可用");
          return undefined;
        }

        // 检查位置是否在 script setup 中
        const tsPosition = await this.convertVuePositionToTs(
          document,
          position
        );
        if (!tsPosition) {
          Logger.debug("位置不在 script setup 中");
          return undefined;
        }

        // 解析 Vue 文件并创建虚拟 TypeScript 文件
        const result = await this.vueParser.parseVueFile(document.uri);
        if (!result) {
          Logger.debug("无法解析 Vue 文件");
          return undefined;
        }

        // 通知 LSP 打开虚拟文档
        await this.ensureTsOpened(client, result.tsUri, result.tsText);

        try {
          // 请求定义信息（用于构建 Hover 内容）
          const definitions = await this.requestDefinition(
            client,
            result.tsUri,
            tsPosition
          );

          // 请求 Hover 信息
          const hoverInfo = await this.requestHover(
            client,
            result.tsUri,
            tsPosition
          );

          // 构建 Hover 内容
          return this.buildHoverContent(hoverInfo, definitions);
        } finally {
          // 清理虚拟文档
          await this.closeTsVirtual(client, result.tsUri);
        }
      },
    };
  }

  /**
   * 创建 Definition Provider
   */
  createDefinitionProvider(): vscode.DefinitionProvider {
    return {
      provideDefinition: async (
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken
      ): Promise<vscode.Definition | undefined> => {
        Logger.debug("Vue DefinitionProvider 开始", {
          uri: document.uri.toString(),
          position,
        });

        const client = this.getClient();
        if (!client) {
          return undefined;
        }

        const tsPosition = await this.convertVuePositionToTs(
          document,
          position
        );
        if (!tsPosition) {
          return undefined;
        }

        const result = await this.vueParser.parseVueFile(document.uri);
        if (!result) {
          return undefined;
        }

        await this.ensureTsOpened(client, result.tsUri, result.tsText);

        try {
          const definitions = await this.requestDefinition(
            client,
            result.tsUri,
            tsPosition
          );
          if (!definitions || definitions.length === 0) {
            return undefined;
          }

          // 映射定义结果回 Vue 文件
          const mappedDefinitions = await Promise.all(
            definitions.map(async (def) => {
              let targetUri: vscode.Uri;
              let targetRange: Range;

              if ("targetUri" in def) {
                // LocationLink 类型
                targetUri =
                  typeof def.targetUri === "string"
                    ? vscode.Uri.parse(def.targetUri)
                    : def.targetUri;
                targetRange = this.toVsRange(def.targetRange);

                const mappedUri = await MappingUtils.mapVirtualToVueFile(
                  targetUri
                );
                return {
                  originSelectionRange: def.originSelectionRange
                    ? this.toVsRange(def.originSelectionRange)
                    : undefined,
                  targetUri: mappedUri,
                  targetRange: targetRange,
                  targetSelectionRange: def.targetSelectionRange
                    ? this.toVsRange(def.targetSelectionRange)
                    : targetRange,
                } as vscode.LocationLink;
              } else {
                // Location 类型
                targetUri = vscode.Uri.parse(def.uri);
                targetRange = this.toVsRange(def.range);

                const mappedUri = await MappingUtils.mapVirtualToVueFile(
                  targetUri
                );
                return new Location(mappedUri, targetRange);
              }
            })
          );

          return mappedDefinitions as any;
        } finally {
          await this.closeTsVirtual(client, result.tsUri);
        }
      },
    };
  }

  /**
   * 转换 Vue 文件位置到 TypeScript 位置
   */
  private async convertVuePositionToTs(
    document: vscode.TextDocument,
    position: Position
  ): Promise<Position | undefined> {
    const content = document.getText();
    const scriptInfo = ScriptExtractor.extractScriptSetup(content);

    if (!scriptInfo) {
      return undefined;
    }

    const offset = ScriptExtractor.positionToOffset(
      content,
      position.line,
      position.character
    );

    if (offset < scriptInfo.start || offset > scriptInfo.end) {
      return undefined;
    }

    const relativeOffset = offset - scriptInfo.start;
    const scriptText = scriptInfo.code;
    const linesBeforeOffset = scriptText
      .slice(0, relativeOffset)
      .split(/\r?\n/);

    return new Position(
      linesBeforeOffset.length - 1,
      linesBeforeOffset[linesBeforeOffset.length - 1].length
    );
  }

  /**
   * 通知 LSP 打开虚拟文档
   */
  private async ensureTsOpened(
    client: LanguageClient,
    tsUri: vscode.Uri,
    tsText: string
  ): Promise<void> {
    await client.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri: tsUri.toString(),
        languageId: "typescript",
        version: 1,
        text: tsText,
      },
    });
  }

  /**
   * 关闭虚拟文档
   */
  private async closeTsVirtual(
    client: LanguageClient,
    tsUri: vscode.Uri
  ): Promise<void> {
    await client.sendNotification("textDocument/didClose", {
      textDocument: { uri: tsUri.toString() },
    });
  }

  /**
   * 请求定义信息
   */
  private async requestDefinition(
    client: LanguageClient,
    tsUri: vscode.Uri,
    position: Position
  ): Promise<any[] | undefined> {
    try {
      const result: any = await client.sendRequest("textDocument/definition", {
        textDocument: { uri: tsUri.toString() },
        position: { line: position.line, character: position.character },
      });
      return result ? (Array.isArray(result) ? result : [result]) : undefined;
    } catch (error) {
      Logger.error("请求定义失败:", error);
      return undefined;
    }
  }

  /**
   * 请求 Hover 信息
   */
  private async requestHover(
    client: LanguageClient,
    tsUri: vscode.Uri,
    position: Position
  ): Promise<any | undefined> {
    try {
      return await client.sendRequest("textDocument/hover", {
        textDocument: { uri: tsUri.toString() },
        position: { line: position.line, character: position.character },
      });
    } catch (error) {
      Logger.error("请求 Hover 失败:", error);
      return undefined;
    }
  }

  /**
   * 构建 Hover 内容
   */
  private buildHoverContent(
    hoverInfo: any,
    definitions: any[]
  ): Hover | undefined {
    const md = new vscode.MarkdownString();

    // 添加类型信息
    if (hoverInfo?.contents) {
      const contents = Array.isArray(hoverInfo.contents)
        ? hoverInfo.contents
        : [hoverInfo.contents];

      for (const content of contents) {
        if (typeof content === "string") {
          md.appendMarkdown(content + "\n\n");
        } else if (content.language && content.value) {
          md.appendCodeblock(content.value, content.language);
        } else if (content.value) {
          md.appendMarkdown(String(content.value) + "\n\n");
        }
      }
    }

    md.isTrusted = true;
    return new Hover(md);
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
