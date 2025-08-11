import { createLanguageService } from "@volar/language-service";
import * as fs from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";
import {
  commands,
  ExtensionContext,
  Hover,
  languages,
  Location,
  Position,
  Uri,
  window,
  workspace,
} from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  Middleware,
  ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;
let extensionInstallPath: string | undefined;
let serverCwd: string | undefined;
let volarLanguageService: ReturnType<typeof createLanguageService> | undefined;

const VIRTUAL_SCHEME = "vue-tsgo";

type ScriptMapping = {
  sourceUri: Uri;
  scriptStartLine: number;
  scriptStartChar: number;
};

class VirtualDocumentManager implements vscode.TextDocumentContentProvider {
  private uriToText = new Map<string, string>();
  private uriToMapping = new Map<string, ScriptMapping>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string | Thenable<string> {
    return this.uriToText.get(uri.toString()) ?? "";
  }

  setVirtualDocument(uri: Uri, text: string, mapping: ScriptMapping) {
    const key = uri.toString();
    this.uriToText.set(key, text);
    this.uriToMapping.set(key, mapping);
    this.emitter.fire(uri);
  }

  getText(uri: Uri): string | undefined {
    return this.uriToText.get(uri.toString());
  }

  getMapping(uri: Uri): ScriptMapping | undefined {
    return this.uriToMapping.get(uri.toString());
  }

  disposeVirtualDocument(uri: Uri) {
    const key = uri.toString();
    this.uriToText.delete(key);
    this.uriToMapping.delete(key);
    this.emitter.fire(uri);
  }
}

const virtualDocs = new VirtualDocumentManager();

