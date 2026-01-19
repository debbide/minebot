import { useState, useEffect } from "react";
import {
  RefreshCw,
  Plus,
  Trash2,
  Play,
  Square,
  TestTube,
  ChevronDown,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Settings2,
  Cloud,
  Key,
  User,
  ScrollText,
  MousePointer2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api, RenewalConfig } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface RenewalLog {
  id: number;
  timestamp: string;
  type: 'info' | 'success' | 'error';
  message: string;
  renewalId?: string;
}

// 续期模式类型
type RenewalMode = "http" | "autoLoginHttp" | "browserClick";

interface RenewalFormData {
  name: string;
  url: string;
  intervalHours: number;
  intervalMinutes: number;

  // 续期模式
  mode: RenewalMode;

  // HTTP 模式配置
  method: "GET" | "POST";
  headers: string;
  body: string;
  useProxy: boolean;
  proxyUrl: string;

  // 登录配置（autoLoginHttp 和 browserClick 模式）
  loginUrl: string;
  panelUsername: string;
  panelPassword: string;

  // 浏览器点击配置（browserClick 模式）
  renewButtonSelector: string;

  // 浏览器代理配置（browserClick 模式）
  browserProxy: string;
}

const defaultFormData: RenewalFormData = {
  name: "",
  url: "",
  intervalHours: 6,
  intervalMinutes: 0,
  mode: "browserClick",
  method: "GET",
  headers: "",
  body: "",
  useProxy: false,
  proxyUrl: "",
  loginUrl: "",
  panelUsername: "",
  panelPassword: "",
  renewButtonSelector: "",
  browserProxy: "",
};

