# x402 Security Check

x402 の per-call 決済を受け付ける API サーバー（seller）のコードを、402 の中身・決済の順序・facilitator の結果・SDK など11項目に絞って点検する Claude Code プラグイン。

```bash
claude plugin marketplace add kato9292929/x402-wallet-mcp
```

```bash
claude plugin install x402-security-check@x402inc
```

マーケットプレイス `x402inc` は AgentPay402 MCP（[kato9292929/x402-wallet-mcp](https://github.com/kato9292929/x402-wallet-mcp)）と共通。Claude Code の中では `/plugin marketplace add kato9292929/x402-wallet-mcp` と `/plugin install x402-security-check@x402inc` でも同じ。インストール後、新しいセッションを始める。Node.js 20 以上と npm が PATH にあること（Claude Code がインストール時に `package-lock.json` から依存を入れる）。設定項目や API キーはない。

更新：`claude plugin marketplace update x402inc`。インストールせずに試す：`claude --plugin-dir /path/to/x402-security-check`。

## claude.ai だけで使う（リモート版）

ターミナルを使わず、claude.ai（ウェブ）だけで点検できる版。`remote/` を Vercel に置いて動かす。

1. 「Customize > Connectors」→「Add custom connector」に接続URL（`https://<ドメイン>/api/mcp`）を貼り、認証で「No sign-in」を選んで追加する。Free はカスタムコネクタが1つまで。Team・Enterprise は Owner が組織の設定から追加する。
2. コネクタを入れたチャットで頼めば、Claude がツール `x402_security_check` から点検の手順を読み込む。スキルの ZIP（入口のページ `https://<ドメイン>/`）は任意で、入れるときは「Customize > Skills」→「＋」→「Create skill」→「Upload a skill」。設定の「Code execution and file creation」をオンにする。
3. 「＋」→「Add from GitHub」で点検したいファイル（有料のAPIのルート、x402 の設定、ホスティングの設定、lockfile）を選び、「x402の点検して」と頼む。渡るのは選んだファイルの中身だけなので、差分ではなく選んだファイルの全体を点検する。

リモート版のツールは Claude Code 版と同じコード（`server/src`）で動く。違いは2つ。

- `check_sdk_advisories` は、手元のパスの代わりに、lockfile の中身とファイル名か、公開リポジトリの GitHub の URL を受け取る。URL のときは、GitHub の公開 API でファイルの一覧を取り、`raw.githubusercontent.com` から lockfile を読む。一覧が取れないとき（キー無しの上限など）は、リポジトリの直下の lockfile だけを探す。
- 外部の URL を読むときは https だけを受け付ける。名前解決したあとのアドレスで判定し、localhost・プライベート・リンクローカル（クラウドのメタデータを含む）などには接続しない（`server/src/net-guard.ts`）。リダイレクトは追わず、時間と本文の大きさに上限がある。

点検の手順（SKILL.md の本文）は、ツール `x402_security_check` が返す。同じ本文を MCP の prompt `x402_security_check` としても出している。呼び出し回数は Vercel Firewall のルール（ID `x402-security-check-mcp`、条件 `@vercel/firewall`）で制限する。ルールが無いあいだは制限なしで動く。

置き方：Vercel のプロジェクトの Root Directory を `remote` にする（`remote` の外の `server/dist`・`data`・`skills` をビルドで読むので、「Include files outside the root directory in the Build Step」は有効のまま）。ビルドのたびに、ツールのコード・データ・スキルの ZIP（`x402-security-check/` が一番上）を作り直す。

## 何が入っているか

| 部分 | 役割 |
| - | - |
| スキル `x402-security-check`（`skills/x402-security-check/SKILL.md`） | コードを読んで判断する。11項目の手順、重大度の基準、出力の形を持つ。「セキュリティチェック」「x402 の点検」と頼むか、`/x402-security-check` で呼ぶ。指定がなければ `git diff main...HEAD` を、「全体」と言えばリポジトリ全体を見る |
| MCP サーバー `x402-security-check`（`server/`） | 決まった手順で判定できる確認だけをツールにしたもの。スキルはツールがあれば根拠に足し、無ければコードと設定だけで判定する |

点検の対象は seller の API サーバー側（HTTP ハンドラ、x402 のミドルウェア設定、CDN・ホスティングの設定、依存関係）。トークンのコントラクトと buyer 側のコードは対象外。

> この点検は11項目に絞ったもので、網羅的なセキュリティ監査ではない。指摘が無いことは、脆弱性が無いことを意味しない。コントラクト、buyer 側のコード、リポジトリに無い本番の設定（環境変数・CDN など）は見ていない（見られない）。修正を当てるか、どう直すかは、使う人が判断する。

## x402 Inc. の他の製品との関係

1回の支払いを、売る側・買う側・その間で別々に確かめる。

1. **seller が出す前に**：x402-security-check でコードを点検する（このプラグイン）。
2. **出したあと**：[Seller Probe](https://probe.x402jp.com) が実際に買い、届いたか・説明どおりか・送金がチェーン上にあるかを公開する。`lookup_probe` はこの記録を点検の根拠に使う。
3. **buyer が買う前に**：[AgentPay402 MCP](https://github.com/kato9292929/x402-wallet-mcp) が Seller Probe の記録を引き、届かなかった seller への支払いを止める。

同じマーケットプレイス `x402inc` から入る。

## MCP のツール

すべて読むだけ。支払い・署名はしない。秘密鍵・ウォレットの認証情報は受け取らず、持たない。

| ツール | 入力 | 返すもの | 項目 |
| - | - | - | - |
| `check_sdk_advisories` | リポジトリのパス | lockfile（`package-lock.json`・`pnpm-lock.yaml`・`yarn.lock`・`requirements*.txt`・`poetry.lock`・`uv.lock`・`Pipfile.lock`・`go.sum`）にある x402 SDK の版と、`data/advisories.json` の修正版より古いものの一覧。lockfile のファイル名・行番号・該当行も返す | 10 |
| `inspect_402` | URL、メソッド（GET・HEAD・POST）、本文（任意）、掲載価格（任意） | 支払いヘッダを付けずに叩いたときのステータスと、`PAYMENT-REQUIRED`（v1 は本文）の中身。各 `accepts` について、amount の単位換算、asset のコントラクトから公開 RPC で読んだ EIP-712 ドメイン（name・version、あれば `DOMAIN_SEPARATOR` も再計算して照合）との一致、network と asset の組み合わせ、入力の定義の有無。402 以外（200・401・404 など）はそのまま返す | 2 |
| `get_facilitator_signers` | facilitator の URL | `/supported` が返す署名者の一覧（`eip155:*`・`solana:*` など）、Solana の fee payer、対応する kind | 8 |
| `lookup_probe` | ホスト名（または URL） | [Seller Probe](https://probe.x402jp.com) の公開データ（`/data/curated.json`）のうち、そのホストの購入結果（送ったリクエスト・ステータス・tx・チェーン上の確認・判定）と、その判定がどの項目の根拠になるか | 1・3・9 |
| `list_issues` | なし | `data/issues.json`（25件の課題 ID・内容・段階・誰が損をするか・11項目との対応） | 全体 |

通信するのは次だけ。

- `inspect_402`：引数の URL への1回のリクエスト（リダイレクトは追わない）。`PAYMENT-SIGNATURE`・`X-PAYMENT`・`Authorization`・Cookie は付けない。EVM の asset について、公開 RPC への `eth_call`（`name()`・`version()`・`decimals()`・`eip712Domain()`・`DOMAIN_SEPARATOR()`）。RPC は `server/src/chains.ts` の一覧で、`X402SC_RPC_URL_<chain id>`（例 `X402SC_RPC_URL_8453`）で差し替えられる
- `get_facilitator_signers`：`<facilitator>/supported` への GET
- `lookup_probe`：`https://probe.x402jp.com/data/curated.json` への GET（`X402SC_PROBE_DATA_URL` で差し替え可）
- `check_sdk_advisories`・`list_issues`：通信しない（ローカルのファイルだけ）

### 実行例：testnet の公開エンドポイントに `inspect_402`

2026-11-20、Base Sepolia の公開デモ seller（AgentPay402 MCP の結合テストで使ったもの）に対して、MCP の stdio 経由で実行した結果。支払いヘッダは送っていない。`PAYMENT-REQUIRED` の生の中身と説明文は省略した。

```json
{"name":"inspect_402","arguments":{"url":"https://wallets-demo-seller-server.calebgcarithers.workers.dev/weather?location=Tokyo","listed_price":"0.001"}}
```

```json
{
  "url": "https://wallets-demo-seller-server.calebgcarithers.workers.dev/weather?location=Tokyo",
  "method": "GET",
  "status": 402,
  "headers": {
    "content-type": "application/json",
    "payment-required": "(base64, 2920 chars; decoded in payment_required.raw)"
  },
  "body_head": "{}",
  "body_truncated": false,
  "sent_payment_header": false,
  "is_402": true,
  "payment_required": {
    "source": "header",
    "x402Version": 2,
    "error": "Payment required",
    "resource": {
      "url": "https://wallets-demo-seller-server.calebgcarithers.workers.dev/weather?location=Tokyo",
      "description": "Real-time current weather conditions ..."
    },
    "extensions": [
      "bazaar"
    ],
    "raw": "(PAYMENT-REQUIRED を復号したもの。省略)"
  },
  "accepts": [
    {
      "index": 0,
      "scheme": "exact",
      "network": "eip155:84532",
      "network_caip2": "eip155:84532",
      "network_name": "Base Sepolia",
      "testnet": true,
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "asset_check": {
        "known": true,
        "symbol": "USDC",
        "decimals": 6
      },
      "amount": "1000",
      "amount_human": "0.001",
      "unit": "USDC",
      "payTo": "0xCBd4E4218B2Cd8300f1bd07b9B4B720fAb6B51B3",
      "maxTimeoutSeconds": 300,
      "extra": {
        "name": "USDC",
        "version": "2"
      },
      "eip712": {
        "declared": {
          "name": "USDC",
          "version": "2"
        },
        "onchain": {
          "name": "USDC",
          "version": "2",
          "version_source": "name/version",
          "decimals": 6,
          "domain_separator": "0x71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818",
          "read_with": "name/version",
          "rpc": "sepolia.base.org"
        },
        "match": {
          "name": true,
          "version": true,
          "domain_separator": true
        }
      }
    }
  ],
  "input_definition": {
    "present": true,
    "where": [
      "extensions.bazaar.info.input",
      "extensions.bazaar.schema"
    ],
    "input": {
      "type": "http",
      "queryParams": {
        "location": "San Francisco"
      },
      "method": "GET"
    }
  },
  "findings": [
    {
      "level": "info",
      "item": 2,
      "code": "testnet",
      "message": "network is a testnet (Base Sepolia). Fine for staging; production should use a mainnet.",
      "accepts_index": 0
    }
  ]
}
```

`extra.name`・`extra.version`（`USDC`・`2`）は、Base Sepolia の USDC コントラクトから `sepolia.base.org` で読んだ値と一致し、`DOMAIN_SEPARATOR()` も再計算と一致した。amount `1000` は 0.001 USDC で、掲載価格 0.001 と一致。指摘は testnet であることの info だけ。

## MCP が無いとき

スキルだけで点検は最後まで動く。SKILL.md の手順はコードと設定を読んで判定する形で書かれていて、ツールは「使えるときは根拠に足す」扱い。例えば項目10はツールが無ければ lockfile を直接読み、項目2は 402 を返すコードと設定を読む。

## データ

- `data/advisories.json`：x402 SDK の公開アドバイザリと修正版。手で更新する。最初は [GHSA-qr2g-p6q7-w82m](https://github.com/advisories/GHSA-qr2g-p6q7-w82m)（Solana 支払いの検証の欠陥。修正版：npm `@x402/svm` 2.6.0、PyPI `x402` 2.3.0、Go `github.com/coinbase/x402/go` 2.5.0）。
  - `npm run update-advisories`（`-- --dry-run` で書き込まない）が GitHub Advisory Database の公開 API（`GET https://api.github.com/advisories?ecosystem=...&affects=...`、キー不要、エコシステムごとに1回）から x402 関連を取り直し、まだ無い ID だけを足す。既存の項目は書き換えない。足された項目の summary・issue・item を見直してからコミットする。キー無しの上限は IP あたり60回/時。
  - GitHub Actions の Advisories ワークフロー（`.github/workflows/advisories.yml`）が、毎週月曜（UTC 02:17）と手動実行のときに同じ取り直しを `--dry-run` で回す。まだファイルに無い ID が見つかると、ID ごとに issue を1つ開き、足される予定の項目を本文に載せる。ファイルは書き換えない。一度 issue を開いた ID は、閉じたあとも開き直さない。API を読めなかったときはジョブが失敗する（「新しいものは無い」と区別するため）。
- `data/issues.json`：[x402 per-call APIの実装上の脆弱性 サマリー](https://note.com/x402inc/n/nb2221395494a) の25件（B1〜B7、S1〜S9、F1〜F4、K1〜K3、C1〜C2）と、スキルの11項目との対応。buyer 側・市場全体の課題（B1〜B5・B7、S3、S4、F4、C1、C2）は seller のコードの点検範囲の外なので、どの項目にも対応させていない。

## Claude Desktop・他の MCP クライアント

MCP サーバーは手元で動く stdio のサーバーなので、リポジトリを手元に置けば、Claude Desktop など他のクライアントの設定ファイルに書いてつなげる（スキルは Claude Code 用）。

```json
{
  "mcpServers": {
    "x402-security-check": {
      "command": "node",
      "args": ["/path/to/x402-security-check/server/dist/index.js"]
    }
  }
}
```

先に、リポジトリで `npm ci` を実行して依存を入れておく。

npm（`x402-security-check-mcp`）と MCP Registry（`io.github.kato9292929/x402-security-check-mcp`）には、まだ公開していない。公開したら `npx -y x402-security-check-mcp` で、リポジトリを置かずに起動できるようになる。リポジトリのルートにある [Agent Plugins 1.0](https://agent-plugins.org/specification) の `plugin.json`・`mcp.json` も、この npm のパッケージを `npx -y x402-security-check-mcp@<version>` で起動する形なので、公開までは動かない。

## 開発

```bash
npm ci
```

```bash
npm run verify
```

`npm run verify` が型検査・`server/dist` の一致・テスト・版の一致・`claude plugin validate`・リモート版（`remote/` のテスト・型検査・ビルド。`cd remote && npm ci` 済みのとき）・risk-paths の一覧をまとめて回す（CI も同じ）。テストはネットワークに出ず、402 を返す seller・JSON-RPC・facilitator・Seller Probe はローカルのモックで確かめる。作業のきまりは [CLAUDE.md](CLAUDE.md)。

リリース：`package.json`・`server.json`（2か所）・`.claude-plugin/plugin.json`・`plugin.json`・`mcp.json` の版・`server/src/version.ts` をそろえて main にマージする。main への push では公開しない。Actions の Publish ワークフローを手で実行したときだけ公開し、`v<version>` のタグを付ける。

## ライセンス

MIT
