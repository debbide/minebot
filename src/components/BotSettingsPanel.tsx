
import { useState, useEffect } from "react";
import {
    Loader2,
    RotateCcw,
    Power,
    PowerOff,
    Zap,
    Crown,
    Globe,
    Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ProxyNode } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface BotSettingsPanelProps {
    botId: string;
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
        authType?: 'api' | 'cookie';
        apiKey?: string;
        cookie?: string;
        csrfToken?: string;
        serverId: string;
        autoRestart?: {
            enabled: boolean;
            maxRetries: number;
        };
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
    proxyNodeId?: string;
    onUpdate?: () => void;
}

export function BotSettingsPanel({
    botId,
    restartTimer,
    autoChat: autoChatProp,
    pterodactyl,
    sftp: sftpProp,
    fileAccessType: fileAccessTypeProp = 'pterodactyl',
    proxyNodeId: proxyNodeIdProp = '',
    onUpdate
}: BotSettingsPanelProps) {
    const [loading, setLoading] = useState<string | null>(null);
    const { toast } = useToast();

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
    const [panelAuthType, setPanelAuthType] = useState<'api' | 'cookie'>(pterodactyl?.authType || 'api');
    const [panelApiKey, setPanelApiKey] = useState(pterodactyl?.apiKey || "");
    const [panelCookie, setPanelCookie] = useState(pterodactyl?.cookie || "");
    const [panelCsrfToken, setPanelCsrfToken] = useState(pterodactyl?.csrfToken || "");
    const [panelServerId, setPanelServerId] = useState(pterodactyl?.serverId || "");
    const [autoRestartEnabled, setAutoRestartEnabled] = useState(pterodactyl?.autoRestart?.enabled || false);
    const [maxRetries, setMaxRetries] = useState(pterodactyl?.autoRestart?.maxRetries || 3);

    const [sftpHost, setSftpHost] = useState(sftpProp?.host || "");
    const [sftpPort, setSftpPort] = useState<string>((sftpProp?.port || 22).toString());
    const [sftpUsername, setSftpUsername] = useState(sftpProp?.username || "");
    const [sftpPassword, setSftpPassword] = useState(sftpProp?.password || "");
    const [sftpBasePath, setSftpBasePath] = useState(sftpProp?.basePath || "/");
    const [fileAccessType, setFileAccessType] = useState<'pterodactyl' | 'sftp' | 'none'>(fileAccessTypeProp);
    const [proxyNodeId, setProxyNodeId] = useState(proxyNodeIdProp || "");
    const [proxyNodes, setProxyNodes] = useState<ProxyNode[]>([]);

    // Sync state when props change
    useEffect(() => {
        setRestartMinutes(restartTimer?.intervalMinutes?.toString() || "0");
        setAutoChatEnabled(autoChatProp?.enabled || false);
        setAutoChatInterval(((autoChatProp?.interval || 60000) / 1000).toString());
        setAutoChatMessages(autoChatProp?.messages?.join("\n") || "");
        setPanelUrl(pterodactyl?.url || "");
        setPanelAuthType(pterodactyl?.authType || 'api');
        setPanelApiKey(pterodactyl?.apiKey || "");
        setPanelCookie(pterodactyl?.cookie || "");
        setPanelCsrfToken(pterodactyl?.csrfToken || "");
        setPanelServerId(pterodactyl?.serverId || "");
        setAutoRestartEnabled(pterodactyl?.autoRestart?.enabled || false);
        setMaxRetries(pterodactyl?.autoRestart?.maxRetries || 3);
        setSftpHost(sftpProp?.host || "");
        setSftpPort((sftpProp?.port || 22).toString());
        setSftpUsername(sftpProp?.username || "");
        setSftpPassword(sftpProp?.password || "");
        setSftpBasePath(sftpProp?.basePath || "/");
        setFileAccessType(fileAccessTypeProp);
        setProxyNodeId(proxyNodeIdProp || "");
    }, [botId, restartTimer, autoChatProp, pterodactyl, sftpProp, fileAccessTypeProp, proxyNodeIdProp]);

    // Load proxy nodes once
    useEffect(() => {
        api.getProxyNodes().then(setProxyNodes).catch(console.error);
    }, []);

    // Handlers
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

    const handleSavePterodactyl = async () => {
        setLoading("pterodactyl");
        try {
            await api.setPterodactyl(botId, {
                url: panelUrl,
                authType: panelAuthType,
                apiKey: panelApiKey,
                cookie: panelCookie,
                csrfToken: panelCsrfToken,
                serverId: panelServerId,
                autoRestart: {
                    enabled: autoRestartEnabled,
                    maxRetries: maxRetries
                }
            });
            toast({ title: "翼龙面板配置已保存" });
            onUpdate?.();
        } catch (error) {
            toast({ title: "错误", description: String(error), variant: "destructive" });
        } finally {
            setLoading(null);
        }
    };

    const handlePowerSignal = async (signal: 'start' | 'stop' | 'restart' | 'kill') => {
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

    const handleSaveProxy = async (nodeId: string) => {
        setLoading("proxy");
        try {
            await api.updateServer(botId, { proxyNodeId: nodeId });
            setProxyNodeId(nodeId);
            toast({
                title: "服务器代理已更新",
                description: nodeId ? `已连接到代理节点` : "已切换为直连模式"
            });
            onUpdate?.();
        } catch (error) {
            toast({ title: "错误", description: String(error), variant: "destructive" });
        } finally {
            setLoading(null);
        }
    };

    return (
        <Tabs defaultValue="restart" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="restart">通用</TabsTrigger>
                <TabsTrigger value="chat">喊话</TabsTrigger>
                <TabsTrigger value="network">网络</TabsTrigger>
                <TabsTrigger value="panel">面板</TabsTrigger>
                <TabsTrigger value="sftp">SFTP</TabsTrigger>
            </TabsList>

            <TabsContent value="restart" className="space-y-4 pt-4">
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

            <TabsContent value="network" className="space-y-4 pt-4">
                <div className="space-y-4">
                    <div className="flex items-center space-x-2 border-b pb-4">
                        <Globe className="h-5 w-5 text-primary" />
                        <div>
                            <h3 className="font-medium text-sm">代理设置</h3>
                            <p className="text-xs text-muted-foreground">选择此服务器卡片使用的出口代理节点</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>出口代理节点</Label>
                        <select
                            className="w-full h-10 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            value={proxyNodeId}
                            onChange={(e) => handleSaveProxy(e.target.value)}
                            disabled={loading === "proxy"}
                        >
                            <option value="">直连 (不使用代理)</option>
                            {proxyNodes.map(node => (
                                <option key={node.id} value={node.id}>
                                    {node.name} ({node.type} - {node.server})
                                </option>
                            ))}
                        </select>
                        <p className="text-[0.8rem] text-muted-foreground">
                            {proxyNodeId
                                ? "改变代理设置后，可能需要手动重启机器人以生效"
                                : "当前使用直连模式，直接连接到 Minecraft 服务器"}
                        </p>
                    </div>

                    <div className="p-3 bg-muted/30 rounded-lg text-xs space-y-2 text-muted-foreground border">
                        <div className="flex items-center space-x-1 font-medium text-foreground">
                            <Shield className="h-3 w-3" />
                            <span>安全与隐私</span>
                        </div>
                        <p>启用代理后，该服务器的所有 Minecraft 流量以及翼龙面板 API 访问都将通过指定的本地加密隧道转发。</p>
                        <p>这对于绕过网络限制、隐藏主控 IP 或连接受限服务器非常有用。</p>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="chat" className="space-y-4 pt-4">
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

            <TabsContent value="panel" className="space-y-4 pt-4">
                <div className="space-y-2">
                    <Label>面板地址</Label>
                    <Input
                        value={panelUrl}
                        onChange={(e) => setPanelUrl(e.target.value)}
                        placeholder="https://panel.example.com"
                    />
                </div>
                <div className="space-y-2">
                    <Label>认证方式</Label>
                    <div className="flex gap-2">
                        <Button
                            variant={panelAuthType === 'api' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPanelAuthType('api')}
                        >
                            API Key
                        </Button>
                        <Button
                            variant={panelAuthType === 'cookie' ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setPanelAuthType('cookie')}
                        >
                            Cookie (抓包)
                        </Button>
                    </div>
                </div>

                {panelAuthType === 'api' ? (
                    <div className="space-y-2">
                        <Label>API Key</Label>
                        <Input
                            type="password"
                            value={panelApiKey}
                            onChange={(e) => setPanelApiKey(e.target.value)}
                            placeholder="ptlc_..."
                        />
                    </div>
                ) : (
                    <>
                        <div className="space-y-2">
                            <Label>Cookie (pterodactyl_session)</Label>
                            <Textarea
                                value={panelCookie}
                                onChange={(e) => setPanelCookie(e.target.value)}
                                placeholder="eyJpdiI..."
                                rows={3}
                                className="font-mono text-xs"
                            />
                            <p className="text-xs text-muted-foreground">
                                请在浏览器 F12 网络面板中找到请求头的 Cookie
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>X-CSRF-Token (可选)</Label>
                            <Input
                                value={panelCsrfToken}
                                onChange={(e) => setPanelCsrfToken(e.target.value)}
                                placeholder="抓包获取 CSRF Token (部分面板可留空)"
                            />
                        </div>
                    </>
                )}

                <div className="space-y-2">
                    <Label>服务器 ID (UUID/Identifier)</Label>
                    <Input
                        value={panelServerId}
                        onChange={(e) => setPanelServerId(e.target.value)}
                        placeholder="abc12345"
                    />
                </div>

                <div className="flex items-center justify-between pt-4 border-t">
                    <div className="space-y-0.5">
                        <Label>崩溃自动重启</Label>
                        <p className="text-xs text-muted-foreground">检测到服务器意外离线时自动开机</p>
                    </div>
                    <Switch
                        checked={autoRestartEnabled}
                        onCheckedChange={setAutoRestartEnabled}
                    />
                </div>
                {autoRestartEnabled && (
                    <div className="space-y-2">
                        <Label>最大重试次数</Label>
                        <Input
                            type="number"
                            value={maxRetries}
                            onChange={(e) => setMaxRetries(parseInt(e.target.value) || 3)}
                            min="1"
                            max="10"
                        />
                        <p className="text-xs text-muted-foreground">连续失败多少次后放弃重启</p>
                    </div>
                )}

                <Button
                    onClick={handleSavePterodactyl}
                    disabled={loading === "pterodactyl"}
                    className="w-full"
                >

                    {loading === "pterodactyl" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                    保存面板配置
                </Button>

                <div className="pt-2 border-t">
                    <Label className="text-sm text-muted-foreground mb-2 block">服务器电源控制</Label>
                    <div className="grid grid-cols-2 gap-2">
                        <Button
                            variant="default"
                            onClick={() => handlePowerSignal('start')}
                            disabled={loading?.startsWith('power-') || !panelUrl}
                            className="bg-green-600 hover:bg-green-700 btn-glow"
                        >
                            {loading === "power-start" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Power className="h-4 w-4 mr-1" />}
                            开机
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => handlePowerSignal('stop')}
                            disabled={loading?.startsWith('power-') || !panelUrl}
                            className="bg-yellow-600 hover:bg-yellow-700 btn-glow"
                        >
                            {loading === "power-stop" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <PowerOff className="h-4 w-4 mr-1" />}
                            关机
                        </Button>
                        <Button
                            variant="default"
                            onClick={() => handlePowerSignal('restart')}
                            disabled={loading?.startsWith('power-') || !panelUrl}
                            className="bg-blue-600 hover:bg-blue-700 btn-glow"
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
            </TabsContent>

            <TabsContent value="sftp" className="space-y-4 pt-4">
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
                </div>
            </TabsContent>
        </Tabs>
    );
}
