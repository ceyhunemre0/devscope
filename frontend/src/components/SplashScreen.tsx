import logoWordmark from "@/assets/logo-wordmark.png";

interface SplashScreenProps {
  status?: string;
  error?: string;
}

export function SplashScreen({ status, error }: SplashScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-6 select-none">
      <img
        src={logoWordmark}
        alt="devscope"
        className="h-20 w-auto drop-shadow-[0_0_30px_rgba(139,92,246,0.35)]"
        draggable={false}
      />

      {error ? (
        <p className="text-sm text-destructive max-w-md text-center px-6">
          {error}
        </p>
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-violet-500/70 animate-pulse" />
          <span>{status ?? "Starting backend…"}</span>
        </div>
      )}
    </div>
  );
}
