import { Header } from "@/components/Header";
import { MultiServerPanel } from "@/components/MultiServerPanel";
import { ConsoleLog } from "@/components/ConsoleLog";
import { useWebSocket } from "@/hooks/useBot";

const Index = () => {
  const { status, connected } = useWebSocket();

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left Column - Server Management */}
          <div className="space-y-6">
            <MultiServerPanel />
          </div>

          {/* Right Column - Console */}
          <div className="space-y-6">
            {/* Status Summary */}
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">连接状态</h3>
                <div className={`flex items-center gap-2 text-sm ${connected ? 'text-green-500' : 'text-muted-foreground'}`}>
                  <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {connected ? 'WebSocket 已连接' : 'WebSocket 未连接'}
                </div>
              </div>

              {status && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">服务器：</span>
                    <span className="ml-2">{status.serverAddress || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">版本：</span>
                    <span className="ml-2">{status.version || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">在线 Bot：</span>
                    <span className="ml-2">{(status as any).connectedBots || 0} / {(status as any).totalBots || 0}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">玩家数：</span>
                    <span className="ml-2">{status.players?.length || 0}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Console Log */}
            <ConsoleLog />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-6 mt-8">
        <div className="mx-auto max-w-7xl px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>MC Bot Framework — Minecraft 多服务器挂机助手</p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
