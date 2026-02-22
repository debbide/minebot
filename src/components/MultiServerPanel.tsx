import { useState, useEffect, useMemo, useCallback } from "react";
import { useWebSocketContext } from "@/contexts/WebSocketContext";
import {
  Server,
  Plus,
  Trash2,
  Power,
  PowerOff,
  RefreshCw,
  Loader2,
  X,
  MonitorCog,
  Bot,
  Monitor,
  MoreVertical,
  Info,
  GripVertical,
  Zap,
  Cpu,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, BotStatus } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { formatUptime, formatSize } from "@/lib/utils";
import { ServerDetailDialog } from "./ServerDetailDialog";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 使用从 api.ts 导入的 BotStatus 作为 ServerConfig 的别名，保持代码可读性
type ServerConfig = BotStatus;

// 可排序服务器卡片组件
function SortableServerCard({
  server,
  getStatusColor,
  getStatusText,
  openDetail,
  handleRestartServer,
  handleSwitchType,
  handleRemoveServer,
}: {
  server: ServerConfig;
  getStatusColor: (server: ServerConfig) => string;
  getStatusText: (server: ServerConfig) => string;
  openDetail: (server: ServerConfig) => void;
  handleRestartServer: (id: string) => void;
  handleSwitchType: (id: string, type: string) => void;
  handleRemoveServer: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: server.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : 1,
  };

  const isPanel = server.type === "panel";
  const agentOnline = server.agentStatus?.connected;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-4 rounded-lg border bg-card hover:bg-accent/50 transition-all cursor-pointer group flex flex-col min-h-[140px] ${isDragging ? "shadow-lg" : ""
        }`}
      onClick={() => openDetail(server)}
    >
      {/* 拖拽手柄 */}
      <div
        className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* 状态指示灯 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${getStatusColor(server)}`} />
          <Badge
            variant={server.connected || (server.type === "panel" && server.tcpOnline) || agentOnline ? "default" : "secondary"}
            className="text-xs"
          >
            {getStatusText(server)}
          </Badge>
        </div>
        {server.type === "panel" && server.panelServerStats && (
          <Badge variant="secondary" className="text-xs bg-secondary/30 font-mono font-normal">
            {formatUptime(server.panelServerStats.uptime)}
          </Badge>
        )}
      </div>

      {/* 内容区域 (保持高度以对齐布局) */}
      <div className="flex-1">
        {/* 服务器名称 */}
        <h3 className="font-medium truncate mb-1">
          {server.name || server.id}
        </h3>
      </div>

      {/* 底部运行状态 (三元组网格) */}
      <div className="mt-4">
        <div className="grid grid-cols-3 gap-x-2 text-[10px] text-muted-foreground h-4">
          {server.tcpLatency !== undefined && server.tcpLatency !== null ? (
            <div className="flex items-center gap-1 shrink-0">
              <Zap className="h-3 w-3 text-yellow-500/80" />
              <span className="tabular-nums">{server.tcpLatency}ms</span>
            </div>
          ) : <div />}

          {server.panelServerStats ? (
            <>
              <div className="flex items-center gap-1 shrink-0">
                <Cpu className="h-3 w-3 text-blue-500/80" />
                <span className="tabular-nums">{server.panelServerStats.cpuPercent.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Activity className="h-3 w-3 text-green-500/80" />
                <span className="tabular-nums whitespace-nowrap">{formatSize(server.panelServerStats.memoryBytes)}</span>
              </div>
            </>
          ) : (
            <>
              {!isPanel && !server.tcpLatency ? (
                <span className="opacity-50 col-span-2">运行中</span>
              ) : (
                <>
                  <div />
                  <div />
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openDetail(server)}>
              <Info className="h-4 w-4 mr-2" />
              详情
            </DropdownMenuItem>
            {server.type !== "panel" && (
              <DropdownMenuItem onClick={() => handleRestartServer(server.id)}>
                <RefreshCw className="h-4 w-4 mr-2" />
                重启连接
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => handleSwitchType(server.id, server.type || "minecraft")}>
              {server.type === "panel" ? (
                <>
                  <Bot className="h-4 w-4 mr-2" />
                  切换为机器人
                </>
              ) : (
                <>
                  <Monitor className="h-4 w-4 mr-2" />
                  切换为面板
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => handleRemoveServer(server.id)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function MultiServerPanel() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const [newServer, setNewServer] = useState({
    type: "minecraft" as "minecraft" | "panel",
    name: "",
    host: "",
    port: "25565",
    username: "",
  });
  const [selectedServer, setSelectedServer] = useState<ServerConfig | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { toast } = useToast();
  const { botUpdates } = useWebSocketContext();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const fetchServers = useCallback(async () => {
    try {
      const data = await api.getBots();
      setServers(data);

      // 获取服务器ID列表，保持现有顺序
      const newIds = Object.keys(data);
      setOrderedIds(prevIds => {
        // 保留现有顺序中仍然存在的ID
        const existingIds = prevIds.filter(id => newIds.includes(id));
        // 添加新的ID
        const addedIds = newIds.filter(id => !prevIds.includes(id));
        return [...existingIds, ...addedIds];
      });

      // 更新选中的服务器数据
      setSelectedServer(prev => {
        if (!prev) return prev;
        const updated = data[prev.id];
        return updated || prev;
      });
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    if (botUpdates.size > 0) {
      setServers(prev => {
        const updated = { ...prev };
        botUpdates.forEach((botData, botId) => {
          updated[botId] = { ...(updated[botId] || {}), ...botData };
        });
        return updated;
      });

      setOrderedIds(prevIds => {
        const incomingIds = Array.from(botUpdates.keys());
        const addedIds = incomingIds.filter(id => !prevIds.includes(id));
        return [...prevIds, ...addedIds];
      });

      setSelectedServer(prev => {
        if (!prev) return prev;
        if (!botUpdates.has(prev.id)) return prev;
        return { ...prev, ...(botUpdates.get(prev.id) || {}) };
      });
    }
  }, [botUpdates]);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);

      const newOrderedIds = arrayMove(orderedIds, oldIndex, newIndex);
      setOrderedIds(newOrderedIds);

      // 保存到后端
      try {
        await api.reorderServers(newOrderedIds);
      } catch (error) {
        console.error("Failed to save order:", error);
      }
    }
  }, [orderedIds]);

  const handleAddServer = useCallback(async () => {
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
        port: newServer.type === "minecraft" ? (newServer.port ? parseInt(newServer.port) : 0) : 0,
        username: newServer.type === "minecraft" ? (newServer.username || undefined) : undefined,
      });
      toast({ title: "成功", description: newServer.type === "panel" ? "面板服务器已添加" : "服务器已添加并开始连接", variant: "success" });
      setNewServer({ type: "minecraft", name: "", host: "", port: "25565", username: "" });
      setAddingServer(false);
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [newServer, servers, toast, fetchServers]);

  const handleRemoveServer = useCallback(async (id: string) => {
    if (!confirm("确定要删除这个服务器吗？")) return;
    setLoading(true);
    try {
      await api.removeServer(id);
      toast({ title: "成功", description: "服务器已移除", variant: "success" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, fetchServers]);

  const handleRestartServer = useCallback(async (id: string) => {
    setLoading(true);
    try {
      await api.restartBot(id);
      toast({ title: "成功", description: "正在重启...", variant: "info" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast, fetchServers]);

  const handleConnectAll = async () => {
    setLoading(true);
    try {
      await api.connectAll();
      toast({ title: "成功", description: "正在连接所有服务器...", variant: "info" });
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
      toast({ title: "成功", description: "已断开所有连接", variant: "success" });
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
      toast({ title: "成功", description: result.message, variant: "success" });
      fetchServers();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (server: ServerConfig) => {
    setSelectedServer(server);
    setDetailOpen(true);
  };

  // 按顺序获取服务器列表（使用 useMemo 避免不必要的重新计算）
  const serverList = useMemo(() =>
    orderedIds
      .map(id => servers[id])
      .filter(Boolean) as ServerConfig[],
    [orderedIds, servers]
  );

  const connectedCount = useMemo(() =>
    serverList.filter((s) => s.connected).length,
    [serverList]
  );

  // 获取服务器状态颜色
  const getStatusColor = (server: ServerConfig) => {
    if (server.connected) return "bg-green-500";
    if (server.agentStatus?.connected) return "bg-green-500";
    if (server.type === "panel" && server.tcpOnline) return "bg-green-500";
    if (server.type === "panel" && server.panelServerState === "running") return "bg-yellow-500";
    return "bg-gray-400";
  };

  // 获取服务器状态文字
  const getStatusText = (server: ServerConfig) => {
    if (server.connected) return "在线";
    if (server.agentStatus?.connected) return "在线";
    if (server.type === "panel" && server.tcpOnline) return "TCP在线";
    if (server.type === "panel" && server.panelServerState === "running") return "运行中";
    if (server.type === "panel" && server.panelServerState === "starting") return "启动中";
    if (server.type === "panel" && server.panelServerState === "stopping") return "停止中";
    return "离线";
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                服务器管理
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {serverList.length} 个服务器，{connectedCount} 个已连接
              </p>
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
        <CardContent>
          {/* 服务器网格 */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {serverList.map((server) => (
                  <SortableServerCard
                    key={server.id}
                    server={server}
                    getStatusColor={getStatusColor}
                    getStatusText={getStatusText}
                    openDetail={openDetail}
                    handleRestartServer={handleRestartServer}
                    handleSwitchType={handleSwitchType}
                    handleRemoveServer={handleRemoveServer}
                  />
                ))}

                {/* 添加服务器卡片 */}
                {addingServer ? (
                  <div className="p-4 rounded-lg border bg-muted/30 col-span-1 sm:col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5">
                    <div className="space-y-4">
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
                            纯面板服务器通过翼龙面板 API 控制，添加后请在详情中配置面板信息。
                          </p>
                        </div>
                      ) : (
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
                                placeholder="25565 (留空自动解析)"
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
                          <X className="h-4 w-4 mr-1" />
                          取消
                        </Button>
                        <Button onClick={handleAddServer} disabled={loading}>
                          {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                          {newServer.type === "panel" ? "添加面板服务器" : "添加并连接"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-4 rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors cursor-pointer flex flex-col items-center justify-center min-h-[140px] text-muted-foreground hover:text-foreground"
                    onClick={() => setAddingServer(true)}
                  >
                    <Plus className="h-8 w-8 mb-2" />
                    <span className="text-sm font-medium">添加服务器</span>
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </CardContent>
      </Card>

      {/* 服务器详情弹窗 */}
      <ServerDetailDialog
        server={selectedServer}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onUpdate={fetchServers}
      />
    </>
  );
}
