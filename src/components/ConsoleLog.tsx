import { Terminal, Trash2, Pause, Play } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useWebSocket } from "@/hooks/useBot";

interface LogEntry {
  id: number;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "chat";
  icon?: string;
  message: string;
}

interface ConsoleLogProps {
  externalLogs?: LogEntry[];
  serverId?: string; // 可选的服务器ID过滤器
}

export function ConsoleLog({ externalLogs, serverId }: ConsoleLogProps) {
  const { logs: wsLogs, setLogs } = useWebSocket();
  const rawLogs = externalLogs || wsLogs;

  // 如果提供了 serverId，则过滤日志
  const logs = useMemo(() => {
    if (!serverId) return rawLogs;
    return rawLogs.filter(log => log.serverId === serverId);
  }, [rawLogs, serverId]);
  const [isPaused, setIsPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && !isPaused) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isPaused]);

  const typeStyles = {
    info: "text-diamond",
    success: "text-primary",
    warning: "text-gold",
    error: "text-redstone",
    chat: "text-amethyst",
  };

  const clearLogs = () => setLogs([]);

  return (
    <div className="rounded-lg border border-border bg-obsidian overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">控制台日志</span>
          <span className="text-xs text-muted-foreground">({logs.length} 条)</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={clearLogs}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Log Entries */}
      <div
        ref={scrollRef}
        className="h-64 overflow-y-auto p-3 font-mono text-sm space-y-1 scrollbar-thin"
      >
        {logs.map((log) => (
          <div
            key={log.id}
            className={cn(
              "flex items-start gap-2 py-0.5 animate-in fade-in duration-300",
              typeStyles[log.type]
            )}
          >
            <span className="text-muted-foreground shrink-0">[{log.timestamp}]</span>
            {log.icon && <span className="shrink-0">{log.icon}</span>}
            <span className="break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
