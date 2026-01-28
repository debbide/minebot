import { useState, useEffect } from "react";
import {
    RefreshCw,
    Plus,
    Trash2,
    Play,
    Square,
    CheckCircle,
    XCircle,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { api, RenewalTask } from "@/lib/api";

export function RenewalDashboard() {
    const [tasks, setTasks] = useState<RenewalTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [runningId, setRunningId] = useState<string | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        name: "",
        url: "",
        username: "",
        password: "",
        proxy: "",
        selectors: { renew_btn: "" },
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
            if (editingId) {
                await api.updateTask(editingId, formData);
            } else {
                await api.addTask(formData);
            }
            setDialogOpen(false);
            setFormData({
                name: "",
                url: "",
                username: "",
                password: "",
                proxy: "",
                selectors: { renew_btn: "" },
                interval: 6,
                enabled: true,
            });
            setEditingId(null);
            fetchTasks();
        } catch (error) {
            console.error(error);
            alert(`操作失败: ${error}`);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (task: RenewalTask) => {
        setFormData({
            name: task.name,
            url: task.url,
            username: task.username,
            password: task.password,
            proxy: task.proxy || "",
            selectors: task.selectors || { renew_btn: "" },
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
            alert(result.result?.message || "执行完成");
            fetchTasks();
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

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <RefreshCw className="h-5 w-5" />
                        续期任务管理
                    </CardTitle>
                    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                        <DialogTrigger asChild>
                            <Button size="sm" className="h-7 px-2">
                                <Plus className="h-3 w-3 mr-1" />
                                添加
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-lg">
                            <DialogHeader>
                                <DialogTitle>{editingId ? "编辑任务" : "添加任务"}</DialogTitle>
                                <DialogDescription>
                                    配置自动续期任务
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label>名称 *</Label>
                                    <Input
                                        placeholder="我的服务器"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>服务器页面 URL *</Label>
                                    <Input
                                        placeholder="https://panel.example.com/server?id=123"
                                        value={formData.url}
                                        onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>用户名 *</Label>
                                        <Input
                                            placeholder="your@email.com"
                                            value={formData.username}
                                            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>密码 *</Label>
                                        <Input
                                            type="password"
                                            placeholder="••••••••"
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>续期间隔（小时）</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={formData.interval}
                                        onChange={(e) => setFormData({ ...formData, interval: parseInt(e.target.value) || 6 })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>代理（可选）</Label>
                                    <Input
                                        placeholder="socks5://127.0.0.1:1080"
                                        value={formData.proxy}
                                        onChange={(e) => setFormData({ ...formData, proxy: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>续期按钮选择器（可选）</Label>
                                    <Input
                                        placeholder="留空自动查找"
                                        value={formData.selectors.renew_btn || ""}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            selectors: { renew_btn: e.target.value }
                                        })}
                                    />
                                </div>
                            </div>
                            <DialogFooter>
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
            </CardHeader>
            <CardContent className="space-y-3">
                {tasks.length === 0 ? (
                    <div className="text-center py-12">
                        <p className="text-muted-foreground mb-4">暂无任务</p>
                        <Button onClick={() => setDialogOpen(true)}>
                            <Plus className="h-4 w-4 mr-2" />
                            添加第一个任务
                        </Button>
                    </div>
                ) : (
                    tasks.map((task) => (
                        <Card key={task.id} className="p-4 hover:shadow-md transition-shadow">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold">{task.name || task.url}</span>
                                        {task.enabled ? (
                                            <Badge variant="default" className="text-xs">启用</Badge>
                                        ) : (
                                            <Badge variant="secondary" className="text-xs">禁用</Badge>
                                        )}
                                        {task.lastResult && (
                                            task.lastResult.success ? (
                                                <CheckCircle className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <XCircle className="h-4 w-4 text-red-500" />
                                            )
                                        )}
                                    </div>
                                    <div className="text-sm text-muted-foreground space-y-1">
                                        <div>URL: {task.url}</div>
                                        <div>间隔: 每 {task.interval} 小时</div>
                                        {task.lastRun && (
                                            <div>上次运行: {new Date(task.lastRun).toLocaleString("zh-CN")}</div>
                                        )}
                                        {task.lastResult && (
                                            <div className={task.lastResult.success ? "text-green-600" : "text-red-600"}>
                                                {task.lastResult.message}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        checked={task.enabled}
                                        onCheckedChange={(checked) => handleToggle(task.id, checked)}
                                    />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleRun(task.id)}
                                        disabled={runningId === task.id}
                                    >
                                        {runningId === task.id ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Play className="h-4 w-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleEdit(task)}
                                    >
                                        编辑
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleDelete(task.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
