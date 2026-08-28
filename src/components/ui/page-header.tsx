import { ReactNode } from "react";

export function PageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-base font-semibold text-primary">{title}</h1>
      {action}
    </div>
  );
}
