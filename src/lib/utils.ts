import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 格式化运行时间 (ms -> Xd Xh Xm)
 * @param ms 毫秒数
 */
export function formatUptime(ms: number | undefined): string {
  if (ms === undefined || ms === null || ms <= 0) return "0m";

  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / (24 * 3600));
  const h = Math.floor((seconds % (24 * 3600)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);

  return parts.join(" ");
}

/**
 * 格式化文件大小/内存占用 (bytes -> string)
 * @param bytes 字节数
 */
export function formatSize(bytes: number): string {
  if (bytes === 0 || bytes === undefined || bytes === null || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