async function getTsgoPath(): Promise<string> {
  const configured = workspace
    .getConfiguration("vueTsgo")
    .get<string>("tsgoPath");
  if (configured && configured.trim().length > 0) return configured;
  const workspaceFolders = workspace.workspaceFolders ?? [];
  for (const folder of workspaceFolders) {
    const candidate = path.join(
      folder.uri.fsPath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsgo.cmd" : "tsgo"
    );
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  if (extensionInstallPath) {
    const candidate = path.join(
      extensionInstallPath,
      "node_modules",
      ".bin",
      process.platform === "win32" ? "tsgo.cmd" : "tsgo"
    );
    try {
      await fs.access(candidate);
      return candidate;
    } catch {}
  }
  return "tsgo";
}

function pickServerCwd(): string | undefined {
  const folders = workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  const prefer = folders.find((f) => /(?:^|\/)playground$/i.test(f.uri.fsPath));
  return (prefer || folders[0]).uri.fsPath;
}

function createClient(tsgoPath: string): LanguageClient {
  const serverOptions: ServerOptions = {
    command: tsgoPath,
    args: ["--lsp", "--stdio"],
    options: { cwd: serverCwd },
  };

  // 中间件处理定义请求，使用 Volar 的映射机制
  // 直接使用 Volar 的官方工具来处理虚拟文件映射，不再自己实现
  const middleware: Middleware = {
    async provideDefinition(document, position, token, next) {
      console.log("[TSGO-DEBUG] 中间件 provideDefinition 开始", {
        documentUri: document.uri,
        position,
        line: document
          .lineAt(position.line)
          .text.substring(
            Math.max(0, position.character - 10),
            position.character + 10
          ),
      });

      const result = await next(document, position, token);
      console.log("[TSGO-DEBUG] LSP 返回结果:", result);

      if (!result) {
        console.log("[TSGO-DEBUG] 没有结果，直接返回");
        return result;
      }

      // 使用 Volar 的映射机制处理结果
      const locations = Array.isArray(result) ? result : [result];
      const mappedLocations: Location[] = [];
      console.log("[TSGO-DEBUG] 处理", locations.length, "个位置");

      for (let i = 0; i < locations.length; i++) {
        const location = locations[i];
        let targetUri: Uri;
        let targetRange: vscode.Range;

        if ("targetUri" in location) {
          // LocationLink 类型
          targetUri =
            typeof location.targetUri === "string"
              ? Uri.parse(location.targetUri)
              : location.targetUri;
          targetRange = toVsRange(location.targetRange);
          console.log("[TSGO-DEBUG] LocationLink 类型", i, ":", {
            targetUri: targetUri.toString(),
            targetRange,
            isVueSetupFile: /\.vue\.setup\.ts$/i.test(targetUri.fsPath),
            isCacheFile: /[\\\/]\.vue-tsgo[\\\/]cache[\\\/]/.test(
              targetUri.fsPath
            ),
          });
        } else {
          // Location 类型
          targetUri = location.uri;
          targetRange = location.range;
          console.log("[TSGO-DEBUG] Location 类型", i, ":", {
            uri: targetUri.toString(),
            range: targetRange,
            isVueSetupFile: /\.vue\.setup\.ts$/i.test(targetUri.fsPath),
            isCacheFile: /[\\\/]\.vue-tsgo[\\\/]cache[\\\/]/.test(
              targetUri.fsPath
            ),
          });
        }

        // 使用新的直接映射函数
        const mappedUri = await directMapToVueFile(targetUri);
        console.log("[TSGO-DEBUG] 映射结果", i, ":", mappedUri.toString());

        mappedLocations.push(new Location(mappedUri, targetRange));
        console.log("[TSGO-DEBUG] 使用映射后的位置:", mappedUri.toString());
      }

      const finalResult = Array.isArray(result)
        ? mappedLocations
        : mappedLocations[0] || null;
      console.log("[TSGO-DEBUG] 最终返回结果:", finalResult);
      return finalResult;
    },
  };

  const clientOptions: LanguageClientOptions = {
    // 不自动管理任何文档，防止 .vue 文件被发送给 tsgo 导致解析崩溃
    documentSelector: [],
    synchronize: {
      // 仅监听 TS 变更
      fileEvents: workspace.createFileSystemWatcher("**/*.{ts,tsx}"),
    },
    middleware,
  };

  return new LanguageClient(
    "vue-tsgo",
    "Vue TSGo",
    serverOptions,
    clientOptions
  );
}

async function restartServer() {
  if (client) {
    await client.stop();
    client = undefined;
  }
  const tsgoPath = await getTsgoPath();
  client = createClient(tsgoPath);
  await client.start();
  window.setStatusBarMessage("Vue TSGo: tsgo 已启动", 3000);
}

function extractScriptSetup(
  content: string
): { start: number; end: number; code: string } | null {
  // 简单提取 <script setup lang="ts"> ... </script>
  const scriptStart = content.match(
    /<script\s+setup\b[^>]*lang=["']ts["'][^>]*>/i
  );
  if (!scriptStart || scriptStart.index === undefined) return null;
  const startIndex = scriptStart.index + scriptStart[0].length;
  const closeIndex = content.indexOf("</script>", startIndex);
  if (closeIndex === -1) return null;
  const code = content.slice(startIndex, closeIndex);
  return { start: startIndex, end: closeIndex, code };
}

async function materializeVirtualTs(
  uri: Uri,
  content: string
): Promise<{ tsUri: Uri; text: string; offsetDelta: number }> {
  const parsed = extractScriptSetup(content);
  const virtualPath = uri.path + ".setup.ts";
  const tsUri = Uri.from({ scheme: VIRTUAL_SCHEME, path: virtualPath });
  const header = "";
  const text = header + (parsed?.code ?? "");
  const start = parsed ? parsed.start : 0;
  const { line: startLine, char: startChar } = indexToLineChar(content, start);
  virtualDocs.setVirtualDocument(tsUri, text, {
    sourceUri: uri,
    scriptStartLine: startLine,
    scriptStartChar: startChar,
  });
  return { tsUri, text, offsetDelta: header.length - start };
}

function positionToOffset(text: string, pos: Position): number {
  const lines = text.split(/\r?\n/);
  let offset = 0;
  for (let i = 0; i < pos.line; i++)
    (offset += lines[i]?.length ?? 0), (offset += 1); // +1 for newline
  offset += pos.character;
  return offset;
}

function indexToLineChar(
  text: string,
  index: number
): { line: number; char: number } {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      line++;
      lastLineStart = i + 1;
    }
  }
  return { line, char: index - lastLineStart };
}

