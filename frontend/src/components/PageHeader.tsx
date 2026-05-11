interface Props {
  crumb: string;
  title: string;
  lead?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ crumb, title, lead, actions }: Props) {
  return (
    <div className="mb-8 flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {crumb}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {lead && (
          <p className="text-sm text-muted-foreground">{lead}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
