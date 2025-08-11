import * as vscode from "vscode-languageserver/node";
import { createConnection, createServer } from "@volar/language-server/node";
import {
  createLanguageServiceEnvironment,
  createSimpleProject,
} from "@volar/language-server/lib/project/simpleProject";
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
import { ServerConfigManager } from "../utils/server-config";
import { createTsgoPluginClient } from "./tsgo-plugin-client";

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
    this.connection = createConnection();
    this.server = createServer(this.connection);
    this.tsgoBackend = new TsgoBackend();
    try {
      Logger.setServerConnection(this.server.connection);
    } catch {}
  }

  /**
   * 启动语言服务器
   */
  async start(): Promise<void> {
    Logger.log("启动 Vue Language Server");

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

      // 设置服务器端配置
      const workspaceFolders =
        params.workspaceFolders?.map(
          (folder) => URI.parse(folder.uri).fsPath
        ) || [];
      ServerConfigManager.setWorkspaceFolders(workspaceFolders);

      // 从初始化参数中获取配置
      const config = params.initializationOptions?.config || {};
      ServerConfigManager.setConfig(config);

      const commandLine = createParsedCommandLineByJson(
        ts,
        ts.sys,
        ts.sys.getCurrentDirectory(),
        {}
      );

      const languagePlugins = [
        {
          getLanguageId: (uri: URI) =>
            this.server.documents.get(uri)?.languageId,
        },
        createVueLanguagePlugin(
          ts,
          commandLine.options,
          commandLine.vueOptions,
          (uri: URI) => uri.fsPath.replace(/\\/g, "/")
        ),
      ];

      const languageServicePlugins = this.createCustomLanguageServicePlugins();

      return this.server.initialize(
        params,
        createSimpleProject(languagePlugins),
        languageServicePlugins
      );
    });

    this.connection.onInitialized(() => {
      Logger.log("Vue Language Server 初始化完成");
      this.server.initialized();
      // 初始化完成后再启动 TSGo，避免阻塞 LSP 初始化握手
      this.tsgoBackend
        .start()
        .then(() => Logger.log("TSGo 后端启动成功（post-initialized）"))
        .catch((err) => Logger.error("TSGo 后端启动失败", err));
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
    // 创建 TSGo 插件客户端，将 TypeScript 请求转发给 TSGo 后端
    const tsgoPluginClient = createTsgoPluginClient(this.tsgoBackend);

    const basePlugins = createVueLanguageServicePlugins(ts, tsgoPluginClient);
    try {
      Logger.debug("加载基础语言服务插件", {
        plugins: basePlugins.map((p: any) => p.name || "<anonymous>"),
      });
    } catch {}

    // 直接返回插件，它们已经通过 tsgoPluginClient 与 TSGo 后端集成
    return basePlugins;
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