async function ensureTsOpened(tsUri: Uri, tsText: string): Promise<void> {
  if (!client) return;
  client.sendNotification("textDocument/didOpen", {
    textDocument: {
      uri: tsUri.toString(),
      languageId: "typescript",
      version: 1,
      text: tsText,
    },
  });
}

async function closeTsVirtual(tsUri: Uri): Promise<void> {
  if (!client) return;
  client.sendNotification("textDocument/didClose", {
    textDocument: { uri: tsUri.toString() },
  });
}

async function requestDefinition(
  tsUri: Uri,
  pos: Position
): Promise<any[] | undefined> {
  if (!client) return undefined;
  const def: any = await client.sendRequest("textDocument/definition", {
    textDocument: { uri: tsUri.toString() },
    position: { line: pos.line, character: pos.character },
  });
  if (!def) return undefined;
  return Array.isArray(def) ? def : [def];
}

async function requestHover(
  tsUri: Uri,
  pos: Position
): Promise<any | undefined> {
  if (!client) return undefined;
  try {
    const hov: any = await client.sendRequest("textDocument/hover", {
      textDocument: { uri: tsUri.toString() },
      position: { line: pos.line, character: pos.character },
    });
    return hov;
  } catch {
    return undefined;
  }
}

function toVsRange(r: {
  start: { line: number; character: number };
  end: { line: number; character: number };
}): vscode.Range {
  return new vscode.Range(
    new Position(r.start.line, r.start.character),
    new Position(r.end.line, r.end.character)
  );
}

function encodeCommandUri(command: string, args: any): vscode.Uri {
  const encoded = encodeURIComponent(JSON.stringify(args));
  return Uri.parse(`command:${command}?${encoded}`);
}

function mapVirtualToVueRange(
  tsUri: Uri,
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }
): { uri: Uri; range: vscode.Range } | undefined {
  const mapping = virtualDocs.getMapping(tsUri);
  if (!mapping) return undefined;
  const mapPos = (pos: { line: number; character: number }) =>
    new Position(
      mapping.scriptStartLine + pos.line,
      pos.line === 0 ? mapping.scriptStartChar + pos.character : pos.character
    );
  const vsRange = new vscode.Range(mapPos(range.start), mapPos(range.end));
  return { uri: mapping.sourceUri, range: vsRange };
}

async function tryMapSetupFileToVue(
  setupFileUri: Uri,
  setupRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }
): Promise<{ uri: Uri; range: vscode.Range } | undefined> {
  // 推断源 .vue 文件名，例如 App.vue.setup.ts -> App.vue
  const filePath = setupFileUri.fsPath;
  const baseName = path.basename(filePath).replace(/\.setup\.ts$/i, "");
  if (!baseName.endsWith(".vue")) return undefined;
  const matches = await vscode.workspace.findFiles(
    `**/${baseName}`,
    "**/node_modules/**",
    5
  );
  if (matches.length === 0) return undefined;
  const sourceUri = matches[0];
  try {
    const doc = await workspace.openTextDocument(sourceUri);
    const parsed = extractScriptSetup(doc.getText());
    if (!parsed) return undefined;
    const { line: startLine, char: startChar } = indexToLineChar(
      doc.getText(),
      parsed.start
    );
    const mapPos = (pos: { line: number; character: number }) =>
      new Position(
        startLine + pos.line,
        pos.line === 0 ? startChar + pos.character : pos.character
      );
    const vsRange = new vscode.Range(
      mapPos(setupRange.start),
      mapPos(setupRange.end)
    );
    return { uri: sourceUri, range: vsRange };
  } catch {
    return undefined;
  }
}

