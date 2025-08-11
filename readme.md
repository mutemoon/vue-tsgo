# Vue TSGo VS Code 插件

一个基于 TSGo 的 Vue 3 TypeScript 智能提示与跳转插件，采用双 LSP 架构设计。

## 🚀 功能特性

- ✅ **完整的 Vue 语言支持**：基于官方 Volar.js 框架构建
- ✅ **高性能 TypeScript 分析**：使用 TSGo 作为 TypeScript 后端
- ✅ **精确跳转**：`Ctrl/Cmd + 点击` 从 Vue 文件直接跳转到定义位置
- ✅ **智能 Hover**：鼠标悬停显示类型信息和定义预览
- ✅ **代码补全**：完整的 IntelliSense 支持
- ✅ **错误诊断**：实时 TypeScript 错误检查
- ✅ **Script Setup 支持**：完整支持 Vue 3 Composition API
- ✅ **标准 LSP 协议**：符合 Language Server Protocol 规范

## 🏗️ 双 LSP 架构

### 核心设计理念

本插件采用创新的**双 LSP 架构**，结合了官方 Vue Language Server 的完整功能和 TSGo 的高性能 TypeScript 分析：

```
VS Code 客户端
    ↓ (LSP 协议)
Vue Language Server (主 LSP)
    ↓ (虚拟代码 + 内部 LSP 通信)
TSGo Language Server (TypeScript 后端)
```

### 🔧 架构组件

1. **Vue Language Server** (主 LSP 服务器)

   - 基于 Volar.js 和 Vue Language Core 构建
   - 处理所有 LSP 协议通信
   - 自动生成虚拟 TypeScript 代码
   - 管理文件映射和位置转换

2. **TSGo Backend** (TypeScript 分析后端)

   - 专门处理 TypeScript 分析
   - 通过内部 LSP 通信接收请求
   - 提供高性能的类型检查和代码分析

3. **VS Code Extension** (客户端扩展)
   - 启动和管理 Vue Language Server
   - 提供用户命令和配置界面
   - 处理扩展生命周期

### 🔄 工作流程

1. **初始化阶段**：

   ```
   VS Code 启动扩展
     → 启动 Vue Language Server (IPC)
     → Vue Language Server 启动 TSGo Backend (stdio)
     → 建立完整的通信链路
   ```

2. **处理用户请求**：
   ```
   用户操作 Vue 文件
     → VS Code 发送 LSP 请求到 Vue Language Server
     → Vue Language Server 解析 Vue 文件，生成虚拟 TypeScript 代码
     → 对于 TypeScript 相关功能：
       → 转发请求到 TSGo Backend
       → TSGo 分析虚拟代码并返回结果
       → Vue Language Server 映射结果回 Vue 文件位置
     → 返回最终结果给 VS Code
   ```

## 🎯 技术优势

### 相比传统方案的优势

| 方面                | 传统 Provider 方案   | 双 LSP 架构            |
| ------------------- | -------------------- | ---------------------- |
| **架构标准**        | 非标准，手动实现     | 完全符合 LSP 规范      |
| **功能覆盖**        | 需要手动实现每个功能 | 自动支持所有 LSP 功能  |
| **维护性**          | 高维护成本           | 基于标准框架，易维护   |
| **扩展性**          | 每个功能都要单独开发 | 新功能自动可用         |
| **TypeScript 支持** | 有限                 | 完整的 TypeScript 分析 |
| **Vue 支持**        | 自制解析器           | 官方 Vue Language Core |

### 🚀 性能特点

- **高效解析**：基于 TSGo 的原生 TypeScript 性能
- **智能缓存**：Volar.js 提供的高效虚拟文件管理
- **精确映射**：源位置级别的精确映射
- **内存优化**：合理的文档生命周期管理

## ⚙️ 配置选项

```json
{
  "vueTsgo.tsgoPath": "", // TSGo 可执行文件路径，空则自动查找
  "vueTsgo.cacheDir": ".vue-tsgo/cache" // 缓存目录（保留配置，暂未使用）
}
```

## 🛠️ 开发调试

### 1. 安装依赖

```bash
pnpm install
```

### 2. 构建项目

```bash
pnpm run build
```

### 3. 调试扩展

1. 在 VS Code 中打开项目文件夹
2. 按 `F5` 或使用"运行与调试"启动"扩展开发主机"
3. 在新窗口中打开包含 Vue 文件的项目

### 4. 查看日志

- **Vue Language Server**: VS Code 输出面板 → "Vue Language Server"
- **扩展日志**: VS Code 开发者工具控制台
- **TSGo Backend**: Vue Language Server 控制台输出

## 🧪 测试功能

### 测试环境

项目包含一个 `playground/` 测试环境：

```bash
cd playground
pnpm install
```

### 测试用例

1. **打开 `playground/src/App.vue`**
2. **测试 Hover 功能**：将鼠标悬停在变量、函数或类型上
3. **测试跳转功能**：`Ctrl/Cmd + 点击` 跳转到定义
4. **测试补全功能**：在 `<script setup>` 中输入代码触发补全

### 可用命令

- `Vue TSGo: 重启服务器` - 重启 Vue Language Server
- `Vue TSGo: 显示服务器状态` - 查看服务器运行状态

## 📦 依赖项

### 核心依赖

- **@volar/language-server**: Volar.js LSP 框架
- **@vue/language-core**: Vue 文件解析和虚拟代码生成
- **@vue/language-service**: Vue 语言服务插件
- **vscode-languageserver**: LSP 协议实现

### 开发依赖

- **TypeScript**: 类型检查和编译
- **tsup**: 快速构建工具
- **vscode-languageclient**: VS Code LSP 客户端

## 🔧 项目结构

```
src/
├── extension.ts              # VS Code 扩展主入口
├── language-server/          # Vue Language Server
│   ├── vue-server.ts        # 主服务器实现
│   ├── tsgo-backend.ts      # TSGo 后端通信
│   └── server.ts            # 服务器启动脚本
├── utils/                   # 工具函数
│   ├── config.ts           # 配置管理
│   └── logger.ts           # 日志工具
└── (legacy)/               # 已弃用的 Provider 架构文件
    ├── providers/
    ├── virtual-docs/
    └── vue-parser/
```

## 🚀 部署与发布

### 构建生产版本

```bash
pnpm run build
```

### 打包扩展

```bash
pnpm run package
```

这将生成 `.vsix` 文件，可以安装到 VS Code 中。

## 🔍 故障排除

### 常见问题

1. **TSGo 找不到**

   - 确保项目中安装了 `tsgo`: `pnpm add tsgo`
   - 或手动配置 `vueTsgo.tsgoPath`

2. **服务器启动失败**

   - 检查 VS Code 输出面板的 "Vue Language Server" 频道
   - 尝试重启服务器命令

3. **功能不工作**
   - 确保文件是 `.vue` 格式且包含 `<script setup lang="ts">`
   - 检查项目中是否有 `tsconfig.json`

### 调试技巧

- 启用详细日志：在 VS Code 设置中搜索 "trace" 并设置为 "verbose"
- 使用开发者工具查看扩展控制台
- 检查 Language Server 的进程状态

## 📄 许可证

本项目采用 MIT 许可证。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进这个项目！

---

**注意**: 这是一个实验性项目，展示了如何将 TSGo 集成到 Vue 开发环境中。如果你在使用过程中遇到问题，请提交 Issue。
