import { updatePassword } from "@/actions/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar">
      <Card className="w-[360px]">
        <h1 className="text-xl font-semibold text-primary mb-1">パスワードの変更</h1>
        <p className="text-sm text-secondary mb-5">初回ログインのため、新しいパスワードを設定してください</p>

        <form action={updatePassword} className="flex flex-col gap-3">
          <div>
            <Label>新しいパスワード</Label>
            <Input name="password" type="password" required minLength={8} className="w-full" />
          </div>
          <Button type="submit" variant="primary" size="md" className="mt-1">
            変更する
          </Button>
        </form>
      </Card>
    </div>
  );
}
