# 実装計画: Next.js の更新（2026-10-22）

`[x]` は完了、`[ ]` は残り。

- [x] 1. `next` を 16.4.2 に更新する
  - `package.json` の差分は 1 行。
  - _Requirements: 1_
- [x] 2. 範囲内で直せる依存を更新する
  - 版の一覧は `design.md`。
  - _Requirements: 2_
- [x] 3. 既知の脆弱性を照合し直す
  - OSV.dev で `package-lock.json` を照合: 本番側（実行時）の指摘は 0 件。残りは開発用ツールの 5 パッケージのみ。
  - _Requirements: 2_
- [x] 4. 更新前と更新後を同じ手順で検証する
  - lint: エラー1・警告2（更新前と同じ。`react-hooks/set-state-in-effect` の既存の1件）
  - 型検査: 成功（更新前後とも）
  - ビルド: 成功（更新前後とも）
  - _Requirements: 3, 4_
- [ ] 5. PR をマージする（本人）
