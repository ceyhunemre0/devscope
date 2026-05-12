interface SplashScreenProps {
  status?: string;
  error?: string;
}

export function SplashScreen({ status, error }: SplashScreenProps) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background gap-5 select-none">
      <span className="relative flex h-3 w-3">
        <span className="absolute inline-flex h-full w-full rounded-full bg-violet-500 opacity-75 blur-[6px] animate-pulse" />
        <span className="relative inline-flex h-3 w-3 rounded-full bg-violet-500" />
      </span>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        devscope
      </h1>

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
