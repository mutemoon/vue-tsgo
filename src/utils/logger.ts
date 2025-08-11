/**
 * 日志工具
 */
export class Logger {
  private static prefix = "[TSGO-DEBUG]";

  static log(message: string, ...args: any[]): void {
    console.log(this.prefix, message, ...args);
  }

  static error(message: string, error?: any): void {
    console.error(this.prefix, message, error);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(this.prefix, message, ...args);
  }

  static debug(message: string, data?: any): void {
    if (data) {
      console.log(this.prefix, message, data);
    } else {
      console.log(this.prefix, message);
    }
  }
}
