# Vue TSGo VS Code 插件

开发调试：

1. 安装依赖

```bash
pnpm i
```

2. 启动打包（监视）

```bash
pnpm watch
```

3. 在 VS Code 打开该文件夹，使用“运行与调试”启动“扩展开发主机”。

4. tsgo 后端

插件会自动寻找 `node_modules/.bin/tsgo`。也可在设置中配置 `vueTsgo.tsgoPath`。服务以 `--lsp --stdio` 方式启动。
