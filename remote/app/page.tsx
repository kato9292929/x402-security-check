import { headers } from "next/headers";
import { CopyButton } from "./copy-button";
import { Hands } from "./hands";

/**
 * Official logo files, unmodified: GitHub and GitHub Copilot from brand.github.com (GitHub_Logos.zip),
 * Cursor from cursor.com/brand (cursor-brand-assets.zip), the Solana logomark as supplied.
 * Logos are trademarks of their owners.
 */
const LOGOS: { src: string; alt: string; h: number; dark?: boolean }[] = [
  { src: "/logos/github.svg", alt: "GitHub", h: 19 },
  { src: "/logos/github-copilot.svg", alt: "GitHub Copilot", h: 19 },
  { src: "/logos/cursor.svg", alt: "Cursor", h: 15 },
  { src: "/logos/solana-mark.svg", alt: "Solana", h: 18 },
];

const TOOLS: [string, string][] = [
  ["x402_security_check", "Returns the check procedure: 11 items, severity levels and the report format."],
  ["read_repository", "Reads the x402 code and configuration files of a public GitHub repository."],
  ["inspect_402", "Calls a live URL without paying and checks the 402 and the token's EIP-712 domain."],
  ["check_sdk_advisories", "Matches the x402 SDK versions in lockfiles against published advisories."],
  ["get_facilitator_signers", "Gets the signer addresses a facilitator publishes."],
  ["lookup_probe", "Looks up Seller Probe's real purchase records for a host."],
  ["list_issues", "Lists the 25 known x402 issues and the check items they map to."],
];

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
            x402 Security Check
          </a>
          <a className="link" href="#usage">How it works</a>
          <a className="link" href="#connect">Connect</a>
          <a className="link" href="#tools">Tools</a>
          <a className="link" href="#scope">Scope</a>
          <a className="pill" href="https://github.com/kato9292929/x402-security-check">GitHub</a>
        </nav>
        <div className="hero-copy">
          <h1>
            <span className="l1 grad">Check your x402 payments</span>
            <span className="l2">in your code.</span>
          </h1>
          <p>Add one connector and paste your repository URL.<br />No payment, no keys, no sign-in.</p>
          <div className="cta">
            <CopyButton text={mcpUrl} label="Copy connector URL" done="Copied" className="" />
          </div>
        </div>
        <div className="logos">
          <span className="works">Works with</span>
          {LOGOS.map((l) => (
            // eslint-disable-next-line @next/next/no-img-element
            l.dark ? (
              <span className="chip" key={l.alt}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={l.src} alt={l.alt} style={{ height: l.h, width: "auto" }} />
              </span>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={l.alt} src={l.src} alt={l.alt} style={{ height: l.h, width: "auto" }} />
            )
          ))}
        </div>
      </section>

      <main className="docs">
        <section id="usage">
          <h2>
            <span className="k">How it works — </span>just ask
          </h2>
          <p>In a chat with the connector on, give the repository you want checked:</p>
          <div className="ask mono">Check https://github.com/&lt;owner&gt;/&lt;repo&gt; for x402 issues</div>
          <p>
            Claude loads the check procedure, reads the files that matter for x402 (paid API routes, x402 configuration, hosting settings,
            lockfiles) and reports findings on 11 items, each with the file and line.
          </p>
          <p className="note">
            For a private repository, pick the files with “+” → “Add from GitHub” in the chat, then ask for an x402 check. Only the selected
            files are shared, so the check covers those files in full.
          </p>
        </section>

        <section id="connect">
          <h2>
            <span className="k">Connect — </span>one URL
          </h2>
          <div className="urlrow">
            <span className="urlbox mono">{mcpUrl}</span>
            <CopyButton text={mcpUrl} label="Copy" done="Copied" />
          </div>
          <ol style={{ marginTop: 18 }}>
            <li>On claude.ai, open “Customize &gt; Connectors” → “Add custom connector”, enter a name and the URL above, then “Continue”.</li>
            <li>Choose “No sign-in” for authentication and add it.</li>
            <li>In a chat, check that the connector is on under “+”.</li>
          </ol>
          <p className="note">
            The same URL works without authentication in the Claude Desktop app and in other MCP clients that add remote servers by URL: Claude
            Code, Cursor, VS Code with GitHub Copilot, Codex CLI and ChatGPT.
          </p>
          <p className="note">
            Free plans allow one custom connector. On Team and Enterprise plans, an Owner adds the connector in the organization settings and
            members connect to it.
          </p>
          <p className="note">
            To also install it as a skill, upload the{" "}
            <a href="/x402-security-check.zip" download>
              skill ZIP
            </a>{" "}
            under “Customize &gt; Skills” → “+” → “Create skill” → “Upload a skill” (with “Code execution and file creation” on). It is not
            needed for normal use.
          </p>
        </section>

        <section id="tools">
          <h2>
            <span className="k">Tools — </span>read-only
          </h2>
          <div className="tools">
            {TOOLS.map(([name, desc]) => (
              <div className="tool" key={name}>
                <b>{name}</b>
                <span>{desc}</span>
              </div>
            ))}
          </div>
          <p className="note">No tool pays, signs or holds keys. Outside URLs must be https, and internal addresses are refused.</p>
        </section>

        <section id="scope">
          <h2>
            <span className="k">Scope — </span>11 items
          </h2>
          <p>
            The check covers the seller’s API server code (HTTP handlers, x402 middleware settings, CDN and hosting settings, dependencies):
            input checks before settlement, the contents of the 402, payment order, replays, payment and resource match, caching, expiry,
            facilitator results, the payment response header, SDK versions, and secrets.
          </p>
          <p className="note">
            It is not a full audit. No findings does not mean no vulnerabilities. Token contracts, buyer-side code and production settings that
            are not shared are not covered.
          </p>
        </section>
      </main>
      <footer>x402 Inc. · Logos are trademarks of their respective owners.</footer>
    </>
  );
}
