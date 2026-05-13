import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface GlitchButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
}

export const GlitchButton = forwardRef<HTMLButtonElement, GlitchButtonProps>(
  ({ className, variant = "primary", children, ...props }, ref) => {
    const baseStyles = "relative px-6 py-2.5 font-medium rounded-lg transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary: "bg-primary text-white shadow-sm hover:bg-primary/90 hover:shadow-md",
      secondary: "bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-secondary/80",
      destructive: "bg-destructive text-white shadow-sm hover:bg-destructive/90",
      ghost: "bg-transparent text-foreground border border-border hover:bg-muted hover:text-foreground",
    };

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
GlitchButton.displayName = "GlitchButton";
