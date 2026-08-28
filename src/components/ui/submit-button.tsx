"use client";

import { useFormStatus } from "react-dom";
import { ButtonHTMLAttributes } from "react";
import { Button, type ButtonVariant, type ButtonSize } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export function SubmitButton({
  children,
  pendingText = "処理中...",
  variant = "primary",
  size = "sm",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingText?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} {...props}>
      {pending ? (
        <span className="flex items-center gap-1.5">
          <Spinner /> {pendingText}
        </span>
      ) : (
        children
      )}
    </Button>
  );
}
