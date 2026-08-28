import { HTMLAttributes } from "react";

type CardTone = "default" | "highlight";

// bg-page/border-borderの上にbg-hover/border-brand等を後付けのclassNameで重ねようとすると、
// Tailwindの生成CSSは同じプロパティ（background-color等）を持つクラスをソース内の出現順で
// 出力するため、クラス属性の並び順どおりに上書きされるとは限らない（実機確認済み：
// bg-hoverをclassNameで足してもbg-pageの定義がCSS上後に来るため反映されなかった）。
// 「注意を引くカード」のような複数プロパティの見た目セットは、後付けの部分上書きに頼らず
// variantとして丸ごと切り替える。
const TONE_CLASSES: Record<CardTone, string> = {
  default: "bg-page border-border",
  highlight: "bg-hover border-brand",
};

export function Card({
  tone = "default",
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement> & { tone?: CardTone }) {
  return <div className={`border rounded-lg p-6 ${TONE_CLASSES[tone]} ${className}`} {...props} />;
}
