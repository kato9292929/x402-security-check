# x402 Security Check

Checks the code of an x402 seller's API server — the side that answers 402 and settles per-call payments — on 11 items: the contents of the 402, input checks before settlement, payment order, replays, caching, facilitator results, SDK advisories and more. It finds the problems a smart-contract audit does not: ones where the seller gives data away unpaid, and ones where a buyer pays and gets nothing.

It comes in two forms that share the same code:

- **claude.ai connector** (remote MCP server): `https://securitycheck.x402jp.com/api/mcp`
- **Claude Code plugin**: a skill plus a local MCP server

## Use it on claude.ai

1. In claude.ai, open "Customize > Connectors" → "Add custom connector". Enter a name and `https://securitycheck.x402jp.com/api/mcp`, click "Continue", choose "No sign-in" and add it.
2. In a chat with the connector on, ask:

   ```
   Check https://github.com/<owner>/<repo> for x402 issues
   ```

Claude loads the check procedure from the connector (tool `x402_security_check`), reads the files that matter for x402 (`read_repository`), and reports each finding with severity, file and line. For a private repository, select the files with "+" → "Add from GitHub" instead; only the selected files are shared, so the check covers those files in full.

Free plans allow one custom connector. On Team and Enterprise plans, an Owner adds the connector in the organization settings and members connect to it.

The same URL works without authentication in the Claude Desktop app and in other MCP clients that add remote servers by URL over Streamable HTTP, such as Claude Code (`claude mcp add --transport http x402-security-check https://securitycheck.x402jp.com/api/mcp`), Cursor, VS Code with GitHub Copilot, Codex CLI and ChatGPT.

The site at https://securitycheck.x402jp.com/ has the connector URL and an optional skill ZIP ("Customize > Skills" → "+" → "Create skill" → "Upload a skill", with "Code execution and file creation" on). The skill is not needed when the connector is on.

## Use it in Claude Code

```bash
claude plugin marketplace add kato9292929/x402-wallet-mcp
```

```bash
claude plugin install x402-security-check@x402inc
```

The marketplace `x402inc` is shared with AgentPay402 MCP. Start a new session, then run `/x402-security-check` or ask for an x402 security check. By default it checks `git diff main...HEAD`; say "full" (全体) to check the whole repository. Node.js 20+ and npm must be on your PATH.

The skill works without the MCP tools: it then judges from the code and settings alone. With the tools, it adds evidence.

## Tools

All tools are read-only. None of them pays, signs, or receives or holds private keys or wallet credentials.

