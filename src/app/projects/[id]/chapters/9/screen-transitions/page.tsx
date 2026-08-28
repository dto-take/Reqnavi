import Link from "next/link";
import { listScreenNodes, listScreenEdges, addScreenNode, addScreenTransition, deleteScreenNode } from "@/actions/screen-transition";
import { ScreenTransitionDiagram } from "@/components/domain/screen-transition/ScreenTransitionDiagram";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmDeleteButton } from "@/components/ui/confirm-delete-button";
import { PageHeader } from "@/components/ui/page-header";

export default async function ScreenTransitionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [nodes, edges] = await Promise.all([listScreenNodes(id), listScreenEdges(id)]);
  const addNode = addScreenNode.bind(null, id);
  const addTransition = addScreenTransition.bind(null, id);

  return (
    <Card className="max-w-3xl mx-auto mt-10">
      <Link href={`/projects/${id}/chapters/9`} className="text-xs text-secondary underline mb-3 inline-block">
        ← 9. 機能要件に戻る
      </Link>
      <PageHeader title="画面遷移図" />

      <div className="overflow-x-auto mb-6">
        <ScreenTransitionDiagram nodes={nodes} edges={edges} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <form action={addNode} className="flex gap-2">
          <Input name="label" placeholder="画面名" required className="flex-1" />
          <Button type="submit" variant="primary" size="md">+ 画面追加</Button>
        </form>

        <form action={addTransition} className="flex gap-2 items-center">
          <Select name="from_node" required className="flex-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </Select>
          <span className="text-xs text-secondary">→</span>
          <Select name="to_node" required className="flex-1">
            {nodes.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
          </Select>
          <Input name="label" placeholder="遷移条件" className="w-24" />
          <Button type="submit" variant="secondary" size="md">追加</Button>
        </form>
      </div>

      <div className="mt-4 flex flex-col gap-1">
        {nodes.map((n) => (
          <div key={n.id} className="flex justify-between items-center text-sm py-1">
            <span>{n.label}</span>
            <form action={deleteScreenNode.bind(null, n.id, id)}>
              <ConfirmDeleteButton />
            </form>
          </div>
        ))}
      </div>
    </Card>
  );
}
