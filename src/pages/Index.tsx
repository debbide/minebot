import { Header } from "@/components/Header";
import { MultiServerPanel } from "@/components/MultiServerPanel";
import { RenewalPanel } from "@/components/RenewalPanel";
import { QuickControlPanel } from "@/components/QuickControlPanel";
import { ConsoleLog } from "@/components/ConsoleLog";
import { useWebSocket } from "@/hooks/useBot";
import { Server, Wifi, WifiOff, Users, Box } from "lucide-react";

const Index = () => {
  const { status, connected } = useWebSocket();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="px-4 py-6">
        {/* Status Overview Bar */}
        <div className="mb-6 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${connected ? 'bg-green-500/10' : 'bg-muted'}`}>
                {connected ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-muted-foreground" />
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">连接状态</p>
                <p className={`text-sm font-medium ${connected ? 'text-green-500' : 'text-muted-foreground'}`}>
                  {connected ? '已连接' : '未连接'}
                </p>
              </div>
            </div>

            {/* Bot Count */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Server className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">在线 Bot</p>
                <p className="text-sm font-medium">
                  {(status as any)?.connectedBots || 0} / {(status as any)?.totalBots || 0}
                </p>
              </div>
            </div>

            {/* Server */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Box className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">服务器</p>
                <p className="text-sm font-medium truncate max-w-[120px]">
                  {status?.serverAddress || '-'}
                </p>
              </div>
            </div>

            {/* Players */}
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <Users className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">在线玩家</p>
                <p className="text-sm font-medium">
                  {status?.players?.length || 0} 人
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Three Columns */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left Column - Server Management (wider) */}
          <div className="lg:col-span-1">
            <MultiServerPanel />
          </div>

          {/* Middle Column - Quick Controls */}
          <div className="lg:col-span-1">
            <QuickControlPanel />
          </div>

          {/* Right Column - Renewal */}
          <div className="lg:col-span-1">
            <RenewalPanel />
          </div>
        </div>

        {/* Bottom Section - Console Log (Full Width) */}
        <div className="mt-6">
          <ConsoleLog />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-8">
        <div className="px-4 text-center text-sm text-muted-foreground">
          <p>MC Bot — Minecraft 挂机助手</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
