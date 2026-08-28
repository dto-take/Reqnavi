// Server Actionでのバリデーション等、意図的にユーザー向けの文言をthrowする場合に使う。
// error.tsx（グローバルエラー境界）はerror.nameを見て、想定内のエラーのみメッセージを
// そのまま表示し、それ以外（生のPostgrestエラー等）は汎用文言にフォールバックする。
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}
