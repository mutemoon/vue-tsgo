/**
 * 日志工具
 */
export class Logger {
  private static prefix = "[TSGO-DEBUG]";
  private static serverConnection: any | undefined;

  static setServerConnection(connection: any) {
    this.serverConnection = connection;
  }

  static log(message: string, ...args: any[]): void {
    if (this.serverConnection?.console?.log) {
      try {
        this.serverConnection.console.log(`${this.prefix} ${message}`);
      } catch {}
    } else {
      // 使用 stderr，避免干扰 LSP stdio 通信
      console.error(this.prefix, message, ...args);
    }
  }

  static error(message: string, error?: any): void {
    if (this.serverConnection?.console?.error) {
      try {
        this.serverConnection.console.error(
          `${this.prefix} ${message}: ${String(error ?? "")}`
        );
      } catch {}
    } else {
      console.error(this.prefix, message, error);
    }
  }

  static warn(message: string, ...args: any[]): void {
    if (this.serverConnection?.console?.warn) {
      try {
        this.serverConnection.console.warn(`${this.prefix} ${message}`);
      } catch {}
    } else {
      console.error(this.prefix, message, ...args);
    }
  }

  static debug(message: string, data?: any): void {
    const text = data
      ? `${this.prefix} ${message} ${safeJson(data)}`
      : `${this.prefix} ${message}`;
    if (this.serverConnection?.console?.log) {
      try {
        this.serverConnection.console.log(text);
      } catch {}
    } else {
      console.error(text);
    }
  }
}

function safeJson(data: any): string {
  try {
    return typeof data === "string" ? data : JSON.stringify(data);
  } catch {
    return String(data);
  }
}
