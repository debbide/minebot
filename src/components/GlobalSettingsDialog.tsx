import { useState, useEffect } from "react";
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
    const [testLoading, setTestLoading] = useState<Record<string, boolean>>({});

    useEffect(() => {
        if (open) {
            loadConfig();
        }
    }, [open]);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const tg = await api.getTelegramConfig();
            setTgConfig(tg);
            const nodes = await api.getProxyNodes();
            setProxyNodes(nodes);
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
        } catch (error: any) {
            console.error("Failed to change password:", error);
            toast({
                title: "修改失败",
                description: error.message || "无法修改密码，请检查当前密码是否正确",
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
        } catch (error: any) {
            toast({ title: "导入失败", description: error.message, variant: "destructive" });
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
        } catch (error: any) {
            toast({ title: "同步失败", description: error.message, variant: "destructive" });
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
        } catch (error: any) {
            toast({ title: "测试错误", description: error.message, variant: "destructive" });
        } finally {
            setTestLoading(prev => ({ ...prev, [id]: false }));
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[600px] top-[15%] translate-y-0">
                <DialogHeader>
                    <DialogTitle>全局设置</DialogTitle>
                    <DialogDescription>
                        管理应用程序的全局配置和通知服务
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="telegram" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="telegram">Telegram 通知</TabsTrigger>
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
                                                        <Popover>
                                                            <PopoverTrigger asChild>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                                                    <Settings2 className="h-4 w-4" />
                                                                </Button>
                                                            </PopoverTrigger>
                                                            <PopoverContent className="w-80 space-y-4 shadow-2xl border-primary/10">
                                                                <div className="grid gap-4">
                                                                    <div className="space-y-2">
                                                                        <h4 className="font-medium leading-none">编辑节点</h4>
                                                                        <p className="text-xs text-muted-foreground">配置高级传输与安全参数</p>
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px]">协议类型</Label>
                                                                            <select
                                                                                className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                value={node.type}
                                                                                onChange={e => updateProxyNode(node.id, { type: e.target.value })}
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
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px]">传输方式</Label>
                                                                            <select
                                                                                className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                value={node.transport || 'tcp'}
                                                                                onChange={e => updateProxyNode(node.id, { transport: e.target.value as any })}
                                                                            >
                                                                                <option value="tcp">TCP</option>
                                                                                <option value="ws">WebSocket</option>
                                                                                <option value="grpc">gRPC</option>
                                                                            </select>
                                                                        </div>
                                                                    </div>

                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        <div className="col-span-2 space-y-1">
                                                                            <Label className="text-[10px]">服务器地址</Label>
                                                                            <Input
                                                                                className="h-8 text-xs"
                                                                                value={node.server}
                                                                                onChange={e => updateProxyNode(node.id, { server: e.target.value })}
                                                                                placeholder="host"
                                                                            />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px]">端口</Label>
                                                                            <Input
                                                                                type="number"
                                                                                className="h-8 text-xs px-1"
                                                                                value={node.port}
                                                                                onChange={e => updateProxyNode(node.id, { port: parseInt(e.target.value) || 0 })}
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    <div className="space-y-1">
                                                                        <Label className="text-[10px]">用户 ID / 密码</Label>
                                                                        <Input
                                                                            className="h-8 text-xs"
                                                                            type="password"
                                                                            value={node.uuid || node.password || ""}
                                                                            onChange={e => {
                                                                                const val = e.target.value;
                                                                                if (['vless', 'vmess'].includes(node.type)) updateProxyNode(node.id, { uuid: val });
                                                                                else updateProxyNode(node.id, { password: val });
                                                                            }}
                                                                            placeholder="Credentials"
                                                                        />
                                                                    </div>

                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px]">安全 / TLS</Label>
                                                                            <select
                                                                                className="w-full h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                                                value={node.security || 'none'}
                                                                                onChange={e => updateProxyNode(node.id, { security: e.target.value as any })}
                                                                            >
                                                                                <option value="none">None</option>
                                                                                <option value="tls">TLS</option>
                                                                                <option value="reality">Reality</option>
                                                                            </select>
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <Label className="text-[10px]">SNI (域名)</Label>
                                                                            <Input
                                                                                className="h-8 text-xs"
                                                                                value={node.sni || ""}
                                                                                onChange={e => updateProxyNode(node.id, { sni: e.target.value })}
                                                                                placeholder="sni"
                                                                            />
                                                                        </div>
                                                                    </div>

                                                                    {node.transport === 'ws' && (
                                                                        <div className="grid grid-cols-2 gap-2 p-2 bg-muted/40 rounded-md border border-border/50">
                                                                            <div className="space-y-1">
                                                                                <Label className="text-[9px] uppercase font-bold text-muted-foreground">WS 路径</Label>
                                                                                <Input
                                                                                    className="h-7 text-xs bg-background"
                                                                                    value={node.wsPath || ""}
                                                                                    onChange={e => updateProxyNode(node.id, { wsPath: e.target.value })}
                                                                                    placeholder="/"
                                                                                />
                                                                            </div>
                                                                            <div className="space-y-1">
                                                                                <Label className="text-[9px] uppercase font-bold text-muted-foreground">WS Host</Label>
                                                                                <Input
                                                                                    className="h-7 text-xs bg-background"
                                                                                    value={node.wsHost || ""}
                                                                                    onChange={e => updateProxyNode(node.id, { wsHost: e.target.value })}
                                                                                    placeholder="host"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    {node.security === 'reality' && (
                                                                        <div className="space-y-2 p-2 bg-blue-500/5 rounded-md border border-blue-500/10">
                                                                            <div className="grid grid-cols-2 gap-2">
                                                                                <div className="space-y-1">
                                                                                    <Label className="text-[9px] uppercase font-bold text-blue-500/70">Reality PBK</Label>
                                                                                    <Input
                                                                                        className="h-7 text-xs"
                                                                                        value={node.pbk || ""}
                                                                                        onChange={e => updateProxyNode(node.id, { pbk: e.target.value })}
                                                                                    />
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    <Label className="text-[9px] uppercase font-bold text-blue-500/70">Reality SID</Label>
                                                                                    <Input
                                                                                        className="h-7 text-xs"
                                                                                        value={node.sid || ""}
                                                                                        onChange={e => updateProxyNode(node.id, { sid: e.target.value })}
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </PopoverContent>
                                                        </Popover>

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
        </Dialog >
    );
}
