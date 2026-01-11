import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  RefreshCw,
  Loader2,
  Pencil,
  X,
  Check,
  Terminal,
  Trash,
  Settings,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { BotControlPanel } from "./BotControlPanel";

interface LogEntry {
  id: number;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "chat";
  icon?: string;
  message: string;
}

interface ServerConfig {
  id: string;
  name: string;
  type?: "minecraft" | "panel";
  host: string;
  port: number;
  username?: string;
  connected?: boolean;
  serverAddress?: string;
  version?: string;
  health?: number;
  food?: number;
  position?: { x: number; y: number; z: number };
  players?: string[];
  modes?: {
    follow?: boolean;
    autoAttack?: boolean;
    patrol?: boolean;
    mining?: boolean;
    aiView?: boolean;
    autoChat?: boolean;
    invincible?: boolean;
  };
  restartTimer?: {
    enabled: boolean;
    intervalMinutes: number;
    nextRestart: string | null;
  };
  autoChat?: {
    enabled: boolean;
    interval: number;
    messages: string[];
  };
  pterodactyl?: {
    url: string;
    apiKey: string;
    serverId: string;
  } | null;
  sftp?: {
    host: string;
    port: number;
    username: string;
    password: string;
    privateKey: string;
    basePath: string;
  } | null;
  fileAccessType?: 'pterodactyl' | 'sftp' | 'none';
  panelServerState?: string;
  panelServerStats?: {
    cpuPercent: number;
    memoryBytes: number;
    diskBytes: number;
    uptime: number;
  };
  serverHost?: string;
  serverPort?: number;
  tcpOnline?: boolean | null;
  tcpLatency?: number | null;
}

interface ServerDetailDialogProps {
  server: ServerConfig | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate: () => void;
}

