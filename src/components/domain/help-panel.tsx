"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { HELP_ENTRIES, GENERAL_FAQS } from "@/lib/help-content";

export function HelpPanel() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [overviewOpen, setOverviewOpen] = useState(true);
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);
  const pathname = usePathname();

  // HelpPanelはprojects/layout.tsxに常設されページ遷移をまたいで同一インスタンスが
  // 維持されるため、開閉状態を放置すると次のページでも開いたままになる。
  // ページ遷移のたびに閉じた状態へリセットする（指示書「やってはいけないこと」対応）。
  // レンダー中にstateを更新する、Reactの「propが変わったらstateをリセットする」公式パターン
  // （useEffectでのsetStateはカスケードレンダーを招くためeslintで禁止されている）。
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  const matched = HELP_ENTRIES.find((e) => e.pattern.test(pathname));
  const filteredFaqs = GENERAL_FAQS.filter(
    (f) => !search || f.q.includes(search) || f.a.includes(search)
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-brand text-white flex items-center justify-center shadow-lg z-40 text-xl"
        aria-label="ヘルプ・使い方"
      >
        ?
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-page/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-sm bg-page border-l border-border h-full overflow-y-auto p-5">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-sm font-semibold text-primary">ヘルプ・使い方</h2>
              <button onClick={() => setOpen(false)} className="text-secondary text-lg" aria-label="閉じる">
                ×
              </button>
            </div>

            <input
              placeholder="キーワードで検索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 border border-border rounded-md px-2 text-sm mb-4"
            />

            {matched && (
              <div className="mb-4 border border-border rounded-lg overflow-hidden">
                <button
                  onClick={() => setOverviewOpen(!overviewOpen)}
                  className="w-full flex justify-between items-center px-3 py-2 text-sm font-medium text-primary bg-sidebar"
                >
                  概要
                  <span className="text-xs">{overviewOpen ? "▲" : "▼"}</span>
                </button>
                {overviewOpen && (
                  <div className="px-3 py-3 text-xs text-secondary">
                    <div className="font-medium text-primary mb-1">{matched.entry.title}</div>
                    {matched.entry.overview}
                  </div>
                )}
              </div>
            )}

            <div className="border border-border rounded-lg overflow-hidden">
              <div className="px-3 py-2 text-sm font-medium text-primary bg-sidebar">FAQ</div>
              {filteredFaqs.length === 0 ? (
                <p className="px-3 py-3 text-xs text-faint">該当するFAQが見つかりません</p>
              ) : (
                filteredFaqs.map((faq, i) => (
                  <div key={i} className="border-t border-hover">
                    <button
                      onClick={() => setFaqOpenIndex(faqOpenIndex === i ? null : i)}
                      className="w-full flex justify-between items-center px-3 py-2 text-xs text-left text-primary"
                    >
                      <span>{faq.q}</span>
                      <span className="text-[10px] ml-2 flex-shrink-0">{faqOpenIndex === i ? "▲" : "▼"}</span>
                    </button>
                    {faqOpenIndex === i && (
                      <div className="px-3 pb-3 text-xs text-secondary">{faq.a}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
