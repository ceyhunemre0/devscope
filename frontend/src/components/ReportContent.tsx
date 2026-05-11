interface ReportContentProps {
  content: string;
}

export function ReportContent({ content }: ReportContentProps) {
  return (
    <pre className="whitespace-pre-wrap font-mono text-sm max-h-[70vh] overflow-auto rounded-lg border border-border bg-muted/30 p-4 text-foreground/90">
      {content}
    </pre>
  );
}
