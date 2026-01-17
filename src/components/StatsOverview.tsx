import { Server, Wifi, WifiOff, Users, HardDrive } from "lucide-react";
import { StatusCard } from "./StatusCard";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface StatsOverviewProps {
    status: any;
    connected: boolean;
}

export function StatsOverview({ status, connected }: StatsOverviewProps) {
    const [memory, setMemory] = useState<{ used: string; total: string; percent: string } | null>(null);

    // 获取内存状态
    useEffect(() => {
        const fetchMemory = async () => {
            try {
                const data = await api.getMemoryStatus();
                setMemory(data);
            } catch (error) {
                console.error('获取内存状态失败:', error);
            }
        };

        fetchMemory();
        const interval = setInterval(fetchMemory, 30000); // 每30秒刷新
        return () => clearInterval(interval);
    }, []);

    // 计算所有服务器的总玩家数
    const totalPlayers = status?.botList?.reduce((sum: number, bot: any) => {
        return sum + (bot.players?.length || 0);
    }, 0) || status?.players?.length || 0;

    // 内存状态颜色
    const memoryPercent = memory ? parseFloat(memory.percent) : 0;
    const memoryStatus = memoryPercent >= 80 ? "error" : memoryPercent >= 60 ? "warning" : "online";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Connection Status */}
            <StatusCard
                title="连接状态"
                value={connected ? "已连接" : "未连接"}
                description="WebSocket 实时通信"
                icon={connected ? Wifi : WifiOff}
                status={connected ? "online" : "offline"}
                className="delay-100 animate-in slide-in-from-bottom"
            />

            {/* Bot Count */}
            <StatusCard
                title="在线 Bot"
                value={`${status?.connectedBots || 0} / ${status?.totalBots || 0}`}
                description="当前活跃机器人数量"
                icon={Server}
                status="online"
                className="delay-200 animate-in slide-in-from-bottom"
            />

            {/* Memory Status */}
            <StatusCard
                title="内存监测"
                value={memory ? `${memory.percent}%` : '-'}
                description={memory ? `${memory.used} / ${memory.total} MB` : "获取中..."}
                icon={HardDrive}
                status={memoryStatus}
                className="delay-300 animate-in slide-in-from-bottom"
            />

            {/* Total Player Count */}
            <StatusCard
                title="在线玩家"
                value={`${totalPlayers} 人`}
                description="所有服务器总人数"
                icon={Users}
                status={totalPlayers > 0 ? "online" : "warning"}
                className="delay-400 animate-in slide-in-from-bottom"
            />
        </div>
    );
}
