"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { ButtonHTMLAttributes } from "react";

export function ConfirmDeleteButton({
  confirmMessage = "本当に削除しますか？この操作は取り消せません。",
  children = "削除",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { confirmMessage?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="danger"
      disabled={pending}
      onClick={(e) => {
        if (!confirm(confirmMessage)) e.preventDefault();
      }}
      className={className}
      {...props}
    >
      {pending ? "削除中..." : children}
    </Button>
  );
}
