import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    extension: "src/extension.ts",
    "language-server/server": "src/language-server/server.ts",
  },
  format: ["cjs"],
  target: "node18",
  dts: true,
  sourcemap: true,
  minify: false, // 暂时关闭压缩以便调试
  outDir: "dist",
  external: ["vscode"],
  clean: true,
});
