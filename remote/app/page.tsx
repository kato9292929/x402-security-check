import { headers } from "next/headers";
import { CopyButton } from "./copy-button";

const css = `
:root { --bg:#ffffff; --fg:#1a1a1a; --muted:#5c5c5c; --line:#e2e2e2; --code:#f4f4f2; --accent:#1f5fbf; }
@media (prefers-color-scheme: dark) { :root { --bg:#141414; --fg:#ececec; --muted:#a3a3a3; --line:#2e2e2e; --code:#1f1f1f; --accent:#7aa7ef; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.7 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 1.6rem; margin: 0 0 4px; }
h2 { font-size: 1.15rem; margin: 36px 0 8px; padding-top: 8px; border-top: 1px solid var(--line); }
p.lead { color: var(--muted); margin-top: 0; }
.url { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
code, .urlbox { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92rem; }
.urlbox { background:var(--code); border:1px solid var(--line); border-radius:6px; padding:8px 10px; flex:1 1 280px; overflow-wrap:anywhere; }
code { background:var(--code); padding:1px 5px; border-radius:4px; }
button.copy, a.button { font: inherit; border:1px solid var(--accent); color:var(--accent); background:transparent; border-radius:6px; padding:6px 14px; cursor:pointer; text-decoration:none; display:inline-block; }
ol, ul { padding-left: 1.4em; }
li { margin: 4px 0; }
.note { color: var(--muted); font-size: .92rem; }
`;

export default async function Home() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/api/mcp`;

  return (
    <main>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <h1>x402 Security Check</h1>
      <p className="lead">
        x402 の per-call 決済を受け付ける API サーバー（seller）のコードを、claude.ai から11項目で点検します。支払いはせず、鍵もログインも要りません。
      </p>

      <h2>接続URL</h2>
      <div className="url">
        <span className="urlbox">{mcpUrl}</span>
        <CopyButton text={mcpUrl} />
      </div>

      <h2>スキルのZIP</h2>
      <p>
        <a className="button" href="/x402-security-check.zip" download>
          x402-security-check.zip をダウンロード
        </a>
      </p>
      <p className="note">普段は要りません。スキルとしても入れておきたいときに使います。</p>

      <h2>claude.ai での入れ方</h2>
      <ol>
        <li>
          <strong>コネクタを追加する</strong>：「Customize &gt; Connectors」→「Add custom connector」で上の接続URLを貼り、認証で「No sign-in」を選んで「Add」。画面が1つのときと2段階のときがあります。
        </li>
        <li>
          <strong>そのまま頼む</strong>：コネクタを入れたチャットで「x402の点検して」と頼めば、Claude がこのコネクタから点検の手順（ツール <code>x402_security_check</code>）を読み込んで点検します。スキルの ZIP は要りません。
        </li>
        <li>
          <strong>スキルとして入れたいとき（任意）</strong>：上の ZIP を「Customize &gt; Skills」→「＋」→「Create skill」→「Upload a skill」でアップロードします。設定の「Code execution and file creation」（画面によっては「Create and edit files」）をオンにします。
        </li>
      </ol>

      <h2>使い方</h2>
      <ol>
        <li>チャットの「＋」→「Add from GitHub」で、点検したいリポジトリのファイルを選びます。例：
          <ul>
            <li>有料のAPIのルート（<code>app/api/quote/route.ts</code>、<code>src/server.ts</code> など）</li>
            <li>x402 の設定（payTo・価格・network を書いているファイル、<code>middleware.ts</code> など）</li>
            <li>ホスティング・CDN の設定（<code>vercel.json</code>、<code>next.config.ts</code>、<code>wrangler.toml</code> など）</li>
            <li>lockfile（<code>package-lock.json</code>、<code>pnpm-lock.yaml</code>、<code>go.sum</code> など）</li>
          </ul>
        </li>
        <li>「x402の点検して」と頼みます。足りないファイルがあれば、どれを追加すればいいかを Claude が伝えます。</li>
      </ol>
      <p className="note">
        渡せるのは1つのブランチのファイルの中身だけで、差分や履歴は渡りません。そのため claude.ai では、選んだファイルの全体を点検します。会話に収まる量だけ渡せるので、要るファイルを選んでください。
      </p>

      <h2>プランの注意</h2>
      <ul>
        <li>Free：カスタムコネクタは1つまでです。</li>
        <li>Team・Enterprise：組織の Owner が設定からコネクタを追加し、メンバーはそれに接続します。</li>
      </ul>

      <h2>点検の範囲</h2>
      <p className="note">
        11項目に絞った点検で、網羅的な監査ではありません。指摘が無くても脆弱性が無いとは限りません。トークンのコントラクト、buyer 側のコード、渡されていない本番の設定は見ていません。
      </p>
    </main>
  );
}
