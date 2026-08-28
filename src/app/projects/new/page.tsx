import { createProject, listOrganizations } from "@/actions/projects";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

type Organization = { id: string; name: string };

const CHAPTERS = [
  { no: 1, label: "お客様概要" }, { no: 2, label: "プロジェクトの目的" },
  { no: 3, label: "ロードマップ" }, { no: 4, label: "KPI" },
  { no: 5, label: "システム要件" }, { no: 6, label: "開発スコープ" },
  { no: 7, label: "ビジネス要件" }, { no: 8, label: "業務要件" },
  { no: 9, label: "機能要件" }, { no: 10, label: "非機能要件" },
  { no: 11, label: "データ移行要件" }, { no: 12, label: "トレーニング要件" },
  { no: 13, label: "システム運用要件" }, { no: 14, label: "システム定着化支援要件" },
  { no: 15, label: "進捗" },
];

export default async function NewProjectPage() {
  const organizations = (await listOrganizations()) as Organization[] | null;

  return (
    <Card className="max-w-md mx-auto mt-10">
      <PageHeader title="新規案件を作成" />

      <form action={createProject} className="flex flex-col gap-3">
        <div>
          <Label>案件名</Label>
          <Input name="name" required className="w-full" />
        </div>

        <div>
          <Label>顧客組織</Label>
          <Select name="organization_id" required className="w-full">
            {organizations?.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <Label>プラットフォーム知識セット</Label>
          <div className="h-9 border border-border rounded-md bg-hover px-2 text-sm flex items-center">
            Salesforce
          </div>
          <p className="text-[11px] text-faint mt-1">現在はSalesforce固定です</p>
        </div>

        <div>
          <Label>対象章</Label>
          <div className="flex flex-wrap gap-1.5">
            {CHAPTERS.map((c) => (
              <label
                key={c.no}
                className="text-xs px-2 py-1 rounded bg-hover text-primary flex items-center gap-1"
              >
                <input type="checkbox" name="selected_chapters" value={c.no} defaultChecked />
                {c.no}.{c.label}
              </label>
            ))}
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" className="mt-2">
          作成する
        </Button>
      </form>
    </Card>
  );
}
