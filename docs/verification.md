# 動作の確認（2026-11-20）

## プラグインとして入れた状態

空の設定ディレクトリ（`CLAUDE_CONFIG_DIR`）で、Claude Code 2.1.329 から次を実行した。マーケットプレイスは x402-wallet-mcp の作業ブランチ（`x402-security-check` の項目を足したもの）のチェックアウトを使い、プラグイン本体はその項目の source（GitHub の `kato9292929/x402-security-check`）から取得された。

```bash
claude plugin marketplace add /path/to/x402-wallet-mcp
claude plugin install x402-security-check@x402inc
```

- `claude plugin list`：`x402-security-check@x402inc` Version 0.1.0、enabled。プラグインのキャッシュに `node_modules` が入った（依存は Claude Code がインストール時に入れる）。
- `claude mcp list`：`plugin:x402-security-check:x402-security-check: node …/server/dist/index.js - √ Connected`
- セッションの init（`claude -p … --output-format stream-json --verbose`）：
  - tools：`mcp__plugin_x402-security-check_x402-security-check__` + `check_sdk_advisories`・`get_facilitator_signers`・`inspect_402`・`list_issues`・`lookup_probe`
  - slash_commands / skills：`x402-security-check:x402-security-check`（`/x402-security-check` で呼べる）

## MCP のツールを使わない点検

上の環境で、5つの MCP ツールを `--disallowedTools` で外し（init の tools に x402 のツールが無いことを確認）、意図的に誤りを入れた小さな seller（@x402/express、入力の検証なし、該当なし・上流の失敗を 200 で返す、`@x402/svm` 2.5.0、API キーをログに出す）に対して `/x402-security-check:x402-security-check 全体` を実行した。

スキルは15ターンで最後まで進み、SKILL.md の出力の形で報告した。

- 件数：High 2 / Low 6 / 要確認 2
- High：項目1（S1）不正な入力・該当なしを 200 で返して settle される、項目3（K1）上流の失敗を 200 で返して settle される。修正案（入力の検証を middleware の前に置き 400、該当なし 404、上流の失敗 502）とテストを作り、コミットはしなかった
- Low：項目10（`package-lock.json:8` の `@x402/svm` 2.5.0 < 2.6.0）、項目11（`PRICE_API_KEY` のログ出力）、項目2・6・8 ほか
- 「実際に動かしたこと／読んだだけのこと」を分けて書き、MCP のツールが使えなかったのでコードと設定だけで判定したと明記した

同じ seller に `check_sdk_advisories` を当てると、`GHSA-qr2g-p6q7-w82m` `@x402/svm` 2.5.0（修正版 2.6.0）`package-lock.json:8` を返し、スキルがコードを読んで出した根拠と一致した。

## testnet の公開エンドポイント

`inspect_402` を Base Sepolia の公開デモ seller に当てた結果は README の「実行例」にある。`extra.name`・`extra.version` は `sepolia.base.org` で読んだ USDC の値と一致し、`DOMAIN_SEPARATOR()` も再計算と一致した。

## このコンテナで動かせなかったもの

- `npm run update-advisories`：このコンテナの外向き IP が GitHub の未認証 API の上限に達していて 403 になった。変換と統合の処理は `tests/update-advisories.test.ts` で確かめている。
