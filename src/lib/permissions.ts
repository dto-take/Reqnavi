// ロールによる操作可否（UIの出し分けと、サーバー側の拒否で同じ条件を使う）。
// 根拠はRLS：projects_insert（admin・pm）、project_members_insert（admin・pm かつ案件のメンバー）。
// 顧客（organizations）の作成・編集は画面上はadmin専用（/organizationsはadmin以外を案件一覧へ戻す）。

export function canCreateProject(role: string | undefined): boolean {
  return role === "admin" || role === "pm";
}

export function canAddProjectMember(role: string | undefined, isMember: boolean): boolean {
  return isMember && (role === "admin" || role === "pm");
}

// ロールにとって非公開の章（requirement_itemsのRLS：reqnavi_select/insert/update/delete）。
// partnerは7章（ビジネス要件）を読み書きできない。表示・集計はこの章を除き、「非公開」と明示する。
const HIDDEN_CHAPTERS_BY_ROLE: Record<string, number[]> = { partner: [7] };

export function hiddenChaptersFor(role: string | undefined): number[] {
  return role ? (HIDDEN_CHAPTERS_BY_ROLE[role] ?? []) : [];
}
