import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { api, TelegramConfig, ProxyNode } from "@/lib/api";
import { Loader2, Save, Send, Lock, Globe, Plus, Trash2, Link as LinkIcon, RefreshCw, Zap, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface GlobalSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function GlobalSettingsDialog({ open, onOpenChange }: GlobalSettingsDialogProps) {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [tgConfig, setTgConfig] = useState<TelegramConfig>({
        enabled: false,
        botToken: "",
        chatId: ""
    });

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    const [proxyNodes, setProxyNodes] = useState<ProxyNode[]>([]);
    const [selectedNode, setSelectedNode] = useState<ProxyNode | null>(null);
    const [testLoading, setTestLoading] = useState<Record<string, boolean>>({});
    const [aiConfig, setAiConfig] = useState({
        enabled: true,
        apiKey: "",
        baseURL: "",
        model: "gpt-3.5-turbo",
        systemPrompt: ""
    });

    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const tg = await api.getTelegramConfig();
            setTgConfig(tg);
            const nodes = await api.getProxyNodes();
            setProxyNodes(nodes);
            const fullConfig = await api.getFullConfig();
            if (fullConfig?.ai) {
                setAiConfig({
                    enabled: fullConfig.ai.enabled !== false,
                    apiKey: fullConfig.ai.apiKey || "",
                    baseURL: fullConfig.ai.baseURL || "",
                    model: fullConfig.ai.model || "gpt-3.5-turbo",
                    systemPrompt: fullConfig.ai.systemPrompt || ""
                });
            }
        } catch (error) {
            console.error("Failed to load settings:", error);
            toast({
                title: "加载失败",
                description: "无法获取全局配置",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        if (open) {
            loadConfig();
        }
    }, [open, loadConfig]);

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) return error.message;
        return fallback;
    };

    const handleSaveTelegram = async () => {
        try {
            setSaving(true);
            await api.updateTelegramConfig(tgConfig);
            toast({
                title: "保存成功",
                description: "Telegram 配置已更新",
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast({
                title: "保存失败",
                description: "无法保存 Telegram 配置",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSavePassword = async () => {
        if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
            toast({
                title: "错误",
                description: "请填写所有密码字段",
                variant: "destructive",
            });
            return;
        }

        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast({
                title: "错误",
                description: "两次输入的密码不一致",
                variant: "destructive",
            });
            return;
        }

        try {
            setSaving(true);
            await api.changePassword(
                passwordData.currentPassword,
                passwordData.newPassword,
                passwordData.confirmPassword
            );
            toast({
                title: "密码修改成功",
                description: "请使用新密码重新登录",
            });
            // Optional: Logout user?
            setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        } catch (error: unknown) {
            console.error("Failed to change password:", error);
            toast({
                title: "修改失败",
                description: getErrorMessage(error, "无法修改密码，请检查当前密码是否正确"),
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveProxy = async () => {
        try {
            setSaving(true);
            await api.updateProxyNodes(proxyNodes);
            toast({
                title: "保存成功",
                description: "代理节点配置已更新",
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save proxy settings:", error);
            toast({
                title: "保存失败",
                description: "无法保存代理配置",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const addProxyNode = () => {
        const newNode: ProxyNode = {
            id: Math.random().toString(36).substring(7),
            name: "新代理节点",
            type: "vless",
            server: "",
            port: 443
        };
        setProxyNodes([...proxyNodes, newNode]);
    };

    const removeProxyNode = (id: string) => {
        setProxyNodes(proxyNodes.filter(n => n.id !== id));
    };

    const updateProxyNode = (id: string, updates: Partial<ProxyNode>) => {
        setProxyNodes(proxyNodes.map(n => n.id === id ? { ...n, ...updates } : n));
    };

    const handleImportLink = async () => {
        const link = prompt("请输入代理链接 (vless://, ss://, trojan://, tuic://, hysteria2://):");
        if (!link) return;

        try {
            const node = await api.parseProxyLink(link);
            setProxyNodes([...proxyNodes, node]);
            toast({ title: "导入成功", description: `已添加节点: ${node.name}` });
        } catch (error: unknown) {
            toast({ title: "导入失败", description: getErrorMessage(error, "导入失败"), variant: "destructive" });
        }
    };

    const handleSaveAi = async () => {
        try {
            setSaving(true);
            await api.saveSettings({
                ai: {
                    enabled: !!aiConfig.enabled,
                    apiKey: aiConfig.apiKey || "",
                    baseURL: aiConfig.baseURL || "",
                    model: aiConfig.model || "gpt-3.5-turbo",
                    systemPrompt: aiConfig.systemPrompt || ""
                }
            });
            toast({
                title: "保存成功",
                description: "AI 配置已更新",
            });
            onOpenChange(false);
        } catch (error) {
            console.error("Failed to save AI settings:", error);
            toast({
                title: "保存失败",
                description: "无法保存 AI 配置",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSyncSubscription = async () => {
        const url = prompt("请输入订阅链接 URL:");
        if (!url) return;

        try {
            setSaving(true);
            const nodes = await api.syncSubscription(url);
            setProxyNodes([...proxyNodes, ...nodes]);
            toast({ title: "同步成功", description: `已导入 ${nodes.length} 个节点` });
        } catch (error: unknown) {
            toast({ title: "同步失败", description: getErrorMessage(error, "同步失败"), variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const handleTestNode = async (id: string) => {
        try {
            setTestLoading(prev => ({ ...prev, [id]: true }));
            const result = await api.testProxyNode(id);
            if (result.success) {
                updateProxyNode(id, { latency: result.latency });
                toast({ title: "测试成功", description: `延迟: ${result.latency}ms` });
            } else {
                updateProxyNode(id, { latency: -1 });
                toast({ title: "测试失败", description: "节点可能不可用", variant: "destructive" });
            }
        } catch (error: unknown) {
            toast({ title: "测试错误", description: getErrorMessage(error, "测试失败"), variant: "destructive" });
        } finally {
            setTestLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[600px] top-[15%] translate-y-0">
                    <DialogHeader>
                        <DialogTitle>全局设置</DialogTitle>
                        <DialogDescription>
                            管理应用程序的全局配置和通知服务
                        </DialogDescription>
                    </DialogHeader>

                    <Tabs defaultValue="telegram" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            <TabsTrigger value="telegram">Telegram 通知</TabsTrigger>
                            <TabsTrigger value="ai">AI</TabsTrigger>
                            <TabsTrigger value="proxy">代理管理</TabsTrigger>
                            <TabsTrigger value="security">账号安全</TabsTrigger>
                        </TabsList>

                        <TabsContent value="telegram" className="space-y-4 py-4">
                            <div className="flex items-center justify-between space-x-2 border-b pb-4">
                                <Label htmlFor="tg-enabled" className="flex flex-col space-y-1">
                                    <span>启用 Telegram 通知</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        当服务器触发自动开机或其他重要事件时发送通知
                                    </span>
                                </Label>
                                <Switch
                                    id="tg-enabled"
                                    checked={tgConfig.enabled}
                                    onCheckedChange={(checked) => setTgConfig({ ...tgConfig, enabled: checked })}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="tg-token">Bot Token</Label>
                                    <div className="relative">
                                        <Input
                                            id="tg-token"
                                            type="password"
                                            placeholder="123456789:ABCdefGhIjKlMnOpQrStUvWxYz"
                                            value={tgConfig.botToken}
                                            onChange={(e) => setTgConfig({ ...tgConfig, botToken: e.target.value })}
                                            disabled={!tgConfig.enabled}
                                        />
                                    </div>
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        从 @BotFather 获取的 API Token
                                    </p>
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="tg-chatid">Chat ID</Label>
                                    <Input
                                        id="tg-chatid"
                                        placeholder="-1001234567890"
                                        value={tgConfig.chatId}
                                        onChange={(e) => setTgConfig({ ...tgConfig, chatId: e.target.value })}
                                        disabled={!tgConfig.enabled}
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        接受通知的用户 ID 或群组 ID
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSaveTelegram} disabled={saving || loading}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    保存配置
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="ai" className="space-y-4 py-4">
                            <div className="flex items-center justify-between space-x-2 border-b pb-4">
                                <Label htmlFor="ai-enabled" className="flex flex-col space-y-1">
                                    <span>启用 AI</span>
                                    <span className="font-normal text-xs text-muted-foreground">
                                        启用后可使用 AI 问答与自动响应
                                    </span>
                                </Label>
                                <Switch
                                    id="ai-enabled"
                                    checked={aiConfig.enabled}
                                    onCheckedChange={(checked) => setAiConfig(prev => ({ ...prev, enabled: checked }))}
                                />
                            </div>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="ai-model">模型</Label>
                                    <Input
                                        id="ai-model"
                                        value={aiConfig.model}
                                        onChange={(e) => setAiConfig(prev => ({ ...prev, model: e.target.value }))}
                                        placeholder="gpt-4o-mini"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ai-baseurl">Base URL</Label>
                                    <Input
                                        id="ai-baseurl"
                                        value={aiConfig.baseURL}
                                        onChange={(e) => setAiConfig(prev => ({ ...prev, baseURL: e.target.value }))}
                                        placeholder="https://api.openai.com/v1"
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ai-key">API Key</Label>
                                    <Input
                                        id="ai-key"
                                        type="password"
                                        value={aiConfig.apiKey}
                                        onChange={(e) => setAiConfig(prev => ({ ...prev, apiKey: e.target.value }))}
                                        placeholder="sk-..."
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="ai-system">System Prompt</Label>
                                    <Input
                                        id="ai-system"
                                        value={aiConfig.systemPrompt}
                                        onChange={(e) => setAiConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                                        placeholder="You are a helpful Minecraft bot."
                                    />
                                </div>
                            </div>

                            <Button onClick={handleSaveAi} disabled={saving || loading} className="w-full">
                                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                                保存 AI 配置
                            </Button>
                        </TabsContent>

                        <TabsContent value="proxy" className="space-y-4 py-4 max-h-[550px] overflow-y-auto pr-1">
                            <div className="flex items-center justify-between border-b pb-4 mb-4">
                                <div className="flex items-center space-x-2">
                                    <Globe className="h-5 w-5 text-primary" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">管理代理节点 (支持 WS/TLS, Reality, VMess 等)</p>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Button variant="ghost" size="sm" onClick={handleImportLink}>
                                        <LinkIcon className="h-4 w-4 mr-1 text-blue-500" />
                                        导入链接
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={handleSyncSubscription}>
                                        <RefreshCw className="h-4 w-4 mr-1 text-green-500" />
                                        同步订阅
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={addProxyNode}>
                                        <Plus className="h-4 w-4 mr-1" />
                                        手动添加
                                    </Button>
                                </div>
                            </div>

                            {proxyNodes.length === 0 ? (
                                <div className="py-8 text-center text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                                    暂无代理节点
                                </div>
                            ) : (
                                <div className="border rounded-md overflow-hidden bg-card/50">
                                    <Table>
                                        <TableHeader className="bg-muted/50">
                                            <TableRow>
                                                <TableHead className="w-[80px]">协议</TableHead>
                                                <TableHead>别名 / 地址</TableHead>
                                                <TableHead className="w-[100px]">传输/安全</TableHead>
                                                <TableHead className="w-[80px]">延时</TableHead>
                                                <TableHead className="w-[100px] text-right">操作</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {proxyNodes.map((node) => (
                                                <TableRow key={node.id} className="hover:bg-muted/30 transition-colors">
                                                    <TableCell className="py-2">
                                                        <Badge variant="outline" className="uppercase font-mono text-[10px] px-1.5 h-5 bg-primary/5 text-primary border-primary/20">
                                                            {node.type}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <div className="flex flex-col gap-0.5">
                                                            <Input
                                                                className="h-6 text-sm font-medium p-0 border-none bg-transparent focus-visible:ring-0 shadow-none truncate"
                                                                value={node.name}
                                                                onChange={e => updateProxyNode(node.id, { name: e.target.value })}
                                                            />
                                                            <span className="text-[10px] font-mono text-muted-foreground truncate">
                                                                {node.server}:{node.port}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <div className="flex gap-1">
                                                            <Badge variant="secondary" className="text-[9px] px-1 h-4 font-normal">
                                                                {node.transport || 'tcp'}
                                                            </Badge>
                                                            {node.security && node.security !== 'none' && (
                                                                <Badge variant="default" className="text-[9px] px-1 h-4 font-normal bg-blue-500/20 text-blue-400 border-blue-500/30">
                                                                    {node.security}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2">
                                                        <div className="flex items-center gap-1">
                                                            {node.latency !== undefined && (
                                                                <span className={`text-[10px] font-mono font-medium ${node.latency > 0 ? (node.latency < 300 ? "text-emerald-500" : "text-yellow-500") : "text-destructive"}`}>
                                                                    {node.latency > 0 ? `${node.latency}` : "OFF"}
                                                                </span>
                                                            )}
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-6 w-6 text-zinc-500 hover:text-primary transition-colors"
                                                                onClick={() => handleTestNode(node.id)}
                                                                disabled={testLoading[node.id]}
                                                            >
                                                                {testLoading[node.id] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="py-2 text-right">
                                                        <div className="flex items-center justify-end gap-1">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedNode(node)}>
                                                                <Settings2 className="h-4 w-4" />
                                                            </Button>

                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-7 w-7 text-destructive"
                                                                onClick={() => removeProxyNode(node.id)}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}

                            <div className="flex justify-end pt-4 sticky bottom-[-10px] bg-background py-2 border-t mt-4 z-10">
                                <Button onClick={handleSaveProxy} disabled={saving || loading} className="shadow-lg shadow-primary/20">
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    保存并重启代理容器
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="security" className="space-y-4 py-4">
                            <div className="flex items-center space-x-2 border-b pb-4 mb-4">
                                <Lock className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="font-medium">修改登录密码</h3>
                                    <p className="text-xs text-muted-foreground">修改管理员账号的登录密码</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="current-password">当前密码</Label>
                                    <Input
                                        id="current-password"
                                        type="password"
                                        placeholder="输入当前使用的密码"
                                        value={passwordData.currentPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="new-password">新密码</Label>
                                    <Input
                                        id="new-password"
                                        type="password"
                                        placeholder="输入新密码"
                                        value={passwordData.newPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                    />
                                </div>

                                <div className="grid gap-2">
                                    <Label htmlFor="confirm-password">确认新密码</Label>
                                    <Input
                                        id="confirm-password"
                                        type="password"
                                        placeholder="再次输入新密码"
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-4">
                                <Button onClick={handleSavePassword} disabled={saving}>
                                    {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    <Save className="mr-2 h-4 w-4" />
                                    修改密码
                                </Button>
                            </div>
                        </TabsContent>
                    </Tabs>
                </DialogContent>
            </Dialog>

            {/* Sub-Dialog for editing node - Independent of the main Dialog tree */}
            {selectedNode && (
                <Dialog open={!!selectedNode} onOpenChange={(open) => !open && setSelectedNode(null)}>
                    <DialogContent
                        className="sm:max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col p-6 gap-0 z-[100] top-[15%] translate-y-0"
                        overlayClassName="z-[100]"
                    >
                        <DialogHeader className="mb-4">
                            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                                <Settings2 className="h-5 w-5 text-primary" />
                                节点参数配置
                            </DialogTitle>
                            <DialogDescription>
                                编辑节点的核心连接参数。更改将实时反映在下方 JSON 预览中。
                            </DialogDescription>
                        </DialogHeader>

                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-5 py-2">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">协议类型</Label>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        value={selectedNode.type}
                                        onChange={e => updateProxyNode(selectedNode.id, { type: e.target.value })}
                                    >
                                        <option value="vless">VLESS</option>
                                        <option value="vmess">VMess</option>
                                        <option value="trojan">Trojan</option>
                                        <option value="shadowsocks">Shadowsocks</option>
                                        <option value="hysteria2">Hysteria2</option>
                                        <option value="tuic">TUIC</option>
                                        <option value="socks">SOCKS5</option>
                                        <option value="http">HTTP</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">传输方式</Label>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        value={selectedNode.transport || 'tcp'}
                                        onChange={e => updateProxyNode(selectedNode.id, { transport: e.target.value as ProxyNode["transport"] })}
                                    >
                                        <option value="tcp">TCP</option>
                                        <option value="ws">WebSocket</option>
                                        <option value="grpc">gRPC</option>
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="col-span-2 space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">服务器地址</Label>
                                    <Input
                                        className="h-10"
                                        value={selectedNode.server}
                                        onChange={e => updateProxyNode(selectedNode.id, { server: e.target.value })}
                                        placeholder="ip or domain"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">端口</Label>
                                    <Input
                                        type="number"
                                        className="h-10"
                                        value={selectedNode.port}
                                        onChange={e => updateProxyNode(selectedNode.id, { port: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">密钥 (UUID/Password)</Label>
                                <Input
                                    className="h-10"
                                    type="password"
                                    value={selectedNode.uuid || selectedNode.password || ""}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (['vless', 'vmess'].includes(selectedNode.type)) updateProxyNode(selectedNode.id, { uuid: val });
                                        else updateProxyNode(selectedNode.id, { password: val });
                                    }}
                                    placeholder="Enter secret..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">TLS 增强安全</Label>
                                    <select
                                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                                        value={selectedNode.security || 'none'}
                                        onChange={e => updateProxyNode(selectedNode.id, { security: e.target.value as ProxyNode["security"] })}
                                    >
                                        <option value="none">None</option>
                                        <option value="tls">TLS</option>
                                        <option value="reality">Reality</option>
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">SNI 覆盖</Label>
                                    <Input
                                        className="h-10"
                                        value={selectedNode.sni || ""}
                                        onChange={e => updateProxyNode(selectedNode.id, { sni: e.target.value })}
                                        placeholder="Leave empty for auto"
                                    />
                                </div>
                            </div>

                            <div className="bg-zinc-950 rounded-xl p-4 border border-zinc-800 space-y-3 shadow-inner">
                                <div className="flex items-center justify-between">
                                    <Label className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">Live Configuration Preview</Label>
                                    <Badge variant="outline" className="text-[9px] h-4 bg-primary/20 text-primary border-primary/40 animate-pulse">SING-BOX</Badge>
                                </div>
                                <pre className="text-[11px] font-mono text-emerald-500 overflow-auto max-h-[140px] leading-relaxed custom-scrollbar">
                                    {JSON.stringify({
                                        tag: `out-${selectedNode.id}`,
                                        type: selectedNode.type,
                                        server: selectedNode.server,
                                        server_port: selectedNode.port,
                                        ...(selectedNode.uuid && { uuid: selectedNode.uuid.substring(0, 8) + '...' }),
                                        ...(selectedNode.password && { password: '***' }),
                                        ...(selectedNode.security === 'tls' && {
                                            tls: { enabled: true, server_name: selectedNode.sni || selectedNode.server, utls: { enabled: true, fingerprint: 'chrome' } }
                                        }),
                                        ...(selectedNode.transport === 'ws' && (() => {
                                            const wsPath = selectedNode.wsPath || '/';
                                            let maxEarlyData = selectedNode.max_early_data;
                                            if (maxEarlyData === undefined && wsPath.includes('ed=')) {
                                                const match = wsPath.match(/[?&]ed=(\d+)/);
                                                if (match) maxEarlyData = parseInt(match[1]);
                                            }
                                            return {
                                                transport: {
                                                    type: 'ws',
                                                    path: wsPath,
                                                    headers: { Host: selectedNode.wsHost || selectedNode.sni || selectedNode.server },
                                                    ...(maxEarlyData && {
                                                        max_early_data: maxEarlyData,
                                                        early_data_header_name: 'Sec-WebSocket-Protocol'
                                                    })
                                                }
                                            };
                                        })())
                                    }, null, 2)}
                                </pre>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 pt-6 mt-2 border-t">
                            <Button variant="ghost" onClick={() => setSelectedNode(null)}>
                                取消
                            </Button>
                            <Button
                                className="px-10 bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg shadow-primary/20"
                                onClick={() => setSelectedNode(null)}
                            >
                                保存配置
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </>
    );
}
