import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";
import { api, TelegramConfig } from "@/lib/api";
import { Loader2, Save, Send, Lock } from "lucide-react";

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

    useEffect(() => {
        if (open) {
            loadConfig();
        }
    }, [open]);

    const loadConfig = async () => {
        try {
            setLoading(true);
            const config = await api.getTelegramConfig();
            setTgConfig(config);
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
                        <TabsTrigger value="security">账号安全</TabsTrigger>
                        <TabsTrigger value="general" disabled>通用设置</TabsTrigger>
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
