import * as vscode from "vscode-languageserver/node";
import { createConnection, createServer } from "@volar/language-server/node";
import { createLanguageServiceEnvironment } from "@volar/language-server/lib/project/simpleProject";
import {
  createLanguage,
  createParsedCommandLine,
  createParsedCommandLineByJson,
  createVueLanguagePlugin,
} from "@vue/language-core";
import {
  createLanguageService,
  createUriMap,
  createVueLanguageServicePlugins,
} from "@vue/language-service";
import * as ts from "typescript";
import { URI } from "vscode-uri";
import { TsgoBackend } from "./tsgo-backend";
import { Logger } from "../utils/logger";

/**
 * Vue Language Server
 * 基于 Volar.js 构建，使用 TSGo 作为 TypeScript 后端
 */
export class VueLanguageServer {
  private connection: vscode.Connection;
  private server: ReturnType<typeof createServer>;
  private tsgoBackend: TsgoBackend;
  private tsconfigProjects = createUriMap<any>();

  constructor() {
    this.connection = createConnection(process.stdin, process.stdout);
    this.server = createServer(this.connection);
    this.tsgoBackend = new TsgoBackend();
  }

  /**
   * 启动语言服务器
   */
  async start(): Promise<void> {
    Logger.log("启动 Vue Language Server");

    // 启动 TSGo 后端
    await this.tsgoBackend.start();

    // 设置连接监听
    this.setupConnectionHandlers();

    // 开始监听
    this.connection.listen();
  }

  /**
   * 设置连接处理器
   */
  private setupConnectionHandlers(): void {
    this.connection.onInitialize((params) => {
      Logger.log("Vue Language Server 初始化", params);

      return this.server.initialize(params, {
        setup() {
          Logger.log("Vue Language Server 设置完成");
        },

        async getLanguageService(uri) {
          Logger.debug("获取语言服务", { uri: uri.toString() });

          if (uri.scheme === "file") {
            const fileName = uri.fsPath.replace(/\\/g, "/");

            // 获取项目信息（简化版，实际可能需要更复杂的项目发现逻辑）
            const configFileName = this.findTsConfig(fileName);

            let languageService = this.tsconfigProjects.get(
              URI.file(configFileName || "")
            );
            if (!languageService) {
              languageService =
                this.createProjectLanguageService(configFileName);
              this.tsconfigProjects.set(
                URI.file(configFileName || ""),
                languageService
              );
            }
            return languageService;
          }

          // 默认语言服务
          return this.createProjectLanguageService(undefined);
        },

        getExistingLanguageServices() {
          return [...this.tsconfigProjects.values()];
        },
      });
    });

    this.connection.onInitialized(() => {
      Logger.log("Vue Language Server 初始化完成");
      this.server.initialized();
    });

    this.connection.onShutdown(() => {
      Logger.log("Vue Language Server 关闭");
      return this.tsgoBackend.stop();
    });
  }

  /**
   * 创建项目语言服务
   */
  private createProjectLanguageService(tsconfig: string | undefined) {
    Logger.debug("创建项目语言服务", { tsconfig });

    const commandLine =
      tsconfig && !ts.server.isInferredProjectName(tsconfig)
        ? createParsedCommandLine(ts, ts.sys, tsconfig)
        : createParsedCommandLineByJson(
            ts,
            ts.sys,
            ts.sys.getCurrentDirectory(),
            {}
          );

    // 创建 Vue 语言插件
    const language = createLanguage<URI>(
      [
        {
          getLanguageId: (uri) => this.server.documents.get(uri)?.languageId,
        },
        createVueLanguagePlugin(
          ts,
          commandLine.options,
          commandLine.vueOptions,
          (uri) => uri.fsPath.replace(/\\/g, "/")
        ),
      ],
      createUriMap(),
      (uri) => {
        const document = this.server.documents.get(uri);
        if (document) {
          language.scripts.set(
            uri,
            document.getSnapshot(),
            document.languageId
          );
        } else {
          language.scripts.delete(uri);
        }
      }
    );

    // 创建语言服务插件，并集成 TSGo 后端
    const languageServicePlugins = this.createCustomLanguageServicePlugins();

    return createLanguageService(
      language,
      languageServicePlugins,
      createLanguageServiceEnvironment(this.server, [
        ...this.server.workspaceFolders.all,
      ]),
      {}
    );
  }

  /**
   * 创建自定义语言服务插件，集成 TSGo 后端
   */
  private createCustomLanguageServicePlugins() {
    const basePlugins = createVueLanguageServicePlugins(ts);

    // 在这里我们可以替换或包装 TypeScript 相关的插件
    // 使它们使用 TSGo 后端而不是内置的 TypeScript 服务
    return basePlugins.map((plugin) => {
      if (plugin.name?.includes("typescript")) {
        return this.wrapPluginWithTsgoBackend(plugin);
      }
      return plugin;
    });
  }

  /**
   * 包装插件以使用 TSGo 后端
   */
  private wrapPluginWithTsgoBackend(plugin: any) {
    return {
      ...plugin,
      // 在这里拦截 TypeScript 相关的请求并转发给 TSGo
      async provideDefinition(context: any, pos: any) {
        // 如果是 TypeScript 相关的定义请求，转发给 TSGo
        if (this.isTypeScriptContext(context)) {
          return await this.tsgoBackend.provideDefinition(context, pos);
        }
        // 否则使用原始插件
        return plugin.provideDefinition?.(context, pos);
      },

      async provideHover(context: any, pos: any) {
        if (this.isTypeScriptContext(context)) {
          return await this.tsgoBackend.provideHover(context, pos);
        }
        return plugin.provideHover?.(context, pos);
      },

      // 可以继续包装其他 TypeScript 功能...
    };
  }

  /**
   * 判断是否为 TypeScript 上下文
   */
  private isTypeScriptContext(context: any): boolean {
    // 这里需要实现逻辑来判断当前上下文是否需要 TypeScript 分析
    // 例如：检查是否在 <script setup> 块中，或者是否为 .ts 虚拟代码
    return (
      context.document?.languageId === "typescript" ||
      context.document?.uri?.toString().includes(".vue.setup.ts")
    );
  }

  /**
   * 查找 TypeScript 配置文件
   */
  private findTsConfig(fileName: string): string | undefined {
    // 简化实现：向上查找 tsconfig.json
    let dir = require("path").dirname(fileName);
    const fs = require("fs");

    while (dir !== require("path").dirname(dir)) {
      const tsConfigPath = require("path").join(dir, "tsconfig.json");
      if (fs.existsSync(tsConfigPath)) {
        return tsConfigPath;
      }
      dir = require("path").dirname(dir);
    }

    return undefined;
  }
}
