import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface StatusCardProps {
  title: string;
  value: string;
  icon: LucideIcon;
  status?: "online" | "offline" | "warning";
  description?: string;
  className?: string; // Added className prop for flexibility
}

export function StatusCard({
  title,
  value,
  icon: Icon,
  status = "online",
  description,
  className
}: StatusCardProps) {
  const statusColors = {
    online: "bg-emerald shadow-[0_0_10px_hsl(142_71%_45%_/_0.5)]",
    offline: "bg-destructive shadow-[0_0_10px_hsl(0_84%_60%_/_0.5)]",
    warning: "bg-accent shadow-[0_0_10px_hsl(262_83%_58%_/_0.5)]",
  };

  const iconColors = {
    online: "text-emerald bg-emerald/10",
    offline: "text-destructive bg-destructive/10",
    warning: "text-accent bg-accent/10",
  };

  return (
    <div className={cn(
      "glass-card px-6 py-5 group relative overflow-hidden rounded-xl",
      "transition-all duration-300 hover:scale-[1.02] hover:bg-card/80",
      className
    )}>
      {/* Background Gradient Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative flex items-start justify-between">
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className={cn("h-2.5 w-2.5 rounded-full ring-2 ring-background transition-colors duration-300", statusColors[status])} />
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/80">{title}</span>
          </div>

          <div className="space-y-1">
            <p className="text-2xl font-bold tracking-tight text-foreground transition-all duration-300 group-hover:text-glow">
              {value}
            </p>
            {description && (
              <p className="text-xs font-medium text-muted-foreground/80 line-clamp-1">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className={cn(
          "rounded-xl p-3 transition-colors duration-300",
          iconColors[status === 'offline' ? 'offline' : (status === 'warning' ? 'warning' : 'online')]
        )}>
          <Icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3" />
        </div>
      </div>
    </div>
  );
}
