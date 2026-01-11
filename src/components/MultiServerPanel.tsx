import { useState, useEffect } from "react";
import { Server, Plus, Trash2, Power, PowerOff, RefreshCw, Loader2, Pencil, X, Check, Terminal, ChevronDown, Trash, MonitorCog, Bot, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  type?: "minecraft" | "panel";  // 服务器类型
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
  // 纯面板服务器的状态
  panelServerState?: string;
  panelServerStats?: {
    cpuPercent: number;
    memoryBytes: number;
    diskBytes: number;
    uptime: number;
  };
  // TCP ping 状态（从面板API获取的地址）
  serverHost?: string;
  serverPort?: number;
  tcpOnline?: boolean | null;
  tcpLatency?: number | null;
}

export function MultiServerPanel() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [loading, setLoading] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const [newServer, setNewServer] = useState({
    type: "minecraft" as "minecraft" | "panel",
    name: "",
    host: "",
    port: "25565",
    username: "",
  });
  const [editingServer, setEditingServer] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    host: "",
    port: "25565",
    username: "",
  });
  // 每个机器人的日志状态
  const [botLogs, setBotLogs] = useState<Record<string, LogEntry[]>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  const fetchServers = async () => {
    try {
      const data = await api.getBots();
      setServers(data);
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    }
  };

  // 获取单个机器人的日志
  const fetchBotLogs = async (botId: string) => {
    try {
      const result = await api.getBotLogs(botId);
      if (result.success) {
        setBotLogs(prev => ({ ...prev, [botId]: result.logs }));
      }
    } catch (error) {
      console.error("Failed to fetch bot logs:", error);
    }
  };

  // 清空单个机器人的日志
  const clearBotLogs = async (botId: string) => {
    try {
      await api.clearBotLogs(botId);
      setBotLogs(prev => ({ ...prev, [botId]: [] }));
      toast({ title: "成功", description: "日志已清空" });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    }
  };

  // 切换日志面板
  const toggleLogs = (botId: string) => {
    const isOpen = !openLogs[botId];
    setOpenLogs(prev => ({ ...prev, [botId]: isOpen }));
    if (isOpen) {
      fetchBotLogs(botId);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 10000); // 10秒轮询一次
    return () => clearInterval(interval);
  }, []);

  // 自动刷新打开的日志
  useEffect(() => {
    const openBotIds = Object.entries(openLogs).filter(([, open]) => open).map(([id]) => id);
    if (openBotIds.length === 0) return;

    const interval = setInterval(() => {
      openBotIds.forEach(id => fetchBotLogs(id));
    }, 5000); // 5秒刷新一次日志
    return () => clearInterval(interval);
  }, [openLogs]);

  const handleAddServer = async () => {
    // 游戏服务器需要 host，面板服务器需要名称
    if (newServer.type === "minecraft" && !newServer.host) {
      toast({ title: "错误", description: "请输入服务器地址", variant: "destructive" });
      return;
    }
    if (newServer.type === "panel" && !newServer.name) {
      toast({ title: "错误", description: "请输入服务器名称", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await api.addServer({
        type: newServer.type,
        name: newServer.name || `Server ${Object.keys(servers).length + 1}`,
        host: newServer.type === "minecraft" ? newServer.host : "",
        port: newServer.type === "minecraft" ? (parseInt(newServer.port) || 25565) : 0,
        username: newServer.type === "minecraft" ? (newServer.username || undefined) : undefined,
      });
      toast({ title: "成功", description: newServer.type === "panel" ? "面板服务器已添加" : "服务器已添加并开始连接" });
      setNewServer({ type: "minecraft", name: "", host: "", port: "25565", username: "" });
      setAddingServer(false);
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveServer = async (id: string) => {
    setLoading(true);
    try {
      await api.removeServer(id);
      toast({ title: "成功", description: "服务器已移除" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleRestartServer = async (id: string) => {
    setLoading(true);
    try {
      await api.restartBot(id);
      toast({ title: "成功", description: "正在重启..." });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleConnectAll = async () => {
    setLoading(true);
    try {
      await api.connectAll();
      toast({ title: "成功", description: "正在连接所有服务器..." });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectAll = async () => {
    setLoading(true);
    try {
      await api.disconnectAll();
      toast({ title: "成功", description: "已断开所有连接" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchType = async (id: string, currentType: string) => {
    const newType = currentType === "panel" ? "minecraft" : "panel";
    const confirmMsg = newType === "panel"
      ? "切换为仅面板模式后，机器人将断开连接。确定吗？"
      : "切换为机器人模式后，需要手动连接。确定吗？";

    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const result = await api.switchServerType(id, newType);
      toast({ title: "成功", description: result.message });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleStartEdit = (server: ServerConfig) => {
    setEditingServer(server.id);
    setEditForm({
      name: server.name || "",
      host: server.host || "",
      port: String(server.port || 25565),
      username: server.username || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingServer(null);
    setEditForm({ name: "", host: "", port: "25565", username: "" });
  };

  const handleUpdateServer = async (id: string) => {
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
      await api.updateServer(id, {
        name: editForm.name || undefined,
        host: editForm.host || undefined,
        port: parseInt(editForm.port) || 25565,
        username: editForm.username || undefined,
      });
      toast({ title: "成功", description: "服务器配置已更新" });
      setEditingServer(null);
      setEditForm({ name: "", host: "", port: "25565", username: "" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const serverList = Object.values(servers);
  const connectedCount = serverList.filter((s: any) => s.connected).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              多服务器管理
            </CardTitle>
            <CardDescription>
              {serverList.length} 个服务器，{connectedCount} 个已连接
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnectAll}
              disabled={loading}
            >
              <Power className="h-4 w-4 mr-1" />
              全部连接
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnectAll}
              disabled={loading}
            >
              <PowerOff className="h-4 w-4 mr-1" />
              全部断开
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Server List */}
        {serverList.length > 0 ? (
          <div className="space-y-2">
            {serverList.map((server: any) => (
              <div
                key={server.id}
                className="p-3 rounded-lg border bg-card"
              >
                {editingServer === server.id ? (
                  /* 编辑模式 */
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">名称</Label>
                        <Input
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="服务器名称"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">用户名</Label>
                        <Input
                          value={editForm.username}
                          onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                          placeholder="机器人用户名"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2 space-y-1">
                        <Label className="text-xs">服务器地址</Label>
                        <Input
                          value={editForm.host}
                          onChange={(e) => setEditForm({ ...editForm, host: e.target.value })}
                          placeholder="mc.example.com"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">端口</Label>
                        <Input
                          value={editForm.port}
                          onChange={(e) => setEditForm({ ...editForm, port: e.target.value })}
                          placeholder="25565"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        disabled={loading}
                      >
                        <X className="h-4 w-4 mr-1" />
                        取消
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleUpdateServer(server.id)}
                        disabled={loading}
                      >
                        {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                        <Check className="h-4 w-4 mr-1" />
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* 显示模式 */
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            server.connected ? "bg-green-500" :
                            server.type === "panel" && server.tcpOnline ? "bg-green-500" :
                            server.type === "panel" && server.panelServerState === "running" ? "bg-yellow-500" :
                            "bg-gray-400"
                          }`}
                        />
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {server.serverName || server.name || server.id}
                            {server.type === "panel" && (
                              <Badge variant="secondary" className="text-xs">面板</Badge>
                            )}
                          </div>
                          {server.type === "panel" ? (
                            /* 纯面板服务器信息 */
                            <div className="text-sm text-muted-foreground">
                              {/* 服务器地址（从面板API获取） */}
                              {server.serverHost && server.serverPort && (
                                <span className="text-blue-400 mr-2">
                                  {server.serverHost}:{server.serverPort}
                                </span>
                              )}
                              {/* TCP 在线时只显示在线状态，否则显示面板状态 */}
                              {server.tcpOnline ? (
                                <span className="text-green-400">
                                  在线 {server.tcpLatency ? `(${server.tcpLatency}ms)` : ""}
                                </span>
                              ) : server.panelServerState ? (
                                <span className={
                                  server.panelServerState === "running" ? "text-green-500" :
                                  server.panelServerState === "starting" ? "text-yellow-500" :
                                  server.panelServerState === "stopping" ? "text-yellow-500" :
                                  "text-gray-400"
                                }>
                                  {server.panelServerState === "running" ? "运行中" :
                                   server.panelServerState === "starting" ? "启动中" :
                                   server.panelServerState === "stopping" ? "停止中" :
                                   server.panelServerState === "offline" ? "已停止" :
                                   server.panelServerState}
                                  {server.tcpOnline === false && " (TCP 离线)"}
                                </span>
                              ) : (
                                <span className="text-gray-400">未连接面板</span>
                              )}
                              {/* 资源使用 */}
                              {server.panelServerStats && server.panelServerState === "running" && (
                                <span className="ml-2">
                                  | CPU: {server.panelServerStats.cpuPercent.toFixed(1)}%
                                  | 内存: {(server.panelServerStats.memoryBytes / 1024 / 1024).toFixed(0)}MB
                                </span>
                              )}
                            </div>
                          ) : (
                            /* 游戏服务器信息 */
                            <>
                              <div className="text-sm text-muted-foreground">
                                {server.serverAddress || `${server.host}:${server.port}`}
                                {server.username && ` (${server.username})`}
                              </div>
                              {/* 显示坐标和生命值 */}
                              {server.connected && server.position && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  X:{Math.floor(server.position.x)} Y:{Math.floor(server.position.y)} Z:{Math.floor(server.position.z)}
                                  {server.health !== undefined && ` | ${Math.floor(server.health)}/20`}
                                  {server.food !== undefined && ` | ${Math.floor(server.food)}/20`}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {server.type === "panel" ? (
                          <Badge
                            variant={server.tcpOnline ? "default" : server.panelServerState === "running" ? "secondary" : "outline"}
                            className={server.tcpOnline ? "bg-green-600" : server.panelServerState === "running" && !server.tcpOnline ? "bg-yellow-600 text-white" : ""}
                          >
                            {server.tcpOnline
                              ? "TCP 在线"
                              : server.panelServerState === "running"
                                ? "运行中"
                                : server.panelServerState === "starting"
                                  ? "启动中"
                                  : server.panelServerState === "stopping"
                                    ? "停止中"
                                    : "已停止"}
                          </Badge>
                        ) : (
                          <Badge variant={server.connected ? "default" : "outline"}>
                            {server.connected ? "在线" : "离线"}
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStartEdit(server)}
                          disabled={loading}
                          title="编辑配置"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleSwitchType(server.id, server.type || "minecraft")}
                          disabled={loading}
                          title={server.type === "panel" ? "切换为机器人模式" : "切换为仅面板模式"}
                        >
                          {server.type === "panel" ? <Bot className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                        </Button>
                        {server.type !== "panel" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRestartServer(server.id)}
                            disabled={loading}
                            title="重启连接"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveServer(server.id)}
                          disabled={loading}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* 行为控制面板 */}
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
                      onUpdate={fetchServers}
                    />

                    {/* 日志面板 */}
                    <Collapsible open={openLogs[server.id]} onOpenChange={() => toggleLogs(server.id)}>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full justify-between mt-2">
                          <div className="flex items-center gap-2">
                            <Terminal className="h-4 w-4" />
                            <span className="text-xs">控制台日志</span>
                            <span className="text-xs text-muted-foreground">
                              ({botLogs[server.id]?.length || 0} 条)
                            </span>
                          </div>
                          <ChevronDown className={`h-4 w-4 transition-transform ${openLogs[server.id] ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-2 rounded-lg border bg-muted/30 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/50">
                            <span className="text-xs text-muted-foreground">实时日志</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={(e) => { e.stopPropagation(); clearBotLogs(server.id); }}
                            >
                              <Trash className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="h-40 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
                            {(botLogs[server.id] || []).length === 0 ? (
                              <div className="text-muted-foreground text-center py-4">暂无日志</div>
                            ) : (
                              (botLogs[server.id] || []).slice(-50).map((log) => (
                                <div
                                  key={log.id}
                                  className={`flex items-start gap-1.5 ${
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
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            暂无服务器，点击下方按钮添加
          </div>
        )}

        {/* Add Server Form */}
        {addingServer ? (
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            {/* 类型选择 */}
            <div className="flex gap-2">
              <Button
                variant={newServer.type === "minecraft" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewServer({ ...newServer, type: "minecraft" })}
                className="flex-1"
              >
                <Server className="h-4 w-4 mr-1" />
                游戏服务器
              </Button>
              <Button
                variant={newServer.type === "panel" ? "default" : "outline"}
                size="sm"
                onClick={() => setNewServer({ ...newServer, type: "panel" })}
                className="flex-1"
              >
                <MonitorCog className="h-4 w-4 mr-1" />
                纯面板服务器
              </Button>
            </div>

            {newServer.type === "panel" ? (
              /* 纯面板服务器表单 */
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>服务器名称 *</Label>
                  <Input
                    placeholder="我的面板服务器"
                    value={newServer.name}
                    onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  纯面板服务器不需要 Minecraft 连接，只通过翼龙面板 API 控制。添加后请在设置中配置面板信息。
                </p>
              </div>
            ) : (
              /* 游戏服务器表单 */
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>名称</Label>
                    <Input
                      placeholder="我的服务器"
                      value={newServer.name}
                      onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>用户名 (留空随机)</Label>
                    <Input
                      placeholder="自动生成"
                      value={newServer.username}
                      onChange={(e) => setNewServer({ ...newServer, username: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label>服务器地址 *</Label>
                    <Input
                      placeholder="mc.example.com"
                      value={newServer.host}
                      onChange={(e) => setNewServer({ ...newServer, host: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>端口</Label>
                    <Input
                      placeholder="25565"
                      value={newServer.port}
                      onChange={(e) => setNewServer({ ...newServer, port: e.target.value })}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setAddingServer(false)}
                disabled={loading}
              >
                取消
              </Button>
              <Button onClick={handleAddServer} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                {newServer.type === "panel" ? "添加面板服务器" : "添加并连接"}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setAddingServer(true)}
          >
            <Plus className="h-4 w-4 mr-1" />
            添加服务器
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
