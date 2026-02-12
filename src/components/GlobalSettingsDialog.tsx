import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { api, TelegramConfig, ProxyNode } from "@/lib/api";
import { Loader2, Save, Send, Lock, Globe, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

                    <TabsContent value="proxy" className="space-y-4 py-4 max-h-[450px] overflow-y-auto pr-2">
                        <div className="flex items-center justify-between border-b pb-4 mb-4">
                            <div className="flex items-center space-x-2">
                                <Globe className="h-5 w-5 text-primary" />
                                <div>
                                    <h3 className="font-medium">内置代理节点</h3>
                                    <p className="text-xs text-muted-foreground">管理用于各服务器卡片的代理节点 (支持 VLESS, Trojan, SS 等)</p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={addProxyNode}>
                                <Plus className="h-4 w-4 mr-1" />
                                添加节点
                            </Button>
                        </div>

                        {proxyNodes.length === 0 ? (
                            <div className="py-8 text-center text-muted-foreground text-sm border-2 border-dashed rounded-lg">
                                暂无代理节点，点击“添加节点”开始配置
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {proxyNodes.map((node, index) => (
                                    <div key={node.id} className="p-4 border rounded-lg space-y-3 relative group bg-card">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center space-x-2 flex-grow">
                                                <Badge variant="outline">{index + 1}</Badge>
                                                <Input
                                                    className="h-8 font-medium"
                                                    value={node.name}
                                                    onChange={e => updateProxyNode(node.id, { name: e.target.value })}
                                                    placeholder="节点名称"
                                                />
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                                onClick={() => removeProxyNode(node.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-xs">协议类型</Label>
                                                <select
                                                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                                    value={node.type}
                                                    onChange={e => updateProxyNode(node.id, { type: e.target.value })}
                                                >
                                                    <option value="vless">VLESS</option>
                                                    <option value="trojan">Trojan</option>
                                                    <option value="shadowsocks">Shadowsocks</option>
                                                    <option value="hysteria2">Hysteria2</option>
                                                    <option value="tuic">TUIC</option>
                                                    <option value="socks">SOCKS5</option>
                                                    <option value="http">HTTP</option>
                                                </select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">SNI / Server Name (可选)</Label>
                                                <Input
                                                    className="h-9"
                                                    value={node.sni || ""}
                                                    onChange={e => updateProxyNode(node.id, { sni: e.target.value })}
                                                    placeholder="example.com"
                                                />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-4">
                                            <div className="col-span-3 space-y-1">
                                                <Label className="text-xs">服务器地址</Label>
                                                <Input
                                                    className="h-9"
                                                    value={node.server}
                                                    onChange={e => updateProxyNode(node.id, { server: e.target.value })}
                                                    placeholder="example.com 或 1.2.3.4"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs">端口</Label>
                                                <Input
                                                    type="number"
                                                    className="h-9"
                                                    value={node.port}
                                                    onChange={e => updateProxyNode(node.id, { port: parseInt(e.target.value) || 0 })}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-xs">UUID / Password / Key</Label>
                                            <Input
                                                className="h-9"
                                                type="password"
                                                value={node.uuid || node.password || ""}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    if (node.type === 'vless') updateProxyNode(node.id, { uuid: val });
                                                    else updateProxyNode(node.id, { password: val });
                                                }}
                                                placeholder="输入验证凭据"
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end pt-4 sticky bottom-0 bg-background py-2 border-t mt-4">
                            <Button onClick={handleSaveProxy} disabled={saving || loading}>
                                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                <Save className="mr-2 h-4 w-4" />
                                保存并重启代理
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
