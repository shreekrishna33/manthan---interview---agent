import { cn } from "@/lib/utils";
import { WakeState } from "@/hooks/use-manthana";

interface ManthanIndicatorProps {
  wakeState: WakeState;
}

const STATE_CONFIG = {
  waking: {
    label: "Hey! I'm Manthan 👋",
    gradient: "from-violet-500 to-purple-600",
    ringColor: "bg-violet-400",
    glow: "shadow-violet-500/60",
    bars: [2, 4, 3, 5, 3, 4, 2],
    animate: "animate-bounce",
  },
  listening: {
    label: "Manthan is listening...",
    gradient: "from-indigo-500 to-blue-600",
    ringColor: "bg-indigo-400",
    glow: "shadow-indigo-500/60",
    bars: [1, 3, 5, 4, 5, 3, 1],
    animate: "animate-bounce",
  },
  processing: {
    label: "Manthan is thinking...",
    gradient: "from-primary to-primary/70",
    ringColor: "bg-primary",
    glow: "shadow-primary/60",
    bars: [3, 3, 3, 3, 3, 3, 3],
    animate: "",
  },
} as const;

export function ManthanIndicator({ wakeState }: ManthanIndicatorProps) {
  if (wakeState === "idle" || wakeState === "inactive") return null;

  const cfg = STATE_CONFIG[wakeState as keyof typeof STATE_CONFIG];
  if (!cfg) return null;

  const isPulsing = wakeState !== "processing";

  return (
    <div className="fixed inset-0 pointer-events-none z-50 flex items-end justify-center pb-36 animate-in fade-in duration-300">
      {/* Backdrop blur hint */}
      <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-background/20 to-transparent" />

      <div className="relative flex flex-col items-center gap-4 pointer-events-auto animate-in slide-in-from-bottom-6 duration-500">
        {/* Outer ripple rings */}
        {isPulsing && (
          <>
            <span
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] rounded-full opacity-20 animate-ping",
                cfg.ringColor
              )}
              style={{ width: 96, height: 96 }}
            />
            <span
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] rounded-full opacity-10 animate-ping [animation-delay:0.4s]",
                cfg.ringColor
              )}
              style={{ width: 120, height: 120 }}
            />
            <span
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[60%] rounded-full opacity-5 animate-ping [animation-delay:0.8s]",
                cfg.ringColor
              )}
              style={{ width: 148, height: 148 }}
            />
          </>
        )}

        {/* Main avatar circle */}
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center shadow-2xl bg-gradient-to-br",
            cfg.gradient,
            cfg.glow
          )}
        >
          {/* Waveform bars inside circle */}
          <div className="flex items-end gap-[3px] h-10 px-1">
            {cfg.bars.map((h, i) => (
              <span
                key={i}
                className={cn(
                  "w-[3px] rounded-full bg-white/90 transition-all",
                  cfg.animate
                )}
                style={{
                  height: wakeState === "processing" ? "12px" : `${h * 5}px`,
                  animationDelay: `${i * 80}ms`,
                  animationDuration: wakeState === "listening" ? "0.55s" : "0.75s",
                }}
              />
            ))}
          </div>
        </div>

        {/* Label pill */}
        <div
          className={cn(
            "bg-card/90 backdrop-blur border border-border shadow-xl rounded-full px-6 py-2.5 text-sm font-semibold text-foreground",
            "flex items-center gap-2"
          )}
        >
          {/* Dot indicator */}
          <span
            className={cn(
              "inline-block w-2 h-2 rounded-full",
              cfg.ringColor,
              isPulsing ? "animate-pulse" : ""
            )}
          />
          {cfg.label}
        </div>
      </div>
    </div>
  );
}