export function RenewalPanel() {
  const [renewals, setRenewals] = useState<RenewalConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RenewalFormData>(defaultFormData);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [globalLogs, setGlobalLogs] = useState<RenewalLog[]>([]);
  const [renewalLogs, setRenewalLogs] = useState<Record<string, RenewalLog[]>>({});
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  const fetchRenewals = async () => {
    try {
      const data = await api.getRenewals();
      setRenewals(data);
    } catch (error) {
      console.error("Failed to fetch renewals:", error);
    }
  };

  const fetchGlobalLogs = async () => {
    try {
      const data = await api.getRenewalLogs();
      setGlobalLogs(data as RenewalLog[]);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    }
  };

  const fetchRenewalLogs = async (id: string) => {
    try {
      const data = await api.getRenewalLogsById(id);
      setRenewalLogs(prev => ({ ...prev, [id]: data as RenewalLog[] }));
    } catch (error) {
      console.error("Failed to fetch renewal logs:", error);
    }
  };

  useEffect(() => {
    fetchRenewals();
    const interval = setInterval(fetchRenewals, 10000);
    return () => clearInterval(interval);
  }, []);

  // 当显示全局日志或测试时，更频繁地获取全局日志
  useEffect(() => {
    if (showLogs || testingId) {
      fetchGlobalLogs();
      const interval = setInterval(fetchGlobalLogs, 3000); // 3秒刷新一次
      return () => clearInterval(interval);
    }
  }, [showLogs, testingId]);

  // 当展开某个续期配置时，获取该配置的日志
  useEffect(() => {
    if (expandedId) {
      fetchRenewalLogs(expandedId);
      const interval = setInterval(() => fetchRenewalLogs(expandedId), 5000); // 5秒刷新一次
      return () => clearInterval(interval);
    }
  }, [expandedId]);

  const handleSubmit = async () => {
    if (!formData.url) {
      toast({ title: "错误", description: "请输入续期URL", variant: "destructive" });
      return;
    }

    // 验证登录模式必填项
    if ((formData.mode === "autoLoginHttp" || formData.mode === "browserClick") &&
      (!formData.loginUrl || !formData.panelUsername || !formData.panelPassword)) {
      toast({ title: "错误", description: "请填写登录URL、账号和密码", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      // Parse headers
      let headers: Record<string, string> = {};
      if (formData.headers.trim()) {
        try {
          headers = JSON.parse(formData.headers);
        } catch {
          // Try parsing as key: value format
          formData.headers.split("\n").forEach(line => {
            const [key, ...valueParts] = line.split(":");
            if (key && valueParts.length > 0) {
              headers[key.trim()] = valueParts.join(":").trim();
            }
          });
        }
      }

      const interval = (formData.intervalHours * 60 + formData.intervalMinutes) * 60 * 1000;

      const renewalData = {
        name: formData.name || "未命名续期",
        url: formData.url,
        interval: interval || 21600000,
        enabled: true,
        mode: formData.mode,
        method: formData.method,
        headers,
        body: formData.body,
        useProxy: formData.useProxy,
        proxyUrl: formData.proxyUrl,
        loginUrl: formData.loginUrl,
        panelUsername: formData.panelUsername,
        panelPassword: formData.panelPassword,
        renewButtonSelector: formData.renewButtonSelector,
        browserProxy: formData.browserProxy,
      };

      if (editingId) {
        await api.updateRenewal(editingId, renewalData);
        toast({ title: "成功", description: "续期配置已更新" });
      } else {
        await api.addRenewal(renewalData);
        toast({ title: "成功", description: "续期配置已添加" });
      }

      setDialogOpen(false);
      setFormData(defaultFormData);
      setEditingId(null);
      fetchRenewals();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (renewal: RenewalConfig) => {
    const hours = Math.floor(renewal.interval / 3600000);
    const minutes = Math.floor((renewal.interval % 3600000) / 60000);

    // 兼容旧配置：根据旧字段推断模式
    let mode: RenewalMode = (renewal as any).mode;
    if (!mode) {
      if ((renewal as any).useBrowserClick && (renewal as any).autoLogin) {
        mode = "browserClick";
      } else if ((renewal as any).autoLogin) {
        mode = "autoLoginHttp";
      } else {
        mode = "http";
      }
    }

    setFormData({
      name: renewal.name,
      url: renewal.url,
      intervalHours: hours,
      intervalMinutes: minutes,
      mode,
      method: renewal.method,
      headers: Object.keys(renewal.headers).length > 0
        ? JSON.stringify(renewal.headers, null, 2)
        : "",
      body: renewal.body,
      useProxy: renewal.useProxy || false,
      proxyUrl: renewal.proxyUrl || "",
      loginUrl: renewal.loginUrl || "",
      panelUsername: renewal.panelUsername || "",
      panelPassword: renewal.panelPassword || "",
      renewButtonSelector: renewal.renewButtonSelector || "",
      browserProxy: renewal.browserProxy || "",
    });
    setEditingId(renewal.id);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteRenewal(id);
      toast({ title: "成功", description: "续期配置已删除" });
      fetchRenewals();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await api.testRenewal(id);
      if (result.result.success) {
        toast({ title: "测试成功", description: result.result.message });
      } else {
        toast({ title: "测试失败", description: result.result.message, variant: "destructive" });
      }
      fetchRenewals();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      if (enabled) {
        await api.startRenewal(id);
        toast({ title: "成功", description: "已启动续期" });
      } else {
        await api.stopRenewal(id);
        toast({ title: "成功", description: "已停止续期" });
      }
      fetchRenewals();
    } catch (error) {
      toast({ title: "错误", description: String(error), variant: "destructive" });
    }
  };

  const formatInterval = (ms: number) => {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000);
    if (hours > 0 && minutes > 0) return `${hours}小时${minutes}分钟`;
    if (hours > 0) return `${hours}小时`;
    return `${minutes}分钟`;
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "从未";
    return new Date(isoString).toLocaleString("zh-CN");
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5" />
              自动续期
            </CardTitle>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant={showLogs ? "default" : "outline"}
                onClick={() => setShowLogs(!showLogs)}
                className="h-7 px-2"
              >
                <ScrollText className="h-3 w-3 mr-1" />
                日志
              </Button>
              <Dialog open={dialogOpen} onOpenChange={(open) => {
                setDialogOpen(open);
                if (!open) {
                  setFormData(defaultFormData);
                  setEditingId(null);
                }
              }}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-7 px-2">
                    <Plus className="h-3 w-3 mr-1" />
                    添加
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
                  <DialogHeader className="p-6 pb-2 shrink-0">
                    <DialogTitle>{editingId ? "编辑续期" : "添加续期"}</DialogTitle>
                    <DialogDescription>
                      配置自动续期请求，保持服务器运行
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4 space-y-4">
                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>名称</Label>
                        <Input
                          placeholder="我的服务器"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>续期间隔</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            min="0"
                            value={formData.intervalHours}
                            onChange={(e) => setFormData({ ...formData, intervalHours: parseInt(e.target.value) || 0 })}
                            className="w-16"
                          />
                          <span className="flex items-center text-sm text-muted-foreground">时</span>
                          <Input
                            type="number"
                            min="0"
                            max="59"
                            value={formData.intervalMinutes}
                            onChange={(e) => setFormData({ ...formData, intervalMinutes: parseInt(e.target.value) || 0 })}
                            className="w-16"
                          />
                          <span className="flex items-center text-sm text-muted-foreground">分</span>
                        </div>
                      </div>
                    </div>

                    {/* 续期模式选择 */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        续期模式
                      </Label>
                      <Select
                        value={formData.mode}
                        onValueChange={(v) => setFormData({ ...formData, mode: v as RenewalMode })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="browserClick">
                            <div className="flex items-center gap-2">
                              <MousePointer2 className="h-4 w-4" />
                              浏览器自动点击（推荐）
                            </div>
                          </SelectItem>
                          <SelectItem value="autoLoginHttp">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4" />
                              自动登录 + HTTP 请求
                            </div>
                          </SelectItem>
                          <SelectItem value="http">
                            <div className="flex items-center gap-2">
                              <Cloud className="h-4 w-4" />
                              纯 HTTP 请求
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {formData.mode === "browserClick" && "使用无头浏览器自动登录并点击续期按钮，最稳定可靠"}
                        {formData.mode === "autoLoginHttp" && "自动登录获取 Cookie，然后发送 HTTP 请求"}
                        {formData.mode === "http" && "直接发送 HTTP 请求，需要手动配置 Cookie"}
                      </p>
                    </div>

                    {/* 续期 URL / 续期页面 URL */}
                    <div className="space-y-2">
                      <Label>
                        {formData.mode === "browserClick" ? "服务器页面 URL *" : "续期 URL *"}
                      </Label>
                      <Input
                        placeholder={formData.mode === "browserClick"
                          ? "https://dash.zampto.net/server?id=2574"
                          : "https://panel.example.com/api/renew"}
                        value={formData.url}
                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                      />
                      {formData.mode === "browserClick" && (
                        <p className="text-xs text-muted-foreground">
                          登录后将导航到此页面，然后点击续期按钮
                        </p>
                      )}
                    </div>

                    {/* 登录配置（autoLoginHttp 和 browserClick 模式） */}
                    {(formData.mode === "autoLoginHttp" || formData.mode === "browserClick") && (
                      <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
                        <Label className="flex items-center gap-2 text-sm font-medium">
                          <User className="h-4 w-4" />
                          登录配置
                        </Label>
                        <div className="space-y-2">
                          <Label className="text-xs">登录页面 URL *</Label>
                          <Input
                            placeholder="https://auth.example.com/sign-in"
                            value={formData.loginUrl}
                            onChange={(e) => setFormData({ ...formData, loginUrl: e.target.value })}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <Label className="text-xs">账号 *</Label>
                            <Input
                              placeholder="your@email.com"
                              value={formData.panelUsername}
                              onChange={(e) => setFormData({ ...formData, panelUsername: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">密码 *</Label>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              value={formData.panelPassword}
                              onChange={(e) => setFormData({ ...formData, panelPassword: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 浏览器点击配置（browserClick 模式） */}
                    {formData.mode === "browserClick" && (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">续期按钮选择器（可选）</Label>
                          <Input
                            placeholder="留空自动查找 Renew/续期 按钮"
                            value={formData.renewButtonSelector}
                            onChange={(e) => setFormData({ ...formData, renewButtonSelector: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">浏览器代理（可选）</Label>
                          <div className="flex gap-2">
                            <Input
                              placeholder="socks5://127.0.0.1:1080"
                              value={formData.browserProxy}
                              onChange={(e) => setFormData({ ...formData, browserProxy: e.target.value })}
                              className="flex-1"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!formData.browserProxy || loading}
                              onClick={async () => {
                                if (!formData.browserProxy) return;
                                setLoading(true);
                                try {
                                  const result = await api.testProxy(formData.browserProxy);
                                  if (result.result.success) {
                                    toast({ title: "代理测试成功", description: result.result.message });
                                  } else {
                                    toast({ title: "代理测试失败", description: result.result.message, variant: "destructive" });
                                  }
                                } catch (error) {
                                  toast({ title: "代理测试失败", description: String(error), variant: "destructive" });
                                } finally {
                                  setLoading(false);
                                }
                              }}
                            >
                              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                              <span className="ml-1">测试</span>
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            支持 HTTP/HTTPS/SOCKS4/SOCKS5 代理，如需使用 hy2 请先配置本地代理客户端
                          </p>
                        </div>
                      </div>
                    )}

                    {/* HTTP 模式配置 */}
                    {(formData.mode === "http" || formData.mode === "autoLoginHttp") && (
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                          <ChevronDown className="h-4 w-4" />
                          HTTP 请求配置
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-3 pt-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs">请求方法</Label>
                              <Select
                                value={formData.method}
                                onValueChange={(v) => setFormData({ ...formData, method: v as "GET" | "POST" })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="GET">GET</SelectItem>
                                  <SelectItem value="POST">POST</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center gap-2">
                                <Label className="text-xs">CF 代理</Label>
                                <Switch
                                  checked={formData.useProxy}
                                  onCheckedChange={(checked) => setFormData({ ...formData, useProxy: checked })}
                                />
                              </div>
                              {formData.useProxy && (
                                <Input
                                  placeholder="https://your-worker.workers.dev"
                                  value={formData.proxyUrl}
                                  onChange={(e) => setFormData({ ...formData, proxyUrl: e.target.value })}
                                />
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">请求头 (JSON 格式)</Label>
                            <Textarea
                              placeholder={'{\n  "Cookie": "session=xxx"\n}'}
                              value={formData.headers}
                              onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                              rows={3}
                              className="font-mono text-xs"
                            />
                          </div>
                          {formData.method === "POST" && (
                            <div className="space-y-2">
                              <Label className="text-xs">请求体</Label>
                              <Textarea
                                placeholder='{"action": "renew"}'
                                value={formData.body}
                                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                                rows={2}
                                className="font-mono text-xs"
                              />
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                  <DialogFooter className="p-6 pt-2">
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      取消
                    </Button>
                    <Button onClick={handleSubmit} disabled={loading}>
                      {loading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                      {editingId ? "保存" : "添加"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 全局日志面板 */}
        {showLogs && (
          <div className="p-3 rounded-lg border bg-muted/50 mb-3 overflow-hidden">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                全局日志
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setGlobalLogs([])}
              >
                清空
              </Button>
            </div>
            <div className="h-48 overflow-y-auto overflow-x-hidden space-y-1 font-mono text-xs">
              {globalLogs.length === 0 ? (
                <div className="text-muted-foreground text-center py-4">
                  暂无日志
                </div>
              ) : (
                globalLogs.slice().reverse().map((log) => (
                  <div
                    key={log.id}
                    className={`break-all ${log.type === 'error' ? 'text-red-500' :
                      log.type === 'success' ? 'text-green-500' :
                        'text-muted-foreground'
                      }`}
                  >
                    <span className="text-muted-foreground whitespace-nowrap">[{log.timestamp}]</span>
                    {log.renewalId && <span className="text-blue-500 whitespace-nowrap"> [{log.renewalId.substring(0, 15)}...]</span>}
                    <span> {log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        {renewals.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            暂无续期配置，点击上方按钮添加
          </div>
        ) : (
          renewals.map((renewal) => (
            <Collapsible
              key={renewal.id}
              open={expandedId === renewal.id}
              onOpenChange={(open) => setExpandedId(open ? renewal.id : null)}
            >
              <div className="p-3 rounded-lg border bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${renewal.running ? "bg-green-500 animate-pulse" : "bg-gray-400"
                        }`}
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{renewal.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {renewal.url}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant={renewal.running ? "default" : "outline"} className="text-xs px-1.5">
                      {renewal.running ? "运行" : "停止"}
                    </Badge>
                    {renewal.lastResult && (
                      <Badge variant={renewal.lastResult.success ? "secondary" : "destructive"} className="text-xs px-1.5">
                        {renewal.lastResult.success ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleTest(renewal.id)}
                      disabled={testingId === renewal.id}
                      title="测试"
                    >
                      {testingId === renewal.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <TestTube className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleToggle(renewal.id, !renewal.running)}
                      title={renewal.running ? "停止" : "启动"}
                    >
                      {renewal.running ? (
                        <Square className="h-3.5 w-3.5" />
                      ) : (
                        <Play className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${expandedId === renewal.id ? "rotate-180" : ""
                            }`}
                        />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent className="pt-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      间隔: {formatInterval(renewal.interval)}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      {(() => {
                        const mode = (renewal as any).mode ||
                          ((renewal as any).useBrowserClick && (renewal as any).autoLogin ? 'browserClick' :
                            (renewal as any).autoLogin ? 'autoLoginHttp' : 'http');
                        return (
                          <>
                            {mode === 'browserClick' && <><MousePointer2 className="h-4 w-4" />浏览器点击</>}
                            {mode === 'autoLoginHttp' && <><Key className="h-4 w-4" />自动登录</>}
                            {mode === 'http' && <><Cloud className="h-4 w-4" />HTTP</>}
                          </>
                        );
                      })()}
                    </div>
                    <div className="col-span-2 text-muted-foreground">
                      上次执行: {formatTime(renewal.lastRun)}
                    </div>
                    {renewal.lastResult?.response && (
                      <div className="col-span-2">
                        <div className="text-xs text-muted-foreground mb-1">响应:</div>
                        <div className="p-2 bg-muted rounded text-xs font-mono max-h-24 overflow-auto">
                          {renewal.lastResult.response}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 单独的日志面板 */}
                  <div className="mt-3 p-2 rounded border bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-medium flex items-center gap-1">
                        <ScrollText className="h-3 w-3" />
                        执行日志
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={async () => {
                          await api.clearRenewalLogs(renewal.id);
                          setRenewalLogs(prev => ({ ...prev, [renewal.id]: [] }));
                        }}
                      >
                        清空
                      </Button>
                    </div>
                    <div className="h-32 overflow-y-auto space-y-0.5 font-mono text-xs">
                      {(!renewalLogs[renewal.id] || renewalLogs[renewal.id].length === 0) ? (
                        <div className="text-muted-foreground text-center py-2">
                          暂无日志
                        </div>
                      ) : (
                        renewalLogs[renewal.id].slice().reverse().map((log) => (
                          <div
                            key={log.id}
                            className={`${log.type === 'error' ? 'text-red-500' :
                              log.type === 'success' ? 'text-green-500' :
                                'text-muted-foreground'
                              }`}
                          >
                            <span className="opacity-60">[{log.timestamp}]</span> {log.message}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(renewal)}
                    >
                      <Settings2 className="h-4 w-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(renewal.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      删除
                    </Button>
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ))
        )}
      </CardContent>
    </Card >
  );
}
