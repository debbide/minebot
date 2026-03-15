import { Suspense, lazy } from "react";
import { Header } from "@/components/Header";
import { StatsOverview } from "@/components/StatsOverview";
import { useWebSocket } from "@/hooks/useBot";

const MultiServerPanel = lazy(() =>
  import("@/components/MultiServerPanel").then((module) => ({ default: module.MultiServerPanel }))
);

const Index = () => {
  const { status, connected } = useWebSocket();


  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl space-y-8 animate-in fade-in">
        <StatsOverview status={status} connected={connected} />



        <div className="space-y-4">
          <Suspense fallback={<div className="text-sm text-muted-foreground">加载服务器面板中...</div>}>
            <MultiServerPanel />
          </Suspense>
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
