# x402-security-check — 作業のきまり

x402 の seller のコードを点検するスキル（`skills/x402-security-check/SKILL.md`）と、その根拠を足す読み取り専用の MCP サーバー（`server/`）を1つにまとめた Claude Code プラグイン。配布は AgentPay402 MCP（kato9292929/x402-wallet-mcp）と同じ形にそろえている。

## 1コマンドで確かめる

```bash
npm ci
npm run verify
```

`npm run verify`（`scripts/verify.sh`）が、型検査・`server/dist` が `server/src` のビルドと一致すること・テスト・バージョンの一致・`claude plugin validate .`・risk-paths の一覧をまとめて回す。CI も Stop フックも同じスクリプトを呼ぶ。作業を終える前に必ず通す。

- Stop フック（`.claude/settings.json` → `.claude/hooks/stop-verify.sh`）が、変更があるときだけ `npm run verify` を回す。失敗するとターンを終えられない。前回通ったときから何も変わっていなければ飛ばす。
- `server/dist` はコミットする（プラグインは `node ${CLAUDE_PLUGIN_ROOT}/server/dist/index.js` で起動し、ビルドしない）。`server/src` を変えたら `npm run build` して一緒にコミットする。

## 変えてはいけないこと

- **ツールはすべて読むだけ。** 支払い・署名をしない。秘密鍵・ウォレットの認証情報を受け取らず、持たない。外への通信は、引数で渡された URL への GET（`inspect_402` は GET・HEAD・POST）と、公開 RPC（`eth_call`）・公開 API の読み取りだけ。支払いヘッダ（`PAYMENT-SIGNATURE`・`X-PAYMENT`）、`Authorization`、Cookie は送らない（`server/src/http.ts` が拒む）。リダイレクトは追わない。
- **スキルは MCP が無くても最後まで動く。** SKILL.md の手順を MCP のツールに依存させない。ツールは根拠を足すだけ。
- **SKILL.md の本文は持ち主の仕様。** 文言を変えるときは、変更を提案して人の了承を得てから。
- **`inspect_402` は 402 以外の応答も判断せずにそのまま返す。** 判断はスキルがする。
- `data/advisories.json` は手で更新する。`npm run update-advisories` は新しい ID を足すだけで、既存の項目は書き換えない。足された項目は summary・issue・item を見直してからコミットする。毎週の確認は `.github/workflows/advisories.yml` が行い、新しい ID ごとに issue を開く（ファイルは書き換えない）。

## risk-paths

`risk-paths` に書いたパス（配布物の定義、通信と RPC、ツール一覧、アドバイザリのデータ、SKILL.md、CI、このハーネス自体）を変えたときは、人がレビューしてからマージする。`npm run verify` の最後と、PR の CI のジョブサマリーに一覧が出る。報告や PR の説明に、変えた risk path を書く。

## リリース

`package.json`・`server.json`（2か所）・`.claude-plugin/plugin.json`・`plugin.json`・`mcp.json` の `x402-security-check-mcp@<version>`・`server/src/version.ts` の版をそろえて main にマージする。Publish ワークフローが npm（Trusted publishing、トークン不要）と MCP Registry に公開し、`v<version>` のタグを付ける。版がずれていると `scripts/check-versions.mjs` で CI が落ちる。

## 構成

- `server/src/tools/` … 1ツール1ファイル（`advisories.ts`・`inspect402.ts`・`facilitator.ts`・`probe.ts`・`issues.ts`）
- `server/src/chains.ts` … ネットワークとトークン（USDC・JPYC）の表。EIP-712 のドメインは表ではなくチェーンから読む
- `data/issues.json` … 25件の課題と11項目の対応。`tests/issues.test.ts` が SKILL.md の課題 ID と突き合わせる
- `tests/` … ネットワークに出ないテスト。外部はすべて `tests/helpers.ts` のローカルのモック（HTTP・JSON-RPC）
