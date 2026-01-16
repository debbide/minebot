import { Bot, Menu, X, Settings, LogOut, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const navLinks = [
    { name: "控制面板", href: "/" },
    { name: "系统架构", href: "/architecture" }, // Assuming routing exists, otherwise #architecture
    { name: "指令大全", href: "/commands" },    // Assuming routing exists, otherwise #commands
  ];

  return (
    <header className={cn(
      "glass-header transition-all duration-300",
      scrolled ? "py-2 shadow-sm" : "py-4 bg-transparent border-transparent"
    )}>
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => navigate("/")}>
          <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/20 transition-all duration-300 group-hover:scale-105 group-hover:shadow-primary/30">
            <Bot className="h-6 w-6 text-primary-foreground" />
            <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
              MC Bot Assistant
            </h1>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
              Minecraft Automation
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <Button
              key={link.name}
              variant="ghost"
              className={cn(
                "text-sm font-medium transition-all duration-200 hover:bg-primary/10 hover:text-primary",
                location.pathname === link.href ? "bg-primary/5 text-primary" : "text-muted-foreground"
              )}
              onClick={() => navigate(link.href)}
            >
              {link.name}
            </Button>
          ))}

          <div className="ml-4 flex items-center gap-3 border-l border-border/50 pl-4">
            <div className="flex items-center gap-3 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50 backdrop-blur-sm">
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-sm font-medium text-foreground">{username}</span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/settings")}
              className="rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-200"
            >
              <Settings className="h-5 w-5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleLogout}
              className="rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all duration-200"
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Menu */}
      <div
        className={cn(
          "fixed inset-x-0 top-[calc(3.5rem+1px)] z-40 bg-background/95 backdrop-blur-3xl border-b border-border transition-all duration-300 md:hidden overflow-hidden",
          mobileMenuOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <nav className="flex flex-col gap-2 p-4 space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.name}
              onClick={() => {
                navigate(link.href);
                setMobileMenuOpen(false);
              }}
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary cursor-pointer active:bg-primary/10"
            >
              {link.name}
            </a>
          ))}

          <div className="border-t border-border/50 my-2 pt-2 space-y-2">
            <div className="px-4 py-2 flex items-center gap-3 text-sm text-foreground">
              <User className="h-4 w-4 text-primary" />
              {username}
            </div>

            <button
              onClick={() => {
                navigate("/settings");
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors"
            >
              <Settings className="h-4 w-4" />
              系统设置
            </button>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              退出登录
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}
