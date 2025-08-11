# Vue TSGo VS Code 插件

一个基于 TSGo 的 Vue 3 TypeScript 智能提示与跳转插件。

## 🚀 功能特性

- ✅ **Vue 文件 TypeScript 支持**：完整的类型检查、自动补全、错误诊断
- ✅ **精确跳转**：`Ctrl/Cmd + 点击` 从 Vue 文件直接跳转到定义位置
- ✅ **智能 Hover**：鼠标悬停显示类型信息和快速跳转链接
- ✅ **script setup 支持**：完整支持 Vue 3 Composition API
- ✅ **性能优化**：基于 TSGo 的高性能 TypeScript 分析

## 📋 技术方案

### 核心架构：磁盘缓存 + 智能映射

经过深入研究和实验验证，我们采用了最优的技术方案：

```
Vue 文件 → 提取 <script setup> → 缓存 .ts 文件 → TSGo 分析 → 映射回 Vue 文件
```

#### 🧪 探索过的方案对比

| 方案                     | 描述                               | 结果        | 原因                          |
| ------------------------ | ---------------------------------- | ----------- | ----------------------------- |
| **Volar 式内存虚拟文件** | 不创建磁盘文件，纯内存处理         | ❌ 不可行   | TSGo 需要真实文件存在才能工作 |
| **磁盘缓存 + 重定向**    | 创建缓存文件，拦截文档打开事件     | ⚠️ 复杂     | 用户体验有闪烁，实现复杂      |
| **磁盘缓存 + 源头映射**  | 创建缓存文件，在生成链接时直接映射 | ✅ **最优** | 简单、稳定、高效              |

#### 🔧 当前实现细节

1. **文件处理**：

   - 提取 Vue 文件中的 `<script setup lang="ts">` 内容
   - 生成对应的 `.vue.setup.ts` 缓存文件（磁盘或内存）
   - TSGo 分析这些 TypeScript 文件

2. **智能映射**：

   ```typescript
   // 核心映射函数
   async function directMapToVueFile(uri: Uri): Promise<Uri> {
     if (uri.scheme === "vue-tsgo" && /\.vue\.setup\.ts$/i.test(uri.path)) {
       return Uri.file(uri.path.replace(/\.setup\.ts$/i, ""));
     }
     // 处理磁盘缓存文件和其他情况...
   }
   ```

3. **跳转流程**：
   - 用户点击 → TSGo 返回虚拟文件位置 → `directMapToVueFile` 映射 → 直接跳转到 Vue 文件

## ⚙️ 配置选项

```json
{
  "vueTsgo.tsgoPath": "", // TSGo 可执行文件路径，空则自动查找
  "vueTsgo.cacheDir": ".vue-tsgo/cache" // 缓存目录
}
```

## 🛠️ 开发调试

1. **安装依赖**

```bash
pnpm i
```

2. **启动打包（监视）**

```bash
pnpm watch
```

3. **调试扩展**

   - 在 VS Code 打开该文件夹
   - 使用"运行与调试"启动"扩展开发主机"

4. **TSGo 后端**
   - 插件会自动寻找 `node_modules/.bin/tsgo`
   - 也可在设置中配置 `vueTsgo.tsgoPath`
   - 服务以 `--lsp --stdio` 方式启动

## 🧪 测试命令

- `Vue TSGo: 重启 tsgo 服务` - 重启语言服务器
- `Vue TSGo: 🧪 测试虚拟文件支持` - 测试 TSGo 的虚拟文件处理能力

## 📈 性能优势

- **高效解析**：基于 TSGo 的原生 TypeScript 性能
- **智能缓存**：避免重复解析，提升响应速度
- **精确映射**：直接跳转，无中间步骤
- **内存优化**：合理的缓存管理和清理机制

## 🔍 架构决策记录

经过实验验证的技术决策：

1. **为什么不使用 Volar 式纯内存方案？**

   - TSGo LSP 实现依赖真实文件系统
   - 虚拟文件会导致 "project not found" 错误
   - 磁盘缓存方案更稳定可靠

2. **为什么选择源头映射而不是重定向？**

   - 避免用户看到中间的虚拟文件
   - 减少文档打开/关闭的复杂操作
   - 更好的性能和用户体验

3. **如何处理不同类型的虚拟文件？**
   - `vue-tsgo:` scheme（内存）→ 直接路径映射
   - 磁盘缓存文件 → 路径替换映射
   - 缓存目录文件 → 文件名推断映射
