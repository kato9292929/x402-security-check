import { checkRateLimit } from "@vercel/firewall";
import { createMcpHandler } from "mcp-handler";
import { INSTRUCTIONS, registerAll } from "../../../lib/register";
import { VERSION } from "../../../generated/core/version.js";

/** The rate limit rule's ID in the Vercel Firewall (condition "@vercel/firewall"). */
const RATE_LIMIT_ID = "x402-security-check-mcp";

const mcp = createMcpHandler((server) => registerAll(server as never), {
  serverInfo: { name: "x402-security-check", version: VERSION },
  instructions: INSTRUCTIONS,
});

/** Calls per client IP are limited by the Vercel Firewall rule above. Outside Vercel there is no limit. */
async function limited(request: Request): Promise<boolean> {
  if (!process.env.VERCEL) return false;
  try {
    const { rateLimited } = await checkRateLimit(RATE_LIMIT_ID, { request, timeout: 1500 });
    return rateLimited;
  } catch {
    return false;
  }
}

async function handler(request: Request): Promise<Response> {
  if (await limited(request)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429, headers: { "content-type": "application/json" } });
  }
  return mcp(request);
}

export const maxDuration = 60;
export { handler as GET, handler as POST };
