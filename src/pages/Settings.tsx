import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  Server,
  Brain,
  Lock,
  MessageCircle,
  RefreshCw,
  Save,
  Loader2,
  ArrowLeft,
  LogOut
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { toast } from "sonner";

interface SettingsData {
  server: {
    host: string;
    port: number;
    username: string;
    version: string;
  };
  ai: {
    enabled: boolean;
    apiKey: string;
    baseURL: string;
    model: string;
    systemPrompt: string;
  };
  auth: {
    username: string;
    password: string;
  };
  autoChat: {
    enabled: boolean;
    interval: number;
    messages: string[];
  };
  autoRenew: {
    enabled: boolean;
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
    interval: number;
  };
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout, username: currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<SettingsData>({
    server: { host: "localhost", port: 25565, username: "MinecraftBot", version: "" },
    ai: { enabled: true, apiKey: "", baseURL: "", model: "gpt-3.5-turbo", systemPrompt: "" },
    auth: { username: "admin", password: "" },
    autoChat: { enabled: false, interval: 60000, messages: [] },
    autoRenew: { enabled: false, url: "", method: "GET", headers: {}, body: "", interval: 300000 }
  });
  const [autoChatMessages, setAutoChatMessages] = useState("");

  const loadSettings = useCallback(async () => {
    try {
      const config = await api.getFullConfig();
      setSettings(prev => ({
        server: config.server
          ? {
            ...prev.server,
            ...config.server,
            version: config.server.version === false ? "" : (config.server.version || prev.server.version)
          }
          : prev.server,
        ai: config.ai || prev.ai,
        auth: config.auth || prev.auth,
        autoChat: config.autoChat || prev.autoChat,
        autoRenew: config.autoRenew
          ? {
            ...prev.autoRenew,
            ...config.autoRenew,
            headers: config.autoRenew.headers || prev.autoRenew.headers,
            body: config.autoRenew.body || prev.autoRenew.body
          }
          : prev.autoRenew
      }));
      setAutoChatMessages((config.autoChat?.messages || []).join("\n"));
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.saveSettings({
        ...settings,
        autoChat: {
          ...settings.autoChat,
          messages: autoChatMessages.split("\n").filter(m => m.trim())
        }
      });
      toast.success("设置已保存");
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updateServer = (key: string, value: string | number) => {
    setSettings(s => ({ ...s, server: { ...s.server, [key]: value } }));
  };

  const updateAI = (key: string, value: string | boolean) => {
    setSettings(s => ({ ...s, ai: { ...s.ai, [key]: value } }));
  };

  const updateAuth = (key: string, value: string) => {
    setSettings(s => ({ ...s, auth: { ...s.auth, [key]: value } }));
  };

  const updateAutoChat = (key: string, value: boolean | number) => {
    setSettings(s => ({ ...s, autoChat: { ...s.autoChat, [key]: value } }));
  };

  const updateAutoRenew = (key: string, value: string | boolean | number) => {
    setSettings(s => ({ ...s, autoRenew: { ...s.autoRenew, [key]: value } }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">系统设置</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{currentUser}</span>
            <Button variant="ghost" size="icon" onClick={logout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-4xl px-4 py-6">
        <Tabs defaultValue="server" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="server" className="text-xs sm:text-sm">
              <Server className="h-4 w-4 mr-1 hidden sm:inline" />
              默认配置
            </TabsTrigger>
            <TabsTrigger value="ai" className="text-xs sm:text-sm">
              <Brain className="h-4 w-4 mr-1 hidden sm:inline" />
              AI
            </TabsTrigger>
            <TabsTrigger value="auth" className="text-xs sm:text-sm">
              <Lock className="h-4 w-4 mr-1 hidden sm:inline" />
              账号
            </TabsTrigger>
            <TabsTrigger value="autoChat" className="text-xs sm:text-sm">
              <MessageCircle className="h-4 w-4 mr-1 hidden sm:inline" />
              喊话
            </TabsTrigger>
            <TabsTrigger value="autoRenew" className="text-xs sm:text-sm">
              <RefreshCw className="h-4 w-4 mr-1 hidden sm:inline" />
              续期
            </TabsTrigger>
          </TabsList>

          {/* Server Settings */}
          <TabsContent value="server" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" />
                新服务器默认配置
              </h2>
              <p className="text-sm text-muted-foreground">
                添加新服务器时使用的默认值
              </p>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">服务器地址</label>
                  <Input
                    value={settings.server.host}
                    onChange={(e) => updateServer("host", e.target.value)}
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">端口</label>
                  <Input
                    type="number"
                    value={settings.server.port}
                    onChange={(e) => updateServer("port", parseInt(e.target.value) || 25565)}
                    placeholder="25565"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">机器人用户名</label>
                  <Input
                    value={settings.server.username}
                    onChange={(e) => updateServer("username", e.target.value)}
                    placeholder="MinecraftBot"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">游戏版本 (可选)</label>
                  <Input
                    value={settings.server.version}
                    onChange={(e) => updateServer("version", e.target.value)}
                    placeholder="自动检测"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* AI Settings */}
          <TabsContent value="ai" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  AI 配置
                </h2>
                <Switch
                  checked={settings.ai.enabled}
                  onCheckedChange={(v) => updateAI("enabled", v)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">API Key</label>
                <Input
                  type="password"
                  value={settings.ai.apiKey}
                  onChange={(e) => updateAI("apiKey", e.target.value)}
                  placeholder="sk-... (留空保持不变)"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">API Base URL</label>
                <Input
                  value={settings.ai.baseURL}
                  onChange={(e) => updateAI("baseURL", e.target.value)}
                  placeholder="https://api.openai.com/v1"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">模型</label>
                <Input
                  value={settings.ai.model}
                  onChange={(e) => updateAI("model", e.target.value)}
                  placeholder="gpt-3.5-turbo"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">系统提示词</label>
                <Textarea
                  value={settings.ai.systemPrompt}
                  onChange={(e) => updateAI("systemPrompt", e.target.value)}
                  placeholder="你是一个 Minecraft 服务器中的友好机器人助手..."
                  rows={4}
                />
              </div>
            </div>
          </TabsContent>

          {/* Auth Settings */}
          <TabsContent value="auth" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Lock className="h-4 w-4 text-primary" />
                登录账号设置
              </h2>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">用户名</label>
                <Input
                  value={settings.auth.username}
                  onChange={(e) => updateAuth("username", e.target.value)}
                  placeholder="admin"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">新密码 (留空保持不变)</label>
                <Input
                  type="password"
                  value={settings.auth.password}
                  onChange={(e) => updateAuth("password", e.target.value)}
                  placeholder="******"
                />
              </div>

              <p className="text-xs text-muted-foreground">
                修改后需要重新登录
              </p>
            </div>
          </TabsContent>

          {/* Auto Chat Settings */}
          <TabsContent value="autoChat" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-primary" />
                  自动喊话设置
                </h2>
                <Switch
                  checked={settings.autoChat.enabled}
                  onCheckedChange={(v) => updateAutoChat("enabled", v)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">间隔时间 (秒)</label>
                <Input
                  type="number"
                  value={settings.autoChat.interval / 1000}
                  onChange={(e) => updateAutoChat("interval", (parseInt(e.target.value) || 60) * 1000)}
                  placeholder="60"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">喊话内容 (每行一条)</label>
                <Textarea
                  value={autoChatMessages}
                  onChange={(e) => setAutoChatMessages(e.target.value)}
                  placeholder="欢迎来到服务器！&#10;有问题可以问我 !ask [问题]&#10;需要帮助请输入 !help"
                  rows={5}
                />
              </div>
            </div>
          </TabsContent>

          {/* Auto Renew Settings */}
          <TabsContent value="autoRenew" className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-primary" />
                  自动续期设置
                </h2>
                <Switch
                  checked={settings.autoRenew.enabled}
                  onCheckedChange={(v) => updateAutoRenew("enabled", v)}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">续期接口 URL</label>
                <Input
                  value={settings.autoRenew.url}
                  onChange={(e) => updateAutoRenew("url", e.target.value)}
                  placeholder="https://example.com/api/renew"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">请求方式</label>
                  <select
                    value={settings.autoRenew.method}
                    onChange={(e) => updateAutoRenew("method", e.target.value)}
                    className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-muted-foreground">间隔时间 (秒)</label>
                  <Input
                    type="number"
                    value={settings.autoRenew.interval / 1000}
                    onChange={(e) => updateAutoRenew("interval", (parseInt(e.target.value) || 300) * 1000)}
                    placeholder="300"
                  />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Save Button */}
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} disabled={saving} className="min-w-[120px]">
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            保存设置
          </Button>
        </div>
      </main>
    </div>
  );
}
