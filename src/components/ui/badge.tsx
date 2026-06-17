import { cn } from "@/lib/utils";

interface BadgeProps {
  variant?: "default" | "outline" | "secondary" | "warning" | "destructive";
  className?: string;
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  default: "bg-primary text-primary-foreground",
  outline: "border border-border text-foreground",
  secondary: "bg-secondary text-secondary-foreground",
  warning: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  destructive: "bg-destructive text-destructive-foreground",
};

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
