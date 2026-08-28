import { LabelHTMLAttributes } from "react";

export function Label({ className = "", ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={`text-xs text-secondary block mb-1 ${className}`} {...props} />;
}