| Tool | Input | Returns | Item |
| - | - | - | - |
| `x402_security_check` (connector) | — | The check procedure: scope, the 11 items, severity levels, report format | all |
| `read_repository` (connector) | public GitHub URL, optional `paths` | x402 source files and hosting / framework configuration with line numbers (up to 35,000 characters), files the x402 code imports, lockfile names; with `paths`, those files | all |
| `check_sdk_advisories` | plugin: repository path; connector: lockfile contents or a public GitHub URL | x402 SDK versions found in lockfiles (npm, pnpm, yarn, pip, poetry, uv, Pipfile, go.sum) and the ones older than the fixed version in `data/advisories.json`, with file, line and text | 10 |
| `inspect_402` | URL, method (GET/HEAD/POST), optional body, optional listed price | The status without any payment header and the decoded `PAYMENT-REQUIRED` (v2 header or v1 body). Per `accepts` entry: amount in token units, network/asset match, the token's EIP-712 name/version (and `DOMAIN_SEPARATOR` when present) read over a public RPC and compared with `extra`, and whether an input definition is published. Other statuses are returned as they are | 2 |
| `get_facilitator_signers` | facilitator URL | The signers `/supported` publishes (`eip155:*`, `solana:*`, ...), Solana fee payers, supported kinds | 8 |
| `lookup_probe` | host or URL | [Seller Probe](https://probe.x402jp.com)'s public purchase records for the host (request, status, tx, on-chain check, outcome) and which item each outcome is evidence for | 1, 3, 9 |
| `list_issues` | — | `data/issues.json`: the 25 issues (B1–B7, S1–S9, F1–F4, K1–K3, C1–C2) and the items they map to | all |

Network access: one request to the URL you pass (redirects are not followed; no `PAYMENT-SIGNATURE`, `X-PAYMENT`, `Authorization` or cookies), `eth_call` to public RPCs (`server/src/chains.ts`, overridable with `X402SC_RPC_URL_<chain id>`), `<facilitator>/supported`, Seller Probe's `/data/curated.json`, and GitHub (`api.github.com` tree listing, `raw.githubusercontent.com`). The connector accepts https only and refuses loopback, private, link-local (cloud metadata) and other reserved addresses after resolving the host, connecting to the address it checked (`server/src/net-guard.ts`). Calls to the connector are rate limited with a Vercel Firewall rule (ID `x402-security-check-mcp`, condition `@vercel/firewall`); without the rule there is no limit.

### Example: `inspect_402` on a public testnet seller

Run on 2026-11-20 against a public Base Sepolia demo seller, over MCP stdio, without any payment header. The raw `PAYMENT-REQUIRED` and the long description are omitted.

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
    "raw": "(decoded PAYMENT-REQUIRED, omitted)"
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

`extra.name` / `extra.version` (`USDC` / `2`) match the values read from the Base Sepolia USDC contract via `sepolia.base.org`, and `DOMAIN_SEPARATOR()` matches the recomputed value. The amount `1000` is 0.001 USDC, equal to the listed price. The only finding is the testnet notice.

## Data

- `data/advisories.json`: published x402 SDK advisories and their fixed versions, edited by hand. It starts with [GHSA-qr2g-p6q7-w82m](https://github.com/advisories/GHSA-qr2g-p6q7-w82m) (Solana payment verification; fixed in npm `@x402/svm` 2.6.0, PyPI `x402` 2.3.0, Go `github.com/coinbase/x402/go` 2.5.0).
  - `npm run update-advisories` (`-- --dry-run` to not write) reads x402 advisories from the GitHub Advisory Database's public API (no key, one request per ecosystem) and adds only IDs not yet in the file. Review the added entries before committing.
  - The Advisories workflow (`.github/workflows/advisories.yml`) runs the same check in dry-run mode every Monday (02:17 UTC) and opens one issue per new advisory ID. It never edits the file.
- `data/issues.json`: the 25 issues from [x402 per-call APIの実装上の脆弱性 サマリー](https://note.com/x402inc/n/nb2221395494a) and the skill items they map to. Buyer-side and market-wide issues (B1–B5, B7, S3, S4, F4, C1, C2) are outside a seller code check and map to no item.

## Scope

The check covers the seller's API server code: HTTP handlers, x402 middleware settings, CDN and hosting settings, and dependencies. It is limited to 11 items and is not a full security audit; no findings does not mean no vulnerabilities. Token contracts, buyer-side code and production settings that are not in the repository are not covered.

## How it fits with other x402 Inc. products

1. **Before the seller ships**: x402 Security Check checks the code.
2. **After it ships**: [Seller Probe](https://probe.x402jp.com) buys from it and publishes whether the data arrived, matched its description, and whether the transfer is on chain. `lookup_probe` uses these records.
3. **Before a buyer pays**: [AgentPay402 MCP](https://github.com/kato9292929/x402-wallet-mcp) looks up Seller Probe and stops payments to sellers that did not deliver.

## Repository layout

```
.claude-plugin/plugin.json        Claude Code plugin
.mcp.json                         starts server/dist/index.js (stdio) from the plugin
skills/x402-security-check/       the skill (SKILL.md)
server/src                        MCP server and tools (TypeScript); server/dist is the committed build
remote/                           claude.ai connector: Next.js app with mcp-handler at /api/mcp, and the site
data/                             advisories.json, issues.json
tests/                            tests with local mocks (402 seller, JSON-RPC, facilitator, Seller Probe, TLS server)
```

`remote/` runs the same tool code as the plugin: its build copies `server/dist`, `data` and the skill, and rebuilds the skill ZIP (with `x402-security-check/` at the top). On Vercel the project's Root Directory is `remote`, with "Include files outside the root directory in the Build Step" on.

## Development

```bash
npm ci
```

```bash
cd remote && npm ci
```

```bash
npm run verify
```

`npm run verify` runs the type check, checks that `server/dist` is the build of `server/src`, runs the tests, checks that versions agree, runs `claude plugin validate .`, tests and builds `remote/`, and lists changed paths from `risk-paths`. CI runs the same checks. Tests do not use the network.

Releases: set the same version in `package.json`, `server.json` (two places), `.claude-plugin/plugin.json`, `plugin.json`, the pin in `mcp.json` and `server/src/version.ts`, and merge to main. Pushing to main does not publish; the Publish workflow publishes only when run by hand from the Actions tab.

## License

MIT
