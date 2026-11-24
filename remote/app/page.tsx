import { headers } from "next/headers";
import { CopyButton } from "./copy-button";
import { Hands } from "./hands";

const ICONS = {
  leaf: "M3 15c0-7 5-12 14-12-1 9-6 14-13 13l-1 2-2-1z",
  hex: "M10 1l8 4.5v9L10 19l-8-4.5v-9zM10 6l-4 2.3v4.4L10 15l4-2.3V8.3z",
  wave: "M1 5q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0zm0 7q4.5-3 9 0t9 0v3q-4.5 3-9 0t-9 0z",
  rings: "M10 1a9 9 0 110 18 9 9 0 010-18zm0 3a6 6 0 100 12 6 6 0 000-12zm0 3a3 3 0 110 6 3 3 0 010-6z",
  peaks: "M1 17L7 6l3 5 3-7 6 13z",
  layers: "M10 1l9 4-9 4-9-4zm-9 8l9 4 9-4v3l-9 4-9-4zm0 5l9 4 9-4v2l-9 4-9-4z",
};

/** What the check looks at (shown in the logo row of the hero). */
const CHECKS: [keyof typeof ICONS, string][] = [
  ["hex", "402の中身"],
  ["leaf", "settle の前の検証"],
  ["wave", "再送と記録"],
  ["layers", "キャッシュ"],
  ["rings", "facilitator の結果"],
  ["peaks", "SDK のアドバイザリ"],
];

const TOOLS: [string, string][] = [
  ["x402_security_check", "点検の手順（11項目・重大度・報告の形）を返す"],
  ["read_repository", "公開リポジトリから x402 の処理と設定のファイルを読む"],
  ["inspect_402", "本番の URL を支払いなしで叩き、402 の中身と EIP-712 のドメインを確かめる"],
  ["check_sdk_advisories", "lockfile の x402 SDK の版を公開アドバイザリと照らす"],
  ["get_facilitator_signers", "facilitator が公開している署名者を取る"],
  ["lookup_probe", "Seller Probe の購入記録を引く"],
  ["list_issues", "x402 の課題25件と11項目の対応を返す"],
];

function Mark() {
  return (
    <svg width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
      <path d="M8 0l8 3v6c0 4.4-3.4 8-8 9-4.6-1-8-4.6-8-9V3zm-1.2 11.6L12 6.4l-1.4-1.4-3.8 3.8L5 7l-1.4 1.4z" fill="currentColor" />
    </svg>
  );
}

export default async function Home() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const mcpUrl = `${proto}://${host}/api/mcp`;

  return (
    <>
      <section className="hero">
        <Hands />
        <nav className="top">
          <a className="brand" href="#">
            <Mark />
            x402 Security Check
          </a>
          <a className="link" href="#usage">使い方</a>
          <a className="link" href="#connect">つなぎ方</a>
          <a className="link" href="#tools">ツール</a>
          <a className="link" href="#scope">点検の範囲</a>
          <a className="pill" href="https://github.com/kato9292929/x402-security-check">GitHub</a>
        </nav>
        <div className="hero-copy">
          <h1>
            <span className="l1">x402 の決済を、</span>
            <span className="l2">コードで点検する。</span>
          </h1>
          <p>コネクタを1つ足して、リポジトリの URL を渡すだけ。支払いも、鍵も、ログインも要りません。</p>
          <div className="cta">
            <CopyButton text={mcpUrl} label="接続URLをコピー" className="" />
          </div>
        </div>
        <div className="logos">
          {CHECKS.map(([icon, label]) => (
            <span key={label}>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d={ICONS[icon]} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      </section>

      <main className="docs">
        <section id="usage">
          <h2>
            <span className="k">使い方 — </span>頼むだけ
          </h2>
          <p>コネクタを入れたチャットで、点検したいリポジトリの URL を渡します。</p>
          <div className="ask mono">https://github.com/&lt;持ち主&gt;/&lt;リポジトリ&gt; を点検して</div>
          <p>Claude が点検の手順を読み込み、x402 に関わるファイル（有料のAPIのルート、x402 の設定、ホスティングの設定、lockfile）を読んで、11項目で点検します。</p>
          <p className="note">非公開のリポジトリは、チャットの「＋」→「Add from GitHub」でファイルを選んでから「x402の点検して」と頼みます。渡るのは選んだファイルの中身だけなので、選んだファイルの全体を点検します。</p>
        </section>

        <section id="connect">
          <h2>
            <span className="k">つなぎ方 — </span>URL を1つ
          </h2>
          <div className="urlrow">
            <span className="urlbox mono">{mcpUrl}</span>
            <CopyButton text={mcpUrl} />
          </div>
          <ol style={{ marginTop: 18 }}>
            <li>claude.ai の「Customize &gt; Connectors」→「Add custom connector」で、名前と上の URL を入れて「続ける」。</li>
            <li>認証は「No sign-in」を選んで追加します。</li>
            <li>チャットの「＋」で、このコネクタがオンになっていることを確かめます。</li>
          </ol>
          <p className="note">Free はカスタムコネクタが1つまでです。Team・Enterprise は、組織の Owner が設定から追加し、メンバーはそれに接続します。</p>
          <p className="note">
            スキルとしても入れておきたいときは、
            <a href="/x402-security-check.zip" download>
              スキルの ZIP
            </a>
            を「Customize &gt; Skills」→「＋」→「Create skill」→「Upload a skill」でアップロードします（設定の「Code execution and file creation」をオン）。普段は要りません。
          </p>
        </section>

        <section id="tools">
          <h2>
            <span className="k">ツール — </span>すべて読むだけ
          </h2>
          <div className="tools">
            {TOOLS.map(([name, desc]) => (
              <div className="tool" key={name}>
                <b>{name}</b>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <p className="note">どのツールも支払い・署名をせず、鍵を持ちません。外の URL は https だけで、内部のアドレスには接続しません。</p>
        </section>

        <section id="scope">
          <h2>
            <span className="k">点検の範囲 — </span>11項目
          </h2>
          <p>
            seller の API サーバー側のコード（HTTP ハンドラ、x402 のミドルウェアの設定、CDN・ホスティングの設定、依存関係）を、入力の検証、402 の中身、決済の順序、再送、支払いと対象の一致、キャッシュ、有効期限、facilitator の結果、決済の応答ヘッダ、SDK のバージョン、秘密情報の11項目で見ます。
          </p>
          <p className="note">網羅的な監査ではありません。指摘が無くても脆弱性が無いとは限りません。トークンのコントラクト、buyer 側のコード、渡されていない本番の設定は見ていません。</p>
        </section>
      </main>
      <footer>x402 Inc.</footer>
    </>
  );
}