// 直接映射虚拟文件到 Vue 文件的简单函数
async function directMapToVueFile(uri: Uri): Promise<Uri> {
  console.log("[TSGO-DEBUG] directMapToVueFile", uri.toString());

  if (uri.scheme === VIRTUAL_SCHEME && /\.vue\.setup\.ts$/i.test(uri.path)) {
    // 虚拟文件：从 path 提取 Vue 文件路径
    const vueFilePath = uri.path.replace(/\.setup\.ts$/i, "");
    const result = Uri.file(vueFilePath);
    console.log("[TSGO-DEBUG] 映射虚拟文件到", result.toString());
    return result;
  }

  if (uri.scheme === "file" && /\.vue\.setup\.ts$/i.test(uri.fsPath)) {
    // 磁盘文件：从 fsPath 提取 Vue 文件路径
    const vueFilePath = uri.fsPath.replace(/\.setup\.ts$/i, "");
    const result = Uri.file(vueFilePath);
    console.log("[TSGO-DEBUG] 映射磁盘文件到", result.toString());
    return result;
  }

  if (
    uri.scheme === "file" &&
    /[\\\/]\.vue-tsgo[\\\/]cache[\\\/]/.test(uri.fsPath)
  ) {
    // 缓存文件：从文件名推断 Vue 文件
    const fileName = path.basename(uri.fsPath);
    if (fileName.endsWith(".vue.setup.ts")) {
      const vueFileName = fileName.replace(".setup.ts", "");

      try {
        const vueFiles = await vscode.workspace.findFiles(
          `**/${vueFileName}`,
          "**/node_modules/**",
          1
        );
        if (vueFiles.length > 0) {
          console.log("[TSGO-DEBUG] 从缓存文件映射到", vueFiles[0].toString());
          return vueFiles[0];
        }
      } catch (err) {
        console.log("[TSGO-DEBUG] 搜索 Vue 文件失败", err);
      }
    }
  }

  // 如果不是虚拟文件，直接返回原 URI
  return uri;
}

// 使用 Volar 的映射工具将虚拟文件映射回源文件
async function mapVolarVirtualToSource(
  uri: Uri,
  range: vscode.Range
): Promise<{ uri: Uri; range: vscode.Range } | undefined> {
  console.log("[TSGO-DEBUG] mapVolarVirtualToSource 开始", {
    uri: uri.toString(),
    scheme: uri.scheme,
    fsPath: uri.fsPath,
    range,
    volarLanguageServiceAvailable: !!volarLanguageService,
  });

  if (!volarLanguageService) {
    console.log("[TSGO-DEBUG] volarLanguageService 不可用");
    return undefined;
  }

  // 如果已经是 Vue 文件，直接返回
  if (uri.path.endsWith(".vue")) {
    console.log("[TSGO-DEBUG] 已经是 Vue 文件，直接返回");
    return { uri, range };
  }

  // 检查是否是我们的虚拟文件
  const isVirtualScheme = uri.scheme === VIRTUAL_SCHEME;
  const isVueSetupFile = /\.vue\.setup\.ts$/i.test(uri.fsPath);
  const isCacheFile = /[\\\/]\.vue-tsgo[\\\/]cache[\\\/]/.test(uri.fsPath);

  console.log("[TSGO-DEBUG] 虚拟文件检查", {
    isVirtualScheme,
    isVueSetupFile,
    isCacheFile,
  });

  if (isVirtualScheme || isVueSetupFile || isCacheFile) {
    console.log("[TSGO-DEBUG] 检测到虚拟文件，尝试映射");

    // 尝试使用旧的映射方法作为回退
    const targetRange = {
      start: { line: range.start.line, character: range.start.character },
      end: { line: range.end.line, character: range.end.character },
    };
    const result = await mapAnySetupToVue(uri, targetRange);
    console.log("[TSGO-DEBUG] mapAnySetupToVue 结果", result);
    return result;
  }

  console.log("[TSGO-DEBUG] 不是虚拟文件，返回 undefined");
  return undefined;
}

