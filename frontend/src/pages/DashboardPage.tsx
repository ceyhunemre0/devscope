import { PageHeader } from "@/components/PageHeader";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        crumb="Dashboard"
        title="What's happening in your code"
        lead="AI-summarised commit activity across your tracked projects."
      />
      <div className="text-muted-foreground">Coming soon.</div>
    </>
  );
}
