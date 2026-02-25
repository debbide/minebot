import { useState, useEffect, useCallback } from "react";
import {
  UserPlus,
  Sword,
  Navigation,
  Pickaxe,
  Square,
  ArrowUp,
  ChevronDown,
  Loader2,
  MessageSquare,
  Eye,
  RotateCcw,
  Power,
  PowerOff,
  Shield,
  ShieldCheck,
  Apple,
  Fish,
  Activity,
  Timer,
  UserRound,
  Coffee,
  ListChecks
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";


interface BotControlPanelProps {
  botId: string;
  botName: string;
  connected: boolean;
  serverType?: "minecraft" | "panel";  // 服务器类型
  panelServerState?: string;  // 面板服务器状态
  agentOnline?: boolean;
  modes?: {
    follow?: boolean;
    autoAttack?: boolean;
    patrol?: boolean;
    mining?: boolean;
    aiView?: boolean;
    autoChat?: boolean;
    invincible?: boolean;
    antiAfk?: boolean;
    autoEat?: boolean;
    guard?: boolean;
    fishing?: boolean;
    rateLimit?: boolean;
    humanize?: boolean;
    safeIdle?: boolean;
    workflow?: boolean;
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
}

interface BehaviorStatus {
  follow?: {
    active: boolean;
    target: string | null;
    minDistance?: number;
    maxDistance?: number;
    lostTicks?: number;
  };
  attack?: {
    active: boolean;
    mode?: string;
    range?: number;
    minHealth?: number;
    whitelistCount?: number;
    lastTarget?: string | null;
  };
  patrol?: {
    active: boolean;
    isMoving?: boolean;
    radius?: number;
    waypointsCount?: number;
    nextWaypointIndex?: number | null;
    centerPos?: { x: number; y: number; z: number } | null;
  };
  mining?: {
    active: boolean;
    targetBlocks?: string[];
    range?: number;
    stopOnFull?: boolean;
    minEmptySlots?: number;
    lastTargetBlock?: string | null;
  };
  action?: {
    looping?: boolean;
    actionsCount?: number;
  };
  aiView?: {
    active: boolean;
    range?: number;
    lastTarget?: string | null;
  };
  antiAfk?: {
    active: boolean;
    intervalSeconds?: number;
    jitterSeconds?: number;
    lastAction?: string | null;
  };
  autoEat?: {
    active: boolean;
    minHealth?: number;
    minFood?: number;
    lastFood?: string | null;
  };
  guard?: {
    active: boolean;
    radius?: number;
    attackRange?: number;
    minHealth?: number;
    lastTarget?: string | null;
  };
  fishing?: {
    active: boolean;
    intervalSeconds?: number;
    timeoutSeconds?: number;
    lastResult?: string | null;
  };
  rateLimit?: {
    active: boolean;
    globalCooldownSeconds?: number;
    maxPerMinute?: number;
    blockedCount?: number;
  };
  humanize?: {
    active: boolean;
    intervalSeconds?: number;
    lookRange?: number;
    actionChance?: number;
    lastAction?: string | null;
  };
  safeIdle?: {
    active: boolean;
    intervalSeconds?: number;
    lookRange?: number;
    actionChance?: number;
    timeoutSeconds?: number;
    resumeDelaySeconds?: number;
    lastAction?: string | null;
  };
  workflow?: {
    active: boolean;
    step?: string | null;
    steps?: string[];
    elapsedSeconds?: number;
    lastReason?: string | null;
  };
}

export function BotControlPanel({
  botId,
  botName,
  connected,
  serverType = "minecraft",
  panelServerState,
  agentOnline = false,
  modes = {},
  players = [],
  restartTimer,
  pterodactyl,
}: BotControlPanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [followTarget, setFollowTarget] = useState<string>("");
  const [attackMode, setAttackMode] = useState<string>("hostile");
  const { toast } = useToast();
  const [behaviorStatus, setBehaviorStatus] = useState<BehaviorStatus | null>(null);
  const [behaviorLoading, setBehaviorLoading] = useState(false);

  const fetchBehaviorStatus = useCallback(async () => {
    if (!connected) return;
    setBehaviorLoading(true);
    try {
      const result = await api.getBehaviors(botId) as { behaviors?: BehaviorStatus | null };
      setBehaviorStatus(result.behaviors || null);
    } catch (error) {
      console.error("Failed to fetch behavior status:", error);
    } finally {
      setBehaviorLoading(false);
    }
  }, [botId, connected]);

  useEffect(() => {
    if (!connected || !isOpen) return;
    fetchBehaviorStatus();
    const intervalId = window.setInterval(fetchBehaviorStatus, 3000);
    return () => window.clearInterval(intervalId);
  }, [connected, isOpen, fetchBehaviorStatus]);

  const handleBehavior = async (behavior: string, enabled: boolean, options?: Record<string, unknown>) => {
    if (!connected) {
      toast({ title: "错误", description: "Bot 未连接", variant: "destructive" });
      return;
    }

    setLoading(behavior);
    try {
      const result = await api.setBehavior(botId, behavior, enabled, options);
      toast({ title: enabled ? "已启用" : "已停止", description: result.message });
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

  const formatPos = (pos?: { x: number; y: number; z: number } | null) => {
    if (!pos) return "未知";
    return `${pos.x} ${pos.y} ${pos.z}`;
  };

  const formatValue = (value: string | number | null | undefined, fallback = "无") => {
    if (value === null || value === undefined || value === "") return fallback;
    return String(value);
  };

  const formatList = (items?: string[]) => {
    if (!items || items.length === 0) return "无";
    return items.join(", ");
  };

  const formatState = (enabled?: boolean, active?: boolean) => {
    const enabledText = enabled === undefined ? "-" : (enabled ? "开" : "关");
    const activeText = active ? "开" : "关";
    return `开关${enabledText} | 运行${activeText}`;
  };

  const handleStopAll = async () => {
    setLoading("stop");
    try {
      await api.stopAllBehaviors(botId);
      toast({ title: "已停止", description: "所有行为已停止" });
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
    const panelAvailable = !!pterodactyl?.url || agentOnline;
    return (
      <div className="space-y-2 mt-2">
        <div className="flex gap-2 flex-wrap">
          {/* 电源控制按钮 */}
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('start')}
            disabled={loading?.startsWith('power-') || !panelAvailable}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading === "power-start" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Power className="h-4 w-4 mr-1" />}
            <span className="text-xs">开机</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('stop')}
            disabled={loading?.startsWith('power-') || !panelAvailable}
            className="bg-yellow-600 hover:bg-yellow-700"
          >
            {loading === "power-stop" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
            <span className="text-xs">关机</span>
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handlePowerSignal('restart')}
            disabled={loading?.startsWith('power-') || !panelAvailable}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading === "power-restart" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            <span className="text-xs">重启</span>
          </Button>
        </div>
        {!panelAvailable && (
          <p className="text-xs text-muted-foreground">请先在设置中配置翼龙面板信息或绑定探针</p>
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
            {modes.antiAfk && <Badge variant="secondary">防踢</Badge>}
            {modes.autoEat && <Badge variant="secondary">自动吃</Badge>}
            {modes.guard && <Badge variant="secondary">守护</Badge>}
            {modes.fishing && <Badge variant="secondary">钓鱼</Badge>}
            {modes.rateLimit && <Badge variant="secondary">限速</Badge>}
            {modes.humanize && <Badge variant="secondary">拟人</Badge>}
            {modes.safeIdle && <Badge variant="secondary">安全挂机</Badge>}
            {modes.workflow && <Badge variant="secondary">任务脚本</Badge>}
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

              <div className="grid grid-cols-8 gap-2">
                <Button
                  size="sm"
                  variant={modes.guard ? "destructive" : "outline"}
                  onClick={() => handleBehavior("guard", !modes.guard)}
                  disabled={loading !== null}
                  title="守护"
                >
                  {loading === "guard" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.autoEat ? "destructive" : "outline"}
                  onClick={() => handleBehavior("autoEat", !modes.autoEat)}
                  disabled={loading !== null}
                  title="自动吃"
                >
                  {loading === "autoEat" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Apple className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.antiAfk ? "destructive" : "outline"}
                  onClick={() => handleBehavior("antiAfk", !modes.antiAfk)}
                  disabled={loading !== null}
                  title="防踢"
                >
                  {loading === "antiAfk" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.fishing ? "destructive" : "outline"}
                  onClick={() => handleBehavior("fishing", !modes.fishing)}
                  disabled={loading !== null}
                  title="钓鱼"
                >
                  {loading === "fishing" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fish className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.rateLimit ? "destructive" : "outline"}
                  onClick={() => handleBehavior("rateLimit", !modes.rateLimit)}
                  disabled={loading !== null}
                  title="限速"
                >
                  {loading === "rateLimit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Timer className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.humanize ? "destructive" : "outline"}
                  onClick={() => handleBehavior("humanize", !modes.humanize)}
                  disabled={loading !== null}
                  title="拟人"
                >
                  {loading === "humanize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRound className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.safeIdle ? "destructive" : "outline"}
                  onClick={() => handleBehavior("safeIdle", !modes.safeIdle)}
                  disabled={loading !== null}
                  title="安全挂机"
                >
                  {loading === "safeIdle" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coffee className="h-4 w-4" />}
                </Button>
                <Button
                  size="sm"
                  variant={modes.workflow ? "destructive" : "outline"}
                  onClick={() => handleBehavior("workflow", !modes.workflow)}
                  disabled={loading !== null}
                  title="任务脚本"
                >
                  {loading === "workflow" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
                </Button>
              </div>

              <div className="rounded-md border p-2 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">行为状态</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchBehaviorStatus}
                    disabled={behaviorLoading}
                    className="h-6 px-2 text-xs"
                  >
                    {behaviorLoading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                    刷新
                  </Button>
                </div>
                {!behaviorStatus ? (
                  <p className="text-muted-foreground">暂无行为状态</p>
                ) : (
                  <div className="space-y-1">
                    <div>跟随: {formatState(modes.follow, behaviorStatus.follow?.active)}{behaviorStatus.follow?.active ? ` | 目标 ${formatValue(behaviorStatus.follow.target)} | 距离 ${formatValue(behaviorStatus.follow.minDistance)}-${formatValue(behaviorStatus.follow.maxDistance)} | 丢失 ${formatValue(behaviorStatus.follow.lostTicks)}` : ""}</div>
                    <div>攻击: {formatState(modes.autoAttack, behaviorStatus.attack?.active)}{behaviorStatus.attack?.active ? ` | 模式 ${formatValue(behaviorStatus.attack.mode)} | 范围 ${formatValue(behaviorStatus.attack.range)} | 血线 ${formatValue(behaviorStatus.attack.minHealth)} | 白名单 ${formatValue(behaviorStatus.attack.whitelistCount)} | 目标 ${formatValue(behaviorStatus.attack.lastTarget)}` : ""}</div>
                    <div>巡逻: {formatState(modes.patrol, behaviorStatus.patrol?.active)}{behaviorStatus.patrol?.active ? ` | 移动中 ${behaviorStatus.patrol.isMoving ? "是" : "否"} | 半径 ${formatValue(behaviorStatus.patrol.radius)} | 路径点 ${formatValue(behaviorStatus.patrol.waypointsCount)} | 下一个 ${formatValue(behaviorStatus.patrol.nextWaypointIndex)}` : ""}</div>
                    <div>巡逻中心: {formatPos(behaviorStatus.patrol?.centerPos)}</div>
                    <div>挖矿: {formatState(modes.mining, behaviorStatus.mining?.active)}{behaviorStatus.mining?.active ? ` | 范围 ${formatValue(behaviorStatus.mining.range)} | 停满 ${behaviorStatus.mining.stopOnFull ? "是" : "否"} | 空位 ${formatValue(behaviorStatus.mining.minEmptySlots)} | 目标 ${formatValue(behaviorStatus.mining.lastTargetBlock)}` : ""}</div>
                    <div>挖矿目标: {formatList(behaviorStatus.mining?.targetBlocks)}</div>
                    <div>AI视角: {formatState(modes.aiView, behaviorStatus.aiView?.active)}{behaviorStatus.aiView?.active ? ` | 范围 ${formatValue(behaviorStatus.aiView.range)} | 目标 ${formatValue(behaviorStatus.aiView.lastTarget)}` : ""}</div>
                    <div>动作: {formatState(undefined, behaviorStatus.action?.looping)}{behaviorStatus.action?.looping ? ` | 循环中 | 动作数 ${formatValue(behaviorStatus.action.actionsCount)}` : ""}</div>
                    <div>防踢: {formatState(modes.antiAfk, behaviorStatus.antiAfk?.active)}{behaviorStatus.antiAfk?.active ? ` | 间隔 ${formatValue(behaviorStatus.antiAfk.intervalSeconds)}s | 抖动 ${formatValue(behaviorStatus.antiAfk.jitterSeconds)}s | 动作 ${formatValue(behaviorStatus.antiAfk.lastAction)}` : ""}</div>
                    <div>自动吃: {formatState(modes.autoEat, behaviorStatus.autoEat?.active)}{behaviorStatus.autoEat?.active ? ` | 血线 ${formatValue(behaviorStatus.autoEat.minHealth)} | 饥饿 ${formatValue(behaviorStatus.autoEat.minFood)} | 食物 ${formatValue(behaviorStatus.autoEat.lastFood)}` : ""}</div>
                    <div>守护: {formatState(modes.guard, behaviorStatus.guard?.active)}{behaviorStatus.guard?.active ? ` | 半径 ${formatValue(behaviorStatus.guard.radius)} | 攻击距 ${formatValue(behaviorStatus.guard.attackRange)} | 血线 ${formatValue(behaviorStatus.guard.minHealth)} | 目标 ${formatValue(behaviorStatus.guard.lastTarget)}` : ""}</div>
                    <div>钓鱼: {formatState(modes.fishing, behaviorStatus.fishing?.active)}{behaviorStatus.fishing?.active ? ` | 间隔 ${formatValue(behaviorStatus.fishing.intervalSeconds)}s | 超时 ${formatValue(behaviorStatus.fishing.timeoutSeconds)}s | 状态 ${formatValue(behaviorStatus.fishing.lastResult)}` : ""}</div>
                    <div>限速: {formatState(modes.rateLimit, behaviorStatus.rateLimit?.active)}{behaviorStatus.rateLimit?.active ? ` | 冷却 ${formatValue(behaviorStatus.rateLimit.globalCooldownSeconds)}s | 每分钟 ${formatValue(behaviorStatus.rateLimit.maxPerMinute)} | 拦截 ${formatValue(behaviorStatus.rateLimit.blockedCount)}` : ""}</div>
                    <div>拟人: {formatState(modes.humanize, behaviorStatus.humanize?.active)}{behaviorStatus.humanize?.active ? ` | 间隔 ${formatValue(behaviorStatus.humanize.intervalSeconds)}s | 视距 ${formatValue(behaviorStatus.humanize.lookRange)} | 概率 ${formatValue(behaviorStatus.humanize.actionChance)}` : ""}</div>
                    <div>安全挂机: {formatState(modes.safeIdle, behaviorStatus.safeIdle?.active)}{behaviorStatus.safeIdle?.active ? ` | 间隔 ${formatValue(behaviorStatus.safeIdle.intervalSeconds)}s | 视距 ${formatValue(behaviorStatus.safeIdle.lookRange)} | 超时 ${formatValue(behaviorStatus.safeIdle.timeoutSeconds)}s | 恢复 ${formatValue(behaviorStatus.safeIdle.resumeDelaySeconds)}s | 动作 ${formatValue(behaviorStatus.safeIdle.lastAction)}` : ""}</div>
                    <div>任务脚本: {formatState(modes.workflow, behaviorStatus.workflow?.active)}{behaviorStatus.workflow?.active ? ` | 步骤 ${formatValue(behaviorStatus.workflow.step)} | 已运行 ${formatValue(behaviorStatus.workflow.elapsedSeconds)}s | 原因 ${formatValue(behaviorStatus.workflow.lastReason)}` : ""}</div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}
    </div>
  );
}
