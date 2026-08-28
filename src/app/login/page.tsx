import { signInWithPassword, signInWithGoogle } from "@/actions/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo-mark";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-sidebar">
      <Card className="w-[360px]">
        <div className="flex items-center gap-2 mb-1">
          <LogoMark className="w-7 h-7 shrink-0" />
          <h1 className="text-xl font-semibold text-primary">ReqNavi</h1>
        </div>
        <p className="text-sm text-secondary mb-5">要件定義を、迷わず前へ</p>

        <form action={signInWithPassword} className="flex flex-col gap-3">
          <div>
            <Label>メールアドレス</Label>
            <Input name="email" type="email" required className="w-full" />
          </div>
          <div>
            <Label>パスワード</Label>
            <Input name="password" type="password" required className="w-full" />
          </div>
          <Button type="submit" variant="primary" size="md" className="w-full mt-1">
            サインイン
          </Button>
        </form>

        <form action={signInWithGoogle} className="mt-2">
          <Button type="submit" variant="secondary" size="md" className="w-full">
            Googleで続ける
          </Button>
        </form>
      </Card>
    </div>
  );
}
