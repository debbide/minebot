import { useState, useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  FolderOpen,
} from "lucide-react";
import { api, BotStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatUptime } from "@/lib/utils";
import { BotControlPanel } from "./BotControlPanel";
import { BotSettingsPanel } from "./BotSettingsPanel";
import { FileManager } from "./FileManager";

interface LogEntry {
  id: number;
  timestamp: string;
  type: "info" | "success" | "warning" | "error" | "chat";
  icon?: string;
  message: string;
}

// 使用从 api.ts 导入的 BotStatus 作为 ServerConfig 的别名
type ServerConfig = BotStatus;

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
  const contentRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // 切换标签时重置滚动位置
  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeTab]);

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-[600px] flex flex-col p-0 gap-0 border-l border-border/40 bg-background/80 backdrop-blur-xl">
        <SheetHeader className="p-6 pb-2 border-b border-border/10">
          <div className="flex items-center justify-between pr-8">
            <SheetTitle className="flex items-center gap-3 text-xl">
              <div
                className={`w-3 h-3 rounded-full shadow-lg ${server.connected ? "bg-emerald-500 shadow-emerald-500/50" :
                  isPanel && server.tcpOnline ? "bg-emerald-500 shadow-emerald-500/50" :
                    isPanel && server.panelServerState === "running" ? "bg-yellow-500 shadow-yellow-500/50" :
                      "bg-muted-foreground/30"
                  }`}
              />
              {server.name || server.id}
              {isPanel && server.panelServerStats && (
                <Badge variant="secondary" className="text-xs bg-secondary/30 font-mono font-normal">
                  {formatUptime(server.panelServerStats.uptime)}
                </Badge>
              )}
            </SheetTitle>
            <div className="flex items-center gap-2">
              <Badge variant={server.connected || (isPanel && server.tcpOnline) ? "default" : "outline"} className="h-6">
                {server.connected ? "在线" :
                  isPanel && server.tcpOnline ? "TCP在线" :
                    isPanel && server.panelServerState === "running" ? "运行中" :
                      "离线"}
              </Badge>
              {!isPanel && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleRestart}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-2 border-b border-border/10">
            <TabsList className="bg-transparent p-0 h-auto gap-6">
              <TabsTrigger
                value="control"
                className="gap-2 px-0 pb-3 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
              >
                <Activity className="h-4 w-4" />
                控制台
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="gap-2 px-0 pb-3 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
              >
                <Settings className="h-4 w-4" />
                设置
              </TabsTrigger>
              <TabsTrigger
                value="logs"
                className="gap-2 px-0 pb-3 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
              >
                <Terminal className="h-4 w-4" />
                日志
              </TabsTrigger>
              {(server.pterodactyl?.url || (server.sftp?.host && server.fileAccessType === 'sftp')) && (
                <TabsTrigger
                  value="files"
                  className="gap-2 px-0 pb-3 rounded-none bg-transparent border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none transition-all"
                >
                  <FolderOpen className="h-4 w-4" />
                  文件
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* 文件管理 - 完全独立的层，覆盖其他内容 */}
          {activeTab === 'files' && (server.pterodactyl?.url || (server.sftp?.host && server.fileAccessType === 'sftp')) && (
            <div className="flex-1 overflow-y-auto p-6">
              <FileManager
                serverId={server.id}
                serverName={server.name || server.id}
                compact
              />
            </div>
          )}

          {/* 其他标签页内容 */}
          {activeTab !== 'files' && (
            <div ref={contentRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6">
              {/* 控制面板 */}
              <TabsContent value="control" className="mt-0 space-y-6 animate-in slide-in-from-bottom-2 duration-300">
                {/* 服务器信息 */}
                <div className="p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
                  <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
                    <div className="flex flex-col gap-1">
                      <span className="text-muted-foreground text-xs uppercase tracking-wider">地址</span>
                      <span className="font-mono font-medium">
                        {isPanel && server.serverHost
                          ? `${server.serverHost}:${server.serverPort}`
                          : `${server.host}:${server.port}`}
                      </span>
                    </div>
                    {!isPanel && server.username && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">用户名</span>
                        <span className="font-medium">{server.username}</span>
                      </div>
                    )}
                    {server.connected && server.position && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">坐标</span>
                        <span className="font-mono">
                          X:{Math.floor(server.position.x)} Y:{Math.floor(server.position.y)} Z:{Math.floor(server.position.z)}
                        </span>
                      </div>
                    )}
                    {server.connected && server.health !== undefined && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">状态</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px] px-1 h-5 border-green-500/30 text-green-500">HP {Math.floor(server.health)}</Badge>
                          <Badge variant="outline" className="text-[10px] px-1 h-5 border-orange-500/30 text-orange-500">FD {Math.floor(server.food || 0)}</Badge>
                        </div>
                      </div>
                    )}
                    {isPanel && server.panelServerStats && server.panelServerState === "running" && (
                      <>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">CPU</span>
                          <span className="font-mono">{server.panelServerStats.cpuPercent.toFixed(1)}%</span>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-muted-foreground text-xs uppercase tracking-wider">内存</span>
                          <span className="font-mono">{(server.panelServerStats.memoryBytes / 1024 / 1024).toFixed(0)} MB</span>
                        </div>
                      </>
                    )}
                    {!isPanel && server.version && (
                      <div className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider">版本</span>
                        <span className="font-mono">{server.version}</span>
                      </div>
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
              </TabsContent>

              {/* 配置编辑 */}
              <TabsContent value="settings" className="mt-0 animate-in slide-in-from-bottom-2 duration-300 h-full overflow-y-auto p-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                <div className="space-y-8 pb-10">
                  {/* 基本信息编辑 */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium">基本信息</h3>
                      {!editing && (
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          编辑
                        </Button>
                      )}
                    </div>

                    {editing ? (
                      <div className="space-y-6 p-6 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
                        <div className="grid gap-6">
                          <div className="space-y-2">
                            <Label>服务器名称</Label>
                            <Input
                              value={editForm.name}
                              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                              placeholder="My Server"
                              className="bg-background/50"
                            />
                          </div>

                          {!isPanel && (
                            <div className="space-y-2">
                              <Label>机器人用户名</Label>
                              <Input
                                value={editForm.username}
                                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                                placeholder="Bot Name"
                                className="bg-background/50"
                              />
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                          <div className="col-span-2 space-y-2">
                            <Label>主机地址</Label>
                            <Input
                              value={editForm.host}
                              onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                              placeholder="mc.example.com"
                              className="bg-background/50 font-mono"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>端口</Label>
                            <Input
                              value={editForm.port}
                              onChange={(e) => setEditForm({ ...editForm, port: e.target.value })}
                              placeholder="25565"
                              className="bg-background/50 font-mono"
                            />
                          </div>
                        </div>

                        <div className="flex gap-3 justify-end pt-2">
                          <Button variant="ghost" onClick={() => setEditing(false)} disabled={loading}>
                            取消
                          </Button>
                          <Button onClick={handleSave} disabled={loading}>
                            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            保存基本信息
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
                        <dl className="grid grid-cols-1 gap-y-4 text-sm">
                          <div className="grid grid-cols-3">
                            <dt className="text-muted-foreground">显示名称</dt>
                            <dd className="col-span-2 font-medium">{server.name || "-"}</dd>
                          </div>
                          <div className="grid grid-cols-3">
                            <dt className="text-muted-foreground">服务器类型</dt>
                            <dd className="col-span-2">{isPanel ? "纯面板托管" : "Minecraft 游戏服务器"}</dd>
                          </div>
                          {!isPanel && (
                            <div className="grid grid-cols-3">
                              <dt className="text-muted-foreground">机器人名称</dt>
                              <dd className="col-span-2 font-mono">{server.username || "自动生成"}</dd>
                            </div>
                          )}
                          <div className="grid grid-cols-3">
                            <dt className="text-muted-foreground">连接地址</dt>
                            <dd className="col-span-2 font-mono">{server.host}:{server.port}</dd>
                          </div>
                        </dl>
                      </div>
                    )}
                  </div>

                  {/* 高级功能设置 */}
                  <div className="space-y-4 pt-4 border-t border-border/50">
                    <h3 className="text-lg font-medium">高级功能</h3>
                    <div className="p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm">
                      <BotSettingsPanel
                        botId={server.id}
                        restartTimer={server.restartTimer}
                        autoChat={server.autoChat}
                        pterodactyl={server.pterodactyl}
                        sftp={server.sftp}
                        fileAccessType={server.fileAccessType}
                        proxyNodeId={server.proxyNodeId}
                        autoReconnect={server.autoReconnect}
                        onUpdate={onUpdate}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* 日志面板 */}
              <TabsContent value="logs" className="mt-0 h-full flex flex-col animate-in slide-in-from-bottom-2 duration-300">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">实时日志 ({logs.length})</span>
                  <Button variant="ghost" size="sm" onClick={clearLogs} className="h-8 text-muted-foreground hover:text-destructive">
                    <Trash className="h-4 w-4 mr-2" />
                    清空
                  </Button>
                </div>
                <div className="flex-1 rounded-xl border border-border/50 bg-black/40 overflow-hidden relative">
                  <div className="absolute inset-0 overflow-auto p-4 font-mono text-xs space-y-1.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {logs.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50 gap-2">
                        <Terminal className="h-8 w-8 opacity-20" />
                        <p>暂无日志记录</p>
                      </div>
                    ) : (
                      logs.slice(-100).map((log) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-3 py-0.5 ${log.type === "error" ? "text-red-400" :
                            log.type === "warning" ? "text-yellow-400" :
                              log.type === "success" ? "text-emerald-400" :
                                log.type === "chat" ? "text-purple-400" :
                                  "text-zinc-400"
                            }`}
                        >
                          <span className="shrink-0 opacity-40 select-none w-[70px] text-[10px] mt-[1px] font-sans text-right">
                            {log.timestamp.split('T')[1]?.split('.')[0] || log.timestamp}
                          </span>
                          <div className="flex-1 break-all leading-relaxed">
                            {log.icon && <span className="mr-2 opacity-80">{log.icon}</span>}
                            {log.message}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
