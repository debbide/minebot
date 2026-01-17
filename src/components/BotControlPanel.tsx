import { useState } from "react";
import { useFileManager } from "@/contexts/FileManagerContext";
import {
  UserPlus,
  Sword,
  Navigation,
  Pickaxe,
  Square,
  ArrowUp,
  ChevronDown,
  Loader2,
  Timer,
  MessageSquare,
  Settings,
  Eye,
  Crown,
  RotateCcw,
  Power,
  PowerOff,
  Zap,
  Shield,
  FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";


interface BotControlPanelProps {
  botId: string;
  botName: string;
  connected: boolean;
  serverType?: "minecraft" | "panel";  // 服务器类型
  panelServerState?: string;  // 面板服务器状态
  modes?: {
    follow?: boolean;
    autoAttack?: boolean;
    patrol?: boolean;
    mining?: boolean;
    aiView?: boolean;
    autoChat?: boolean;
    invincible?: boolean;
  };
  players?: string[];
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
  onUpdate?: () => void;
}

export function BotControlPanel({
  botId,
  botName,
  connected,
  serverType = "minecraft",
  panelServerState,
  modes = {},
  players = [],
  restartTimer,
  autoChat: autoChatProp,
  pterodactyl,
  sftp: sftpProp,
  fileAccessType: fileAccessTypeProp = 'pterodactyl',
  onUpdate
}: BotControlPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [followTarget, setFollowTarget] = useState<string>("");
  const [attackMode, setAttackMode] = useState<string>("hostile");
  const { toast } = useToast();

  // 设置状态
  const [restartMinutes, setRestartMinutes] = useState<string>(
    restartTimer?.intervalMinutes?.toString() || "0"
  );
  const [autoChatEnabled, setAutoChatEnabled] = useState(autoChatProp?.enabled || false);
  const [autoChatInterval, setAutoChatInterval] = useState<string>(
    ((autoChatProp?.interval || 60000) / 1000).toString()
  );
  const [autoChatMessages, setAutoChatMessages] = useState<string>(
    autoChatProp?.messages?.join("\n") || ""
  );
  const [panelUrl, setPanelUrl] = useState(pterodactyl?.url || "");
  const [panelApiKey, setPanelApiKey] = useState(pterodactyl?.apiKey || "");
  const [panelServerId, setPanelServerId] = useState(pterodactyl?.serverId || "");
  const { openFileManager } = useFileManager();

  // SFTP 配置状态
  const [sftpHost, setSftpHost] = useState(sftpProp?.host || "");
  const [sftpPort, setSftpPort] = useState<string>((sftpProp?.port || 22).toString());
  const [sftpUsername, setSftpUsername] = useState(sftpProp?.username || "");
  const [sftpPassword, setSftpPassword] = useState(sftpProp?.password || "");
  const [sftpBasePath, setSftpBasePath] = useState(sftpProp?.basePath || "/");
  const [fileAccessType, setFileAccessType] = useState<'pterodactyl' | 'sftp' | 'none'>(fileAccessTypeProp);

  // 打开设置对话框时获取最新配置
  const handleOpenSettings = async () => {
    setSettingsOpen(true);
    try {
      const result = await api.getBotConfig(botId);
      if (result.success && result.config) {
        const cfg = result.config;
        // 同步所有配置到 state
        setRestartMinutes(cfg.restartTimer?.intervalMinutes?.toString() || "0");
        setAutoChatEnabled(cfg.autoChat?.enabled || false);
        setAutoChatInterval(((cfg.autoChat?.interval || 60000) / 1000).toString());
        setAutoChatMessages(cfg.autoChat?.messages?.join("\n") || "");
        setPanelUrl(cfg.pterodactyl?.url || "");
        setPanelApiKey(cfg.pterodactyl?.apiKey || "");
        setPanelServerId(cfg.pterodactyl?.serverId || "");
        // SFTP 配置
        setSftpHost(cfg.sftp?.host || "");
        setSftpPort((cfg.sftp?.port || 22).toString());
        setSftpUsername(cfg.sftp?.username || "");
        setSftpPassword(cfg.sftp?.password || "");
        setSftpBasePath(cfg.sftp?.basePath || "/");
        setFileAccessType(cfg.fileAccessType || 'pterodactyl');
      }
    } catch (error) {
      console.error("Failed to load bot config:", error);
    }
  };

  // 注意：不再使用 useEffect 同步 props 到 state
  // 因为父组件每 5 秒刷新一次，会覆盖用户正在输入的内容
  // 配置在打开对话框时通过 handleOpenSettings 获取

  const handleBehavior = async (behavior: string, enabled: boolean, options?: Record<string, unknown>) => {
    if (!connected) {
      toast({ title: "错误", description: "Bot 未连接", variant: "destructive" });
      return;
    }

    setLoading(behavior);
    try {
      const result = await api.setBehavior(botId, behavior, enabled, options);
      toast({ title: enabled ? "已启用" : "已停止", description: result.message });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleAction = async (action: string, params?: Record<string, unknown>) => {
    if (!connected) {
      toast({ title: "错误", description: "Bot 未连接", variant: "destructive" });
      return;
    }

    setLoading(action);
    try {
      const result = await api.doAction(botId, action, params);
      toast({ title: "执行成功", description: result.message });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleStopAll = async () => {
    setLoading("stop");
    try {
      await api.stopAllBehaviors(botId);
      toast({ title: "已停止", description: "所有行为已停止" });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 模式切换
  const handleModeToggle = async (mode: string, enabled: boolean) => {
    setLoading(mode);
    try {
      await api.setBotMode(botId, mode, enabled);
      toast({ title: enabled ? "已开启" : "已关闭", description: `${mode} 模式` });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 保存定时重启设置
  const handleSaveRestartTimer = async () => {
    setLoading("restartTimer");
    try {
      const minutes = parseInt(restartMinutes) || 0;
      await api.setRestartTimer(botId, minutes);
      toast({
        title: minutes > 0 ? "定时重启已设置" : "定时重启已禁用",
        description: minutes > 0 ? `每 ${minutes} 分钟发送 /restart` : ""
      });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 立即发送重启命令（机器人聊天）
  const handleRestartNow = async () => {
    setLoading("restartNow");
    try {
      await api.sendRestartCommand(botId);
      toast({ title: "已发送", description: "/restart 命令已发送" });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 通过翼龙面板发送重启命令到控制台
  const handlePanelRestart = async () => {
    setLoading("panelRestart");
    try {
      await api.sendPanelCommand(botId, "restart");
      toast({ title: "已发送", description: "restart 命令已发送到服务器控制台" });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 保存自动喊话设置
  const handleSaveAutoChat = async () => {
    setLoading("autoChat");
    try {
      const messages = autoChatMessages.split("\n").filter(m => m.trim());
      const interval = (parseInt(autoChatInterval) || 60) * 1000;
      await api.setAutoChat(botId, {
        enabled: autoChatEnabled,
        interval,
        messages
      });
      toast({ title: "自动喊话配置已保存" });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 保存翼龙面板设置
  const handleSavePterodactyl = async () => {
    setLoading("pterodactyl");
    try {
      await api.setPterodactyl(botId, {
        url: panelUrl,
        apiKey: panelApiKey,
        serverId: panelServerId
      });
      toast({ title: "翼龙面板配置已保存" });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 保存 SFTP 设置
  const handleSaveSftp = async () => {
    setLoading("sftp");
    try {
      await api.setSftp(botId, {
        host: sftpHost,
        port: parseInt(sftpPort) || 22,
        username: sftpUsername,
        password: sftpPassword,
        basePath: sftpBasePath
      });
      toast({ title: "SFTP 配置已保存" });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 保存文件访问方式
  const handleSaveFileAccessType = async (type: 'pterodactyl' | 'sftp' | 'none') => {
    setLoading("fileAccessType");
    try {
      await api.setFileAccessType(botId, type);
      setFileAccessType(type);
      toast({ title: "文件访问方式已设置", description: `当前模式: ${type === 'pterodactyl' ? '翼龙面板' : type === 'sftp' ? 'SFTP' : '禁用'}` });
      onUpdate?.();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 自动OP
  const handleAutoOp = async () => {
    setLoading("autoOp");
    try {
      const result = await api.autoOp(botId);
      toast({ title: "成功", description: result.message });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 发送电源信号
  const handlePowerSignal = async (signal: 'start' | 'stop' | 'restart' | 'kill') => {
    const signalNames = { start: '开机', stop: '关机', restart: '重启', kill: '强制终止' };
    setLoading(`power-${signal}`);
    try {
      const result = await api.sendPowerSignal(botId, signal);
      toast({
        title: result.success ? "成功" : "失败",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  // 设置按钮始终可见（用于翼龙面板开机等功能）
  // 其他功能按钮只在连接后显示

  // 纯面板服务器：只显示电源控制
  if (serverType === "panel") {
    return (
      <div className="space-y-2 mt-2">
        <div className="flex gap-2 flex-wrap">
          {/* 电源控制按钮 */}
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('start')}
            disabled={loading?.startsWith('power-') || !pterodactyl?.url}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading === "power-start" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Power className="h-4 w-4 mr-1" />}
            <span className="text-xs">开机</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('stop')}
            disabled={loading?.startsWith('power-') || !pterodactyl?.url}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {loading === "power-stop" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
            <span className="text-xs">关机</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('restart')}
            disabled={loading?.startsWith('power-') || !pterodactyl?.url}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading === "power-restart" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            <span className="text-xs">重启</span>
          </Button>
          {/* 文件管理按钮 */}
          <Button
            size="sm"
            variant="outline"
            title="文件管理"
            disabled={!pterodactyl?.url && !(sftpProp?.host && fileAccessTypeProp === 'sftp')}
            onClick={() => openFileManager(botId, botName)}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            <span className="text-xs">文件</span>
          </Button>
        </div>
        {!pterodactyl?.url && !(sftpHost && fileAccessType === 'sftp') && (
          <p className="text-xs text-muted-foreground">请先在设置中配置翼龙面板或 SFTP 信息</p>
        )}
      </div>
    );
  }

  // 游戏服务器：显示完整控制面板
  return (
    <div className="space-y-2 mt-2">
      {/* 快捷操作栏 */}
      <div className="flex gap-2 flex-wrap">
        {/* 需要连接才能使用的功能 */}
        {connected && (
          <>
            <Button
              size="sm"
              variant={modes.invincible ? "default" : "outline"}
              onClick={() => handleModeToggle("invincible", !modes.invincible)}
              disabled={loading !== null}
              title="无敌模式 - 抗性255+生命恢复"
              className={modes.invincible ? "bg-amber-600 hover:bg-amber-700" : ""}
            >
              {loading === "invincible" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4 mr-1" />}
              <span className="text-xs">无敌</span>
            </Button>
            <Button
              size="sm"
              variant={modes.aiView ? "default" : "outline"}
              onClick={() => handleModeToggle("aiView", !modes.aiView)}
              disabled={loading !== null}
              title="AI视角 - 自动看向附近玩家"
            >
              {loading === "aiView" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4 mr-1" />}
              <span className="text-xs">AI视角</span>
            </Button>
            <Button
              size="sm"
              variant={modes.autoChat ? "default" : "outline"}
              onClick={() => handleModeToggle("autoChat", !modes.autoChat)}
              disabled={loading !== null}
              title="自动喊话"
            >
              {loading === "autoChat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquare className="h-4 w-4 mr-1" />}
              <span className="text-xs">喊话</span>
            </Button>
          </>
        )}
        {/* 文件管理按钮 - 需要翼龙面板或 SFTP 配置 */}
        {(pterodactyl?.url || (sftpProp?.host && fileAccessTypeProp === 'sftp')) && (
          <Button
            size="sm"
            variant="outline"
            title="文件管理"
            onClick={() => openFileManager(botId, botName)}
          >
            <FolderOpen className="h-4 w-4 mr-1" />
            <span className="text-xs">文件</span>
          </Button>
        )}
        {/* 设置按钮始终可见 */}
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" title="服务器设置" onClick={handleOpenSettings}>
              <Settings className="h-4 w-4 mr-1" />
              <span className="text-xs">设置</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>服务器设置</DialogTitle>
              <DialogDescription>配置此服务器的独立设置</DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="restart" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="restart">定时重启</TabsTrigger>
                <TabsTrigger value="chat">自动喊话</TabsTrigger>
                <TabsTrigger value="panel">翼龙面板</TabsTrigger>
                <TabsTrigger value="sftp">SFTP</TabsTrigger>
              </TabsList>

              {/* 定时重启设置 */}
              <TabsContent value="restart" className="space-y-4 h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label>重启间隔 (分钟)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={restartMinutes}
                      onChange={(e) => setRestartMinutes(e.target.value)}
                      placeholder="0 = 禁用"
                      min="0"
                    />
                    <Button
                      onClick={handleSaveRestartTimer}
                      disabled={loading === "restartTimer"}
                    >
                      {loading === "restartTimer" ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    设置后机器人会定时发送 /restart 命令。设为 0 禁用。
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleRestartNow}
                    disabled={loading === "restartNow"}
                    className="flex-1"
                  >
                    {loading === "restartNow" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    立即发送 /restart
                  </Button>
                </div>
                {restartTimer?.nextRestart && (
                  <p className="text-xs text-muted-foreground">
                    下次重启: {new Date(restartTimer.nextRestart).toLocaleString()}
                  </p>
                )}
              </TabsContent>

              {/* 自动喊话设置 */}
              <TabsContent value="chat" className="space-y-4 h-[60vh] overflow-y-auto pr-2">
                <div className="flex items-center justify-between">
                  <Label>启用自动喊话</Label>
                  <Switch
                    checked={autoChatEnabled}
                    onCheckedChange={setAutoChatEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>间隔 (秒)</Label>
                  <Input
                    type="number"
                    value={autoChatInterval}
                    onChange={(e) => setAutoChatInterval(e.target.value)}
                    placeholder="60"
                    min="10"
                  />
                </div>
                <div className="space-y-2">
                  <Label>消息列表 (每行一条)</Label>
                  <Textarea
                    value={autoChatMessages}
                    onChange={(e) => setAutoChatMessages(e.target.value)}
                    placeholder="欢迎来到服务器！&#10;有问题可以问我&#10;需要帮助请输入 !help"
                    rows={4}
                  />
                </div>
                <Button
                  onClick={handleSaveAutoChat}
                  disabled={loading === "autoChat"}
                  className="w-full"
                >
                  {loading === "autoChat" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  保存自动喊话设置
                </Button>
              </TabsContent>

              {/* 翼龙面板设置 */}
              <TabsContent value="panel" className="space-y-4 h-[60vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label>面板地址</Label>
                  <Input
                    value={panelUrl}
                    onChange={(e) => setPanelUrl(e.target.value)}
                    placeholder="https://panel.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={panelApiKey}
                    onChange={(e) => setPanelApiKey(e.target.value)}
                    placeholder="ptlc_..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>服务器 ID</Label>
                  <Input
                    value={panelServerId}
                    onChange={(e) => setPanelServerId(e.target.value)}
                    placeholder="abc12345"
                  />
                </div>
                <Button
                  onClick={handleSavePterodactyl}
                  disabled={loading === "pterodactyl"}
                  className="w-full"
                >
                  {loading === "pterodactyl" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  保存面板配置
                </Button>

                {/* 电源控制按钮 */}
                <div className="pt-2 border-t">
                  <Label className="text-sm text-muted-foreground mb-2 block">服务器电源控制</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="default"
                      onClick={() => handlePowerSignal('start')}
                      disabled={loading?.startsWith('power-') || !panelUrl}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {loading === "power-start" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Power className="h-4 w-4 mr-1" />}
                      开机
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => handlePowerSignal('stop')}
                      disabled={loading?.startsWith('power-') || !panelUrl}
                      className="bg-yellow-600 hover:bg-yellow-700"
                    >
                      {loading === "power-stop" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
                      关机
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => handlePowerSignal('restart')}
                      disabled={loading?.startsWith('power-') || !panelUrl}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {loading === "power-restart" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                      重启
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => handlePowerSignal('kill')}
                      disabled={loading?.startsWith('power-') || !panelUrl}
                    >
                      {loading === "power-kill" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
                      强制终止
                    </Button>
                  </div>
                </div>

                {/* 其他操作按钮 */}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    onClick={handleAutoOp}
                    disabled={loading === "autoOp" || !panelUrl}
                    className="flex-1"
                  >
                    {loading === "autoOp" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Crown className="h-4 w-4 mr-1" />}
                    给机器人 OP
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handlePanelRestart}
                    disabled={loading === "panelRestart" || !panelUrl}
                    className="flex-1"
                  >
                    {loading === "panelRestart" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
                    控制台 restart
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  电源控制直接操作翼龙面板服务器电源状态。控制台命令发送到服务器控制台。
                </p>
              </TabsContent>

              {/* SFTP 设置 */}
              <TabsContent value="sftp" className="space-y-4 h-[60vh] overflow-y-auto pr-2">
                {/* 文件访问方式选择 */}
                <div className="space-y-2">
                  <Label>文件访问方式</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={fileAccessType === 'pterodactyl' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSaveFileAccessType('pterodactyl')}
                      disabled={loading === 'fileAccessType'}
                    >
                      翼龙面板
                    </Button>
                    <Button
                      variant={fileAccessType === 'sftp' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSaveFileAccessType('sftp')}
                      disabled={loading === 'fileAccessType'}
                    >
                      SFTP
                    </Button>
                    <Button
                      variant={fileAccessType === 'none' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => handleSaveFileAccessType('none')}
                      disabled={loading === 'fileAccessType'}
                    >
                      禁用
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    当前模式: {fileAccessType === 'pterodactyl' ? '翼龙面板' : fileAccessType === 'sftp' ? 'SFTP 直连' : '禁用'}
                  </p>
                </div>

                <div className="border-t pt-4 space-y-4">
                  <Label className="text-sm font-medium">SFTP 连接配置</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">主机地址</Label>
                      <Input
                        value={sftpHost}
                        onChange={(e) => setSftpHost(e.target.value)}
                        placeholder="192.168.1.100"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">端口</Label>
                      <Input
                        type="number"
                        value={sftpPort}
                        onChange={(e) => setSftpPort(e.target.value)}
                        placeholder="22"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">用户名</Label>
                    <Input
                      value={sftpUsername}
                      onChange={(e) => setSftpUsername(e.target.value)}
                      placeholder="root"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">密码</Label>
                    <Input
                      type="password"
                      value={sftpPassword}
                      onChange={(e) => setSftpPassword(e.target.value)}
                      placeholder="SSH 密码"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">基础路径</Label>
                    <Input
                      value={sftpBasePath}
                      onChange={(e) => setSftpBasePath(e.target.value)}
                      placeholder="/ 或 /home/minecraft"
                    />
                  </div>
                  <Button
                    onClick={handleSaveSftp}
                    disabled={loading === "sftp"}
                    className="w-full"
                  >
                    {loading === "sftp" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    保存 SFTP 配置
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    配置 SSH/SFTP 连接信息以直接访问服务器文件。基础路径用于限制可访问的目录范围。
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* 以下内容只在连接后显示 */}
      {connected && (
        <>
          {/* 状态徽章 */}
          <div className="flex flex-wrap gap-1">
            {modes.invincible && <Badge className="bg-amber-600">无敌</Badge>}
            {modes.follow && <Badge variant="secondary">跟随中</Badge>}
            {modes.autoAttack && <Badge variant="destructive">攻击中</Badge>}
            {modes.patrol && <Badge variant="secondary">巡逻中</Badge>}
            {modes.mining && <Badge variant="secondary">挖矿中</Badge>}
            {modes.aiView && <Badge variant="secondary">AI视角</Badge>}
            {modes.autoChat && <Badge variant="secondary">自动喊话</Badge>}
            {restartTimer?.enabled && (
              <Badge variant="outline">
                定时重启: {restartTimer.intervalMinutes}分钟
              </Badge>
            )}
          </div>

          {/* 行为控制折叠面板 */}
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between">
                <span className="text-xs">更多控制</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-3">
              <div className="flex gap-2">
                <Select value={followTarget} onValueChange={setFollowTarget}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue placeholder="选择玩家" />
                  </SelectTrigger>
                  <SelectContent>
                    {players.filter(p => p !== botName).map(player => (
                      <SelectItem key={player} value={player}>{player}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={modes.follow ? "destructive" : "outline"}
                  onClick={() => handleBehavior("follow", !modes.follow, { target: followTarget })}
                  disabled={loading !== null || (!modes.follow && !followTarget)}
                >
                  {loading === "follow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                </Button>
              </div>

              {/* 攻击控制 */}
              <div className="flex gap-2">
                <Select value={attackMode} onValueChange={setAttackMode}>
                  <SelectTrigger className="flex-1 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hostile">敌对生物</SelectItem>
                    <SelectItem value="all">所有生物</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={modes.autoAttack ? "destructive" : "outline"}
                  onClick={() => handleBehavior("attack", !modes.autoAttack, { mode: attackMode })}
                  disabled={loading !== null}
                >
                  {loading === "attack" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sword className="h-4 w-4" />}
                </Button>
              </div>

              {/* 其他行为按钮 */}
              <div className="grid grid-cols-4 gap-2">
                <Button
                  size="sm"
                  variant={modes.patrol ? "destructive" : "outline"}
                  onClick={() => handleBehavior("patrol", !modes.patrol)}
                  disabled={loading !== null}
                  title="巡逻"
                >
                  {loading === "patrol" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.mining ? "destructive" : "outline"}
                  onClick={() => handleBehavior("mining", !modes.mining)}
                  disabled={loading !== null}
                  title="挖矿"
                >
                  {loading === "mining" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pickaxe className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction("jump")}
                  disabled={loading !== null}
                  title="跳跃"
                >
                  {loading === "jump" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStopAll}
                  disabled={loading !== null}
                  title="停止所有"
                >
                  {loading === "stop" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
