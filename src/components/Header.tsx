import { Bot, Github, Menu, X, Settings, LogOut, User } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 glow-emerald">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">MC Bot Framework</h1>
            <p className="text-xs text-muted-foreground">mineflayer + AI 通用框架</p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-4 md:flex">
          <a href="#control" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            控制面板
          </a>
          <a href="#architecture" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            架构
          </a>
          <a href="#commands" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            指令
          </a>

          <div className="ml-2 flex items-center gap-2 border-l border-border pl-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/settings")}
              className="gap-2"
            >
              <Settings className="h-4 w-4" />
              <span className="hidden lg:inline">设置</span>
            </Button>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" />
              <span className="hidden lg:inline">{username}</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          "overflow-hidden border-b border-border bg-background transition-all duration-300 md:hidden",
          mobileMenuOpen ? "max-h-80" : "max-h-0 border-b-0"
        )}
      >
        <nav className="flex flex-col gap-2 px-4 py-4">
          <a href="#control" className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary">
            控制面板
          </a>
          <a href="#architecture" className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary">
            架构
          </a>
          <a href="#commands" className="rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary">
            指令
          </a>

          <div className="border-t border-border mt-2 pt-2">
            <button
              onClick={() => navigate("/settings")}
              className="w-full flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors hover:bg-secondary"
            >
              <Settings className="h-4 w-4" />
              系统设置
            </button>
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                {username}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-redstone hover:text-redstone hover:bg-redstone/10"
              >
                <LogOut className="h-4 w-4 mr-1" />
                退出
              </Button>
            </div>
          </div>
        </nav>
      </div>
    </header>
  );
}
