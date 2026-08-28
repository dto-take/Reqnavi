import { AppHeader } from "@/components/layout/app-header";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader />
      <div className="flex-1">{children}</div>
    </div>
  );
}