export function ServerDetailDialog({
  server,
  open,
  onOpenChange,
  onUpdate,
}: ServerDetailDialogProps) {
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    host: "",
    port: "25565",
    username: "",
  });
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState("control");
  const { toast } = useToast();

  // 初始化编辑表单
  useEffect(() => {
    if (server) {
      setEditForm({
        name: server.name || "",
        host: server.host || "",
        port: String(server.port || 25565),
        username: server.username || "",
      });
    }
  }, [server]);

  // 获取日志
  const fetchLogs = async () => {
    if (!server) return;
    try {
      const result = await api.getBotLogs(server.id);
      if (result.success) {
        setLogs(result.logs);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  };

  // 自动刷新日志
  useEffect(() => {
    if (open && server && activeTab === "logs") {
      fetchLogs();
      const interval = setInterval(fetchLogs, 5000);
      return () => clearInterval(interval);
    }
  }, [open, server, activeTab]);

  // 清空日志
  const clearLogs = async () => {
    if (!server) return;
    try {
      await api.clearBotLogs(server.id);
      setLogs([]);
      toast({ title: "成功", description: "日志已清空" });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    }
  };

  // 保存编辑
  const handleSave = async () => {
    if (!server) return;

    // 验证用户名格式
    if (editForm.username) {
      const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
      if (!usernameRegex.test(editForm.username)) {
        toast({
          title: "用户名格式错误",
          description: "用户名必须是3-16个字符，只能包含字母、数字和下划线",
          variant: "destructive",
        });
        return;
      }
    }

    setLoading(true);
    try {
      await api.updateServer(server.id, {
        name: editForm.name || undefined,
        host: editForm.host || undefined,
        port: parseInt(editForm.port) || 25565,
        username: editForm.username || undefined,
      });
      toast({ title: "成功", description: "服务器配置已更新" });
      setEditing(false);
      onUpdate();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // 重启连接
  const handleRestart = async () => {
    if (!server) return;
    setLoading(true);
    try {
      await api.restartBot(server.id);
      toast({ title: "成功", description: "正在重启..." });
      onUpdate();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (!server) return null;

  const isPanel = server.type === "panel";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${
                  server.connected ? "bg-green-500" :
                  isPanel && server.tcpOnline ? "bg-green-500" :
                  isPanel && server.panelServerState === "running" ? "bg-yellow-500" :
                  "bg-gray-400"
                }`}
              />
              {server.name || server.id}
              {isPanel && (
                <Badge variant="secondary" className="text-xs">面板</Badge>
              )}
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Badge variant={server.connected || (isPanel && server.tcpOnline) ? "default" : "outline"}>
                {server.connected ? "在线" :
                 isPanel && server.tcpOnline ? "TCP在线" :
                 isPanel && server.panelServerState === "running" ? "运行中" :
                 "离线"}
              </Badge>
              {!isPanel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRestart}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="control" className="gap-1">
              <Activity className="h-4 w-4" />
              控制
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1">
              <Settings className="h-4 w-4" />
              配置
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-1">
              <Terminal className="h-4 w-4" />
              日志
            </TabsTrigger>
          </TabsList>

          {/* 控制面板 */}
          <TabsContent value="control" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              {/* 服务器信息 */}
              <div className="p-4 rounded-lg border bg-muted/30">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">地址：</span>
                    <span className="font-mono">
                      {isPanel && server.serverHost
                        ? `${server.serverHost}:${server.serverPort}`
                        : `${server.host}:${server.port}`}
                    </span>
                  </div>
                  {!isPanel && server.username && (
                    <div>
                      <span className="text-muted-foreground">用户名：</span>
                      <span>{server.username}</span>
                    </div>
                  )}
                  {server.connected && server.position && (
                    <div>
                      <span className="text-muted-foreground">坐标：</span>
                      <span>
                        X:{Math.floor(server.position.x)} Y:{Math.floor(server.position.y)} Z:{Math.floor(server.position.z)}
                      </span>
                    </div>
                  )}
                  {server.connected && server.health !== undefined && (
                    <div>
                      <span className="text-muted-foreground">状态：</span>
                      <span>{Math.floor(server.health)}/20 HP | {Math.floor(server.food || 0)}/20 饱食度</span>
                    </div>
                  )}
                  {isPanel && server.panelServerStats && server.panelServerState === "running" && (
                    <>
                      <div>
                        <span className="text-muted-foreground">CPU：</span>
                        <span>{server.panelServerStats.cpuPercent.toFixed(1)}%</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">内存：</span>
                        <span>{(server.panelServerStats.memoryBytes / 1024 / 1024).toFixed(0)} MB</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Bot 控制面板 */}
              <BotControlPanel
                botId={server.id}
                botName={server.username || server.name}
                connected={server.connected || false}
                serverType={server.type || "minecraft"}
                panelServerState={server.panelServerState}
                modes={server.modes}
                players={server.players}
                restartTimer={server.restartTimer}
                autoChat={server.autoChat}
                pterodactyl={server.pterodactyl}
                sftp={server.sftp}
                fileAccessType={server.fileAccessType}
                onUpdate={onUpdate}
              />
            </div>
          </TabsContent>

          {/* 配置编辑 */}
          <TabsContent value="settings" className="flex-1 overflow-auto mt-4">
            <div className="space-y-4">
              {editing ? (
                <div className="space-y-4 p-4 rounded-lg border">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>名称</Label>
                      <Input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="服务器名称"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>用户名</Label>
                      <Input
                        value={editForm.username}
                        onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                        placeholder="机器人用户名"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2 space-y-2">
                      <Label>服务器地址</Label>
                      <Input
                        value={editForm.host}
                        onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                        placeholder="mc.example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>端口</Label>
                      <Input
                        value={editForm.port}
                        onChange={(e) => setEditForm({ ...editForm, port: e.target.value })}
                        placeholder="25565"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="outline" onClick={() => setEditing(false)} disabled={loading}>
                      <X className="h-4 w-4 mr-1" />
                      取消
                    </Button>
                    <Button onClick={handleSave} disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      <Check className="h-4 w-4 mr-1" />
                      保存
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-lg border">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">名称：</span>
                        <span>{server.name || "-"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">用户名：</span>
                        <span>{server.username || "自动生成"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">地址：</span>
                        <span className="font-mono">{server.host}:{server.port}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">类型：</span>
                        <span>{isPanel ? "纯面板" : "游戏服务器"}</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-4 w-4 mr-1" />
                    编辑配置
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 日志面板 */}
          <TabsContent value="logs" className="flex-1 flex flex-col min-h-0 mt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted-foreground">实时日志 ({logs.length} 条)</span>
              <Button variant="ghost" size="sm" onClick={clearLogs}>
                <Trash className="h-4 w-4 mr-1" />
                清空
              </Button>
            </div>
            <div className="flex-1 min-h-0 rounded-lg border bg-muted/30 overflow-auto p-3 font-mono text-xs space-y-1">
              {logs.length === 0 ? (
                <div className="text-muted-foreground text-center py-8">暂无日志</div>
              ) : (
                logs.slice(-100).map((log) => (
                  <div
                    key={log.id}
                    className={`flex items-start gap-2 ${
                      log.type === "error" ? "text-red-400" :
                      log.type === "warning" ? "text-yellow-400" :
                      log.type === "success" ? "text-green-400" :
                      log.type === "chat" ? "text-purple-400" :
                      "text-muted-foreground"
                    }`}
                  >
                    <span className="shrink-0 opacity-60">[{log.timestamp}]</span>
                    {log.icon && <span className="shrink-0">{log.icon}</span>}
                    <span className="break-all">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
