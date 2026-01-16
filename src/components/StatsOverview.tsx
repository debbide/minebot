import { Server, Wifi, WifiOff, Users, Box } from "lucide-react";
import { StatusCard } from "./StatusCard";

interface StatsOverviewProps {
    status: any;
    connected: boolean;
}

export function StatsOverview({ status, connected }: StatsOverviewProps) {
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

            {/* Server Info */}
            <StatusCard
                title="目标服务器"
                value={status?.serverAddress || '-'}
                description="正在运行的目标服"
                icon={Box}
                status="warning"
                className="delay-300 animate-in slide-in-from-bottom"
            />

            {/* Player Count */}
            <StatusCard
                title="在线玩家"
                value={`${status?.players?.length || 0} 人`}
                description="服务器当前在线人数"
                icon={Users}
                status="warning"
                className="delay-400 animate-in slide-in-from-bottom"
            />
        </div>
    );
}
