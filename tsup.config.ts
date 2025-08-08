import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/extension.ts"],
  format: ["cjs"],
  target: "node18",
  dts: true,
  sourcemap: true,
  minify: true,
  outDir: "dist",
  external: ["vscode"],
  clean: true,
});
