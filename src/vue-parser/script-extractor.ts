/**
 * Script Setup 提取器 - 从 Vue 文件中提取 <script setup> 内容
 */

export interface ScriptSetupInfo {
  start: number;
  end: number;
  code: string;
}

export class ScriptExtractor {
  /**
   * 从 Vue 文件内容中提取 <script setup lang="ts"> 块
   */
  static extractScriptSetup(content: string): ScriptSetupInfo | null {
    // 匹配 <script setup lang="ts"> 标签
    const scriptStart = content.match(
      /<script\s+setup\b[^>]*lang=["']ts["'][^>]*>/i
    );

    if (!scriptStart || scriptStart.index === undefined) {
      return null;
    }

    const startIndex = scriptStart.index + scriptStart[0].length;
    const closeIndex = content.indexOf("</script>", startIndex);

    if (closeIndex === -1) {
      return null;
    }

    const code = content.slice(startIndex, closeIndex);

    return {
      start: startIndex,
      end: closeIndex,
      code: code,
    };
  }

  /**
   * 检查 Vue 文件是否包含 TypeScript script setup
   */
  static hasTypescriptSetup(content: string): boolean {
    return /<script\s+setup\b[^>]*lang=["']ts["'][^>]*>/i.test(content);
  }

  /**
   * 获取 script setup 在文件中的行列信息
   */
  static getScriptPosition(
    content: string,
    offset: number
  ): { line: number; char: number } {
    let line = 0;
    let lastLineStart = 0;

    for (let i = 0; i < offset; i++) {
      if (content.charCodeAt(i) === 10 /* \n */) {
        line++;
        lastLineStart = i + 1;
      }
    }

    return {
      line,
      char: offset - lastLineStart,
    };
  }

  /**
   * 将位置转换为偏移量
   */
  static positionToOffset(
    text: string,
    line: number,
    character: number
  ): number {
    const lines = text.split(/\r?\n/);
    let offset = 0;

    for (let i = 0; i < line; i++) {
      offset += (lines[i]?.length ?? 0) + 1; // +1 for newline
    }

    offset += character;
    return offset;
  }
}
