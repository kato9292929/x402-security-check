import { describe, expect, it } from "vitest";
import { parseGitHubUrl } from "../server/src/tools/github-lockfiles.js";

describe("parseGitHubUrl", () => {
  it("reads owner, repo and branch", () => {
    expect(parseGitHubUrl("https://github.com/acme/seller")).toEqual({ owner: "acme", repo: "seller", ref: "HEAD" });
    expect(parseGitHubUrl("https://github.com/acme/seller.git")).toEqual({ owner: "acme", repo: "seller", ref: "HEAD" });
    expect(parseGitHubUrl("https://github.com/acme/seller/tree/feature/x402")).toEqual({ owner: "acme", repo: "seller", ref: "feature/x402" });
  });
  it("refuses anything that is not a github.com repository URL", () => {
    expect(() => parseGitHubUrl("http://github.com/acme/seller")).toThrow();
    expect(() => parseGitHubUrl("https://gitlab.com/acme/seller")).toThrow();
    expect(() => parseGitHubUrl("https://github.com/acme")).toThrow();
    expect(() => parseGitHubUrl("https://github.com/acme/seller/tree/%2E%2E%2Fx")).toThrow();
    expect(() => parseGitHubUrl("https://github.com/ac me/seller")).toThrow();
  });
});
