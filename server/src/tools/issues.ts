/** list_issues: data/issues.json (the 25 x402 issues and how they map to the 11 skill items). */
import { readData, type IssueData } from "../data.js";

export function listIssues(): IssueData {
  return readData<IssueData>("issues.json");
}
