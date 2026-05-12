import { Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import { BackendGate } from "@/components/BackendGate";
import DashboardPage from "@/pages/DashboardPage";
import ProjectsPage from "@/pages/ProjectsPage";
import AnalyticsPage from "@/pages/AnalyticsPage";
import SettingsPage from "@/pages/SettingsPage";

export default function App() {
  return (
    <BackendGate>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<div className="text-muted-foreground">404 — not found</div>} />
        </Routes>
      </Layout>
    </BackendGate>
  );
}
