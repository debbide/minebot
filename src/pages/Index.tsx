import { useState } from "react";
import { Header } from "@/components/Header";
import { MultiServerPanel } from "@/components/MultiServerPanel";

import { StatsOverview } from "@/components/StatsOverview";
import { useWebSocket } from "@/hooks/useBot";
import { Server } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const Index = () => {
  const { status, connected } = useWebSocket();


  return (
    <div className="min-h-screen bg-background selection:bg-primary/20 selection:text-primary">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl space-y-8 animate-in fade-in">
        <StatsOverview status={status} connected={connected} />



        <div className="space-y-4">
          <MultiServerPanel />
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
