# Legacy Provider Architecture

这个目录包含了旧的 Provider 架构实现，已被新的双 LSP 架构替代。

## 已弃用的文件

- `extension-provider.ts` - 旧的扩展主文件（Provider 架构）
- `language-client/` - 旧的语言客户端实现
- `providers/` - 手动注册的 Provider 实现
- `virtual-docs/` - 虚拟文档管理器
- `vue-parser/` - Vue 文件解析器

## 为什么弃用？

旧的 Provider 架构存在以下问题：

1. **非标准架构**: 不完全符合 LSP 规范
2. **手动实现**: 需要手动实现每个语言功能
3. **维护复杂**: 难以跟上 Vue 生态的更新
4. **功能有限**: 无法提供完整的语言服务

## 新架构优势

新的双 LSP 架构具有以下优势：

- ✅ 完全符合 LSP 标准
- ✅ 基于官方 Volar.js 框架
- ✅ 自动支持所有语言功能
- ✅ 易于维护和扩展
- ✅ 更好的性能和用户体验

这些文件保留仅供参考和学习目的。
