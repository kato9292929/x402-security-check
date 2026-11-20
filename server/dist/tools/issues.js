/** list_issues: data/issues.json (the 25 x402 issues and how they map to the 11 skill items). */
import { readData } from "../data.js";
export function listIssues() {
    return readData("issues.json");
}
