import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import DashboardShell from "../../components/layout/DashboardShell";
import OperationsClient from "../../components/operations/OperationsClient";
import { ThemeProvider } from "../../providers/ThemeProvider";
import type { OpsData } from "../../lib/operations-types";
function Preview() {
  const [data, setData] = useState<OpsData | null>(null);
  useEffect(() => {
    const refresh = () =>
      void fetch("/fixture-data")
        .then((r) => r.json())
        .then(setData);
    refresh();
    window.addEventListener("fixture-refresh", refresh);
    return () => window.removeEventListener("fixture-refresh", refresh);
  }, []);
  if (!data) return null;
  return (
    <ThemeProvider>
      <DashboardShell
        orgName="Antuario"
        orgId={1}
        logoSignedUrl={null}
        userName="Eder"
        avatarUrl={null}
        capabilities={data.capabilities}
      >
        <OperationsClient view="overview" data={data} />
        <small
          style={{
            position: "fixed",
            right: 16,
            bottom: 8,
            fontSize: 10,
            zIndex: 100,
            background: "var(--card)",
            color: "var(--text-2)",
            padding: "4px 9px",
            borderRadius: 8,
            boxShadow: "0 3px 12px #0001",
          }}
        >
          Prueba local · datos de ejemplo
        </small>
      </DashboardShell>
    </ThemeProvider>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
