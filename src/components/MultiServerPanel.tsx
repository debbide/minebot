import { useState, useEffect } from "react";
import { Server, Plus, Trash2, Power, PowerOff, RefreshCw, Loader2, Pencil, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { BotControlPanel } from "./BotControlPanel";

interface ServerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  username?: string;
  connected?: boolean;
  serverAddress?: string;
  version?: string;
  players?: string[];
  modes?: {
    follow?: boolean;
    autoAttack?: boolean;
    patrol?: boolean;
    mining?: boolean;
    aiView?: boolean;
    autoChat?: boolean;
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
}

export function MultiServerPanel() {
  const [servers, setServers] = useState<Record<string, ServerConfig>>({});
  const [loading, setLoading] = useState(false);
  const [addingServer, setAddingServer] = useState(false);
  const [newServer, setNewServer] = useState({
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
  const { toast } = useToast();

  const fetchServers = async () => {
    try {
      const data = await api.getBots();
      setServers(data);
    } catch (error) {
      console.error("Failed to fetch servers:", error);
    }
  };

  useEffect(() => {
    fetchServers();
    const interval = setInterval(fetchServers, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleAddServer = async () => {
    if (!newServer.host) {
      toast({ title: "错误", description: "请输入服务器地址", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await api.addServer({
        name: newServer.name || `Server ${Object.keys(servers).length + 1}`,
        host: newServer.host,
        port: parseInt(newServer.port) || 25565,
        username: newServer.username || undefined,
      });
      toast({ title: "成功", description: "服务器已添加并开始连接" });
      setNewServer({ name: "", host: "", port: "25565", username: "" });
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
                            server.connected ? "bg-green-500" : "bg-gray-400"
                          }`}
                        />
                        <div>
                          <div className="font-medium">{server.serverName || server.name || server.id}</div>
                          <div className="text-sm text-muted-foreground">
                            {server.serverAddress || `${server.host}:${server.port}`}
                            {server.username && ` (${server.username})`}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={server.connected ? "default" : "outline"}>
                          {server.connected ? "在线" : "离线"}
                        </Badge>
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
                          onClick={() => handleRestartServer(server.id)}
                          disabled={loading}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
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
                      modes={server.modes}
                      players={server.players}
                      restartTimer={server.restartTimer}
                      autoChat={server.autoChat}
                      pterodactyl={server.pterodactyl}
                      onUpdate={fetchServers}
                    />
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
                添加并连接
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
