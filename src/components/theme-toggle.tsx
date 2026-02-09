"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setMounted(true);
    }, 100);
  }, []);

  if (!mounted) {
    return (
      <div className="flex items-center gap-0.5 rounded-full bg-muted p-1">
        <button className="flex h-6 w-6 items-center justify-center rounded-full">
          <Sun className="h-3 w-3" />
        </button>
        <button className="flex h-6 w-6 items-center justify-center rounded-full">
          <Moon className="h-3 w-3" />
        </button>
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex items-center gap-0.5 rounded-full bg-muted p-1">
      <button
        onClick={() => setTheme("light")}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          !isDark
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-label="Light mode"
      >
        <Sun className="h-3 w-3" />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full transition-colors",
          isDark
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
        aria-label="Dark mode"
      >
        <Moon className="h-3 w-3" />
      </button>
    </div>
  );
}
