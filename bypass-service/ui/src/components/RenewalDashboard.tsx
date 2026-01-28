import { useState, useEffect } from "react";
import {
    RefreshCw,
    Plus,
    Trash2,
    Play,
    CheckCircle,
    XCircle,
    Loader2,
    Settings2,
    Clock,
    Eye,
    ChevronDown,
    ChevronUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type RenewalTask } from "@/lib/api";

export function RenewalDashboard() {
    const [tasks, setTasks] = useState<RenewalTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<RenewalTask | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const [formData, setFormData] = useState({
        name: "",
        url: "",
        username: "",
        password: "",
        proxy: "",
        selectors: { renew_btn: "", confirm_btn: "" },
        timeout: 120,
        wait_time: 5,
        success_keywords: "",
        interval: 6,
        enabled: true,
    });

    const fetchTasks = async () => {
        try {
            const data = await api.getTasks();
            setTasks(data);
        } catch (error) {
            console.error("Failed to fetch tasks:", error);
        }
    };

    useEffect(() => {
        fetchTasks();
        const interval = setInterval(fetchTasks, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async () => {
        if (!formData.url || !formData.username || !formData.password) {
            alert("请填写必填项：URL、用户名、密码");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                ...formData,
                success_keywords: formData.success_keywords.split(',').map(k => k.trim()).filter(Boolean)
            };

            if (editingId) {
                await api.updateTask(editingId, payload);
            } else {
                await api.addTask(payload);
            }
            setDialogOpen(false);
            resetForm();
            fetchTasks();
        } catch (error) {
            console.error(error);
            alert(`操作失败: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setFormData({
            name: "",
            url: "",
            username: "",
            password: "",
            proxy: "",
            selectors: { renew_btn: "", confirm_btn: "" },
            timeout: 120,
            wait_time: 5,
            success_keywords: "",
            interval: 6,
            enabled: true,
        });
        setEditingId(null);
        setAdvancedOpen(false);
    };

    const handleEdit = (task: RenewalTask) => {
        setFormData({
            name: task.name,
            url: task.url,
            username: task.username,
            password: task.password,
            proxy: task.proxy || "",
            selectors: {
                renew_btn: task.selectors?.renew_btn || "",
                confirm_btn: task.selectors?.confirm_btn || ""
            },
            timeout: task.timeout || 120,
            wait_time: task.wait_time || 5,
            success_keywords: (task.success_keywords || []).join(', '),
            interval: task.interval,
            enabled: task.enabled,
        });
        setEditingId(task.id);
        setDialogOpen(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm("确认删除此任务？")) return;
        try {
            await api.deleteTask(id);
            fetchTasks();
        } catch (error) {
            alert(`删除失败: ${error}`);
        }
    };

    const handleRun = async (id: string) => {
        setRunningId(id);
        try {
            const result = await api.runTask(id);
            fetchTasks();
            // Auto open details if failed or just finished
            const task = tasks.find(t => t.id === id);
            if (task) {
                // Update local task immediately to show result
                task.lastResult = result.result;
                setSelectedTask({ ...task });
                setDetailsOpen(true);
            }
        } catch (error) {
            alert(`执行失败: ${error}`);
        } finally {
            setRunningId(null);
        }
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        try {
            await api.toggleTask(id, enabled);
            fetchTasks();
        } catch (error) {
            alert(`切换失败: ${error}`);
        }
    };

    const showDetails = (task: RenewalTask) => {
        setSelectedTask(task);
        setDetailsOpen(true);
    };

    return (
        <Card className="overflow-hidden border-none shadow-none bg-transparent">
            <CardHeader className="px-0 pb-6">
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-primary" />
                            自动续期任务
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">
                            管理所有服务器的自动保持在线任务
                        </p>
                    </div>

                    <Dialog open={dialogOpen} onOpenChange={(open) => {
                        setDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                新建任务
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader>
                                <DialogTitle>{editingId ? "编辑任务" : "添加任务"}</DialogTitle>
                                <DialogDescription>
                                    配置自动化浏览器操作以保持服务器在线
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4 py-4">
                                {/* Basic Config */}
                                <div className="space-y-2">
                                    <Label>任务名称</Label>
                                    <Input
                                        placeholder="例如: 我的 Aternos 服务器"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>目标 URL *</Label>
                                    <Input
                                        placeholder="https://..."
                                        value={formData.url}
                                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>用户名/邮箱 *</Label>
                                        <Input
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>密码 *</Label>
                                        <Input
                                            type="password"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>运行间隔 (小时)</Label>
                                        <Input
                                            type="number"
                                            min="1"
                                            value={formData.interval}
                                            onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) || 6 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>代理 (Proxy)</Label>
                                        <Input
                                            placeholder="socks5://..."
                                            value={formData.proxy}
                                            onChange={(e) => setFormData({ ...formData, proxy: e.target.value })}
                                        />
                                    </div>
                                </div>

                                {/* Advanced Config */}
                                <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="border rounded-md p-4 bg-muted/20">
                                    <CollapsibleTrigger asChild>
                                        <Button variant="ghost" size="sm" className="w-full flex justify-between">
                                            <span className="flex items-center gap-2">
                                                <Settings2 className="h-4 w-4" />
                                                高级设置
                                            </span>
                                            {advancedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                        </Button>
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="space-y-4 pt-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>操作超时 (秒)</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.timeout}
                                                    onChange={(e) => setFormData({ ...formData, timeout: parseInt(e.target.value) || 120 })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>页面等待 (秒)</Label>
                                                <Input
                                                    type="number"
                                                    value={formData.wait_time}
                                                    onChange={(e) => setFormData({ ...formData, wait_time: parseInt(e.target.value) || 5 })}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <Label>自定义续期按钮选择器 (CSS)</Label>
                                            <Input
                                                placeholder="例如: #renew-btn, button.convert"
                                                value={formData.selectors.renew_btn || ""}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    selectors: { ...formData.selectors, renew_btn: e.target.value }
                                                })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>自定义确认按钮选择器 (CSS)</Label>
                                            <Input
                                                placeholder="例如: #confirm-modal-btn"
                                                value={formData.selectors.confirm_btn || ""}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    selectors: { ...formData.selectors, confirm_btn: e.target.value }
                                                })}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>成功关键词 (逗号分隔)</Label>
                                            <Input
                                                placeholder="例如: success, renewed, 成功"
                                                value={formData.success_keywords}
                                                onChange={(e) => setFormData({ ...formData, success_keywords: e.target.value })}
                                            />
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
                                <Button onClick={handleSubmit} disabled={loading}>
                                    {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                    {editingId ? "保存修改" : "立即创建"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>

            <CardContent className="px-0">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {tasks.map((task) => (
                        <Card key={task.id} className="group overflow-hidden border bg-card/50 hover:bg-card hover:shadow-lg transition-all duration-300">
                            <CardContent className="p-5 space-y-4">
                                <div className="flex items-start justify-between">
                                    <div className="space-y-1">
                                        <h3 className="font-semibold text-lg line-clamp-1" title={task.name}>
                                            {task.name || "未命名任务"}
                                        </h3>
                                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]" title={task.url}>
                                            {task.url}
                                        </p>
                                    </div>
                                    <Switch
                                        checked={task.enabled}
                                        onCheckedChange={(checked) => handleToggle(task.id, checked)}
                                    />
                                </div>

                                <div className="flex items-center gap-2 text-sm">
                                    <Badge variant={task.lastResult?.success ? "success" : (task.lastResult ? "destructive" : "outline")}
                                        className={task.lastResult?.success ? "bg-green-500/10 text-green-500 border-green-500/20" : ""}
                                    >
                                        {task.lastResult?.success ? "运行成功" : (task.lastResult ? "运行失败" : "从未运行")}
                                    </Badge>
                                    <span className="text-muted-foreground text-xs flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {task.interval}h
                                    </span>
                                </div>

                                {task.lastResult && (
                                    <div className="text-xs bg-muted/50 p-2 rounded border border-border/50">
                                        <div className="line-clamp-2 text-muted-foreground">
                                            {task.lastResult.message}
                                        </div>
                                        <div className="mt-1 text-[10px] text-muted-foreground/60">
                                            {new Date(task.lastResult.timestamp).toLocaleString()}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center gap-2 pt-2">
                                    <Button
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => handleRun(task.id)}
                                        disabled={runningId === task.id}
                                    >
                                        {runningId === task.id ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                执行中
                                            </>
                                        ) : (
                                            <>
                                                <Play className="h-4 w-4 mr-2" />
                                                立即运行
                                            </>
                                        )}
                                    </Button>
                                    <Button size="icon" variant="outline" onClick={() => showDetails(task)} title="查看详情">
                                        <Eye className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="outline" onClick={() => handleEdit(task)} title="编辑配置">
                                        <Settings2 className="h-4 w-4" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(task.id)} title="删除任务">
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {tasks.length === 0 && (
                        <div className="col-span-full py-12 flex flex-col items-center justify-center text-center border-2 border-dashed rounded-xl bg-muted/5">
                            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <RefreshCw className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-semibold">暂无续期任务</h3>
                            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-6">
                                创建一个任务来自动管理您的服务器续期。支持 Cloudflare 绕过和自定义操作。
                            </p>
                            <Button onClick={() => setDialogOpen(true)}>
                                <Plus className="h-4 w-4 mr-2" />
                                创建第一个任务
                            </Button>
                        </div>
                    )}
                </div>
            </CardContent>

            {/* Task Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>任务详情: {selectedTask?.name}</DialogTitle>
                        <DialogDescription>
                            查看最近一次运行的详细日志和截图
                        </DialogDescription>
                    </DialogHeader>

                    {selectedTask?.lastResult ? (
                        <div className="space-y-6">
                            {/* Status Banner */}
                            <div className={`p-4 rounded-lg flex items-center gap-3 ${selectedTask.lastResult.success ? 'bg-green-500/10 border border-green-500/20 text-green-600' : 'bg-red-500/10 border border-red-500/20 text-red-600'}`}>
                                {selectedTask.lastResult.success ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                                <div>
                                    <div className="font-semibold">{selectedTask.lastResult.message}</div>
                                    <div className="text-xs opacity-80">{new Date(selectedTask.lastResult.timestamp).toLocaleString()}</div>
                                </div>
                            </div>

                            {/* Screenshot */}
                            {selectedTask.lastResult.screenshot_url && (
                                <div className="space-y-2">
                                    <Label>执行截图</Label>
                                    <div className="rounded-lg overflow-hidden border bg-black/50 aspect-video flex items-center justify-center relative group">
                                        {/* Use API base url if needed */}
                                        <img
                                            src={import.meta.env.PROD ? selectedTask.lastResult.screenshot_url : `http://localhost:5000${selectedTask.lastResult.screenshot_url}`}
                                            alt="Execution Screenshot"
                                            className="max-w-full max-h-full object-contain"
                                        />
                                        <a
                                            href={import.meta.env.PROD ? selectedTask.lastResult.screenshot_url : `http://localhost:5000${selectedTask.lastResult.screenshot_url}`}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                                        >
                                            <Eye className="h-8 w-8 mr-2" />
                                            查看大图
                                        </a>
                                    </div>
                                </div>
                            )}

                            {/* Logs */}
                            {selectedTask.lastResult.logs && selectedTask.lastResult.logs.length > 0 && (
                                <div className="space-y-2">
                                    <Label>运行日志</Label>
                                    <ScrollArea className="h-[200px] w-full rounded-md border bg-muted/30 p-4 font-mono text-xs">
                                        {selectedTask.lastResult.logs.map((log: any, i: number) => (
                                            <div key={i} className={`mb-1 ${log.type === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
                                                <span className="opacity-50">[{new Date(log.time).toLocaleTimeString()}]</span> {log.message}
                                            </div>
                                        ))}
                                    </ScrollArea>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-muted-foreground">
                            该任务尚未运行，请点击“立即运行”以生成数据。
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}
