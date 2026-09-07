import { AppHeader } from "@/components/layout/app-header";
import { HelpPanel } from "@/components/domain/help-panel";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
      <HelpPanel />
    </div>
  );
}