async function mapAnySetupToVue(
  target: Uri,
  targetRange: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  }
): Promise<{ uri: Uri; range: vscode.Range } | undefined> {
  if (target.scheme === VIRTUAL_SCHEME) {
    return mapVirtualToVueRange(target, targetRange);
  }
  if (target.scheme === "file") {
    const p = target.fsPath;
    if (
      /\.vue\.setup\.ts$/i.test(p) ||
      /[\\\/]\.vue-tsgo[\\\/]cache[\\\/]/.test(p)
    ) {
      return await tryMapSetupFileToVue(target, targetRange);
    }
  }
  return undefined;
}

export async function activate(context: ExtensionContext) {
  extensionInstallPath = context.extensionUri.fsPath;
  serverCwd = pickServerCwd();

  // 初始化 Volar 语言服务用于虚拟文件映射
  try {
    // 暂时注释 Volar 初始化，我们先用现有的映射方法
    // 等调试好后再集成
    // const language = createLanguage([]);
    // volarLanguageService = createLanguageService(language, [], {});
  } catch (err) {
    console.warn("Failed to initialize Volar language service:", err);
  }

  await restartServer();

  context.subscriptions.push(
    commands.registerCommand("vueTsgo.restartServer", restartServer)
  );

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(
      VIRTUAL_SCHEME,
      virtualDocs
    )
  );

  // 移除文档打开拦截器，改为在源头修复跳转链接

  // 注册跳转命令（用于 Hover 内的命令链接）
  context.subscriptions.push(
    commands.registerCommand("vueTsgo.openLocation", async (payload: any) => {
      console.log("[TSGO-DEBUG] vueTsgo.openLocation 命令调用", payload);

      try {
        let uri =
          typeof payload?.uri === "string"
            ? Uri.parse(payload.uri)
            : payload?.uri;
        let range = payload?.range ? toVsRange(payload.range) : undefined;

        console.log("[TSGO-DEBUG] 原始跳转目标", {
          uri: uri?.toString(),
          range,
        });

        if (uri) {
          console.log("[TSGO-DEBUG] 最终跳转到", {
            uri: uri.toString(),
            range,
          });

          await window.showTextDocument(
            uri,
            range ? { selection: range } : undefined
          );

          console.log("[TSGO-DEBUG] 跳转完成");
        }
      } catch (err) {
        console.log("[TSGO-DEBUG] 跳转失败", err);
        window.showErrorMessage(`打开定义失败: ${String(err)}`);
      }
    })
  );

  // Hover -> 展示类型信息与定义预览，并提供可点击跳转
  context.subscriptions.push(
    languages.registerHoverProvider(
      { language: "vue" },
      {
        provideHover: async (
          document: vscode.TextDocument,
          position: vscode.Position,
          _token: vscode.CancellationToken
        ): Promise<vscode.Hover | undefined> => {
          const text = document.getText();
          const script = extractScriptSetup(text);
          if (!script) return undefined;

          const offset = positionToOffset(text, position);
          if (offset < script.start || offset > script.end) return undefined;

          if (!client) return undefined;

          const { tsUri, text: tsText } = await materializeVirtualTs(
            document.uri,
            text
          );

          // 构造对虚拟 TS 文件的同位置查询
          const scriptText = script.code;
          const relOffset = offset - script.start;
          const tsLines = scriptText.slice(0, relOffset).split(/\r?\n/);
          const tsPos = new Position(
            tsLines.length - 1,
            tsLines[tsLines.length - 1].length
          );

          await ensureTsOpened(tsUri, tsText);

          const items = await requestDefinition(tsUri, tsPos);
          if (!items || items.length === 0) {
            await closeTsVirtual(tsUri);
            return undefined;
          }
          const first = items[0];
          const isLocationLink = first && first.targetUri;
          const targetUriStr: string | undefined = isLocationLink
            ? first.targetUri
            : first?.uri;
          const targetRange = isLocationLink ? first.targetRange : first?.range;
          if (!targetUriStr || !targetRange) return undefined;

          let target = Uri.parse(targetUriStr);
          let range = toVsRange(targetRange);
          let preview = "";

          // 直接在源头修改跳转目标：如果目标是虚拟文件，直接指向对应的 Vue 文件
          console.log("[TSGO-DEBUG] 原始跳转目标", {
            uri: target.toString(),
            scheme: target.scheme,
            path: target.path,
            fsPath: target.fsPath,
          });

          // 使用新的映射函数
          target = await directMapToVueFile(target);
          const snippetDoc = await workspace.openTextDocument(target);
          preview = snippetDoc.getText(range).slice(0, 400);
          const md = new vscode.MarkdownString();
          // 类型 Hover 信息
          const hov = await requestHover(tsUri, tsPos);
          if (hov?.contents) {
            const contents = Array.isArray(hov.contents)
              ? hov.contents
              : [hov.contents];
            for (const c of contents) {
              if (typeof c === "string") {
                md.appendMarkdown(c + "\n\n");
              } else if (c.language && c.value) {
                md.appendCodeblock(c.value, c.language);
              } else if (c.value) {
                md.appendMarkdown(String(c.value) + "\n\n");
              }
            }
          }

          // 预览与跳转链接
          md.appendCodeblock(
            preview,
            target.path.endsWith(".ts") ? "ts" : undefined
          );
          const cmdUri = encodeCommandUri("vueTsgo.openLocation", {
            uri: target.toString(),
            range: {
              start: {
                line: range.start.line,
                character: range.start.character,
              },
              end: { line: range.end.line, character: range.end.character },
            },
          });
          md.appendMarkdown(`\n[跳转到定义](${cmdUri.toString()})`);
          md.isTrusted = true;
          const result = new Hover(md);
          await closeTsVirtual(tsUri);
          return result;
        },
      }
    )
  );

  // DefinitionProvider -> 支持 Cmd/Ctrl+点击跳转
  context.subscriptions.push(
    languages.registerDefinitionProvider(
      { language: "vue" },
      {
        provideDefinition: async (document, position, _token) => {
          const text = document.getText();
          const script = extractScriptSetup(text);
          if (!script || !client) return undefined;
          const offset = positionToOffset(text, position);
          if (offset < script.start || offset > script.end) return undefined;
          const { tsUri, text: tsText } = await materializeVirtualTs(
            document.uri,
            text
          );
          const scriptText = script.code;
          const relOffset = offset - script.start;
          const tsLines = scriptText.slice(0, relOffset).split(/\r?\n/);
          const tsPos = new Position(
            tsLines.length - 1,
            tsLines[tsLines.length - 1].length
          );

          await ensureTsOpened(tsUri, tsText);
          const items = await requestDefinition(tsUri, tsPos);
          await closeTsVirtual(tsUri);
          if (!items || items.length === 0) return undefined;

          // 将 LSP 返回转为 VSCode 的 Location/LocationLink
          const locs = await Promise.all(
            items.map(async (it) => {
              if (it.targetUri) {
                // LocationLink 类型
                const targetUri =
                  typeof it.targetUri === "string"
                    ? Uri.parse(it.targetUri)
                    : it.targetUri;
                const mappedUri = await directMapToVueFile(targetUri);
                return {
                  originSelectionRange: it.originSelectionRange
                    ? toVsRange(it.originSelectionRange)
                    : undefined,
                  targetUri: mappedUri,
                  targetRange: toVsRange(it.targetRange),
                  targetSelectionRange: it.targetSelectionRange
                    ? toVsRange(it.targetSelectionRange)
                    : toVsRange(it.targetRange),
                } as vscode.LocationLink;
              } else {
                // Location 类型
                const mappedUri = await directMapToVueFile(Uri.parse(it.uri));
                return new vscode.Location(mappedUri, toVsRange(it.range));
              }
            })
          );
          return locs as any;
        },
      }
    )
  );
}

export async function deactivate() {
  if (client) await client.stop();
}
