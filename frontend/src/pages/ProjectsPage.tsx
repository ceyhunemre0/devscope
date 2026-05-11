import { PageHeader } from "@/components/PageHeader";

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        crumb="Projects"
        title="Your tracked repositories"
        lead="Add and manage the local git repos devscope monitors."
      />
      <div className="text-muted-foreground">Coming soon.</div>
    </>
  );
}
