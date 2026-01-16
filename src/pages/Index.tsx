import { useState } from "react";
import { Header } from "@/components/Header";
import { MultiServerPanel } from "@/components/MultiServerPanel";
import { RenewalPanel } from "@/components/RenewalPanel";
import { StatsOverview } from "@/components/StatsOverview";
import { useWebSocket } from "@/hooks/useBot";
import { Server, RefreshCw } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const Index = () => {
  const { status, connected } = useWebSocket();
  const [activeTab, setActiveTab] = useState("servers");

  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl space-y-8 animate-in fade-in">
        <StatsOverview status={status} connected={connected} />

        <div className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <TabsList className="h-12 p-1 bg-secondary/50 backdrop-blur-sm border border-border/50 rounded-xl">
                <TabsTrigger
                  value="servers"
                  className="px-6 h-full rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                >
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    <span>服务器管理</span>
                  </div>
                </TabsTrigger>
                <TabsTrigger
                  value="renewal"
                  className="px-6 h-full rounded-lg data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    <span>自动续期</span>
                  </div>
                </TabsTrigger>
              </TabsList>
            </div>

            <div className="relative min-h-[500px]">
              <TabsContent value="servers" className={cn(
                "mt-0 space-y-4 focus-visible:outline-none",
                "animate-in slide-in-from-bottom duration-500 fade-in"
              )}>
                <MultiServerPanel />
              </TabsContent>

              <TabsContent value="renewal" className={cn(
                "mt-0 space-y-4 focus-visible:outline-none",
                "animate-in slide-in-from-bottom duration-500 fade-in"
              )}>
                <RenewalPanel />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </main>

      <footer className="border-t border-border/40 py-8 mt-12 bg-background/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            MC Bot Assistant &copy; {new Date().getFullYear()} — Minecraft Automation Tool
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
