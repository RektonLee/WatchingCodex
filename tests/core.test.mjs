import assert from "node:assert/strict";
import test from "node:test";
import { buildRiskSignals, compact, mergeFileChanges, normalizePlan, parseNumstat, parsePorcelainStatus } from "../bridge/core.mjs";

test("compact keeps short values and bounds long output", () => {
  assert.equal(compact("hello", 10), "hello");
  assert.equal(compact("abcdefghijkl", 5), "abcde…");
});

test("normalizes app-server plan statuses", () => {
  assert.deepEqual(normalizePlan([{ step: "Inspect", status: "in_progress" }, { step: "Test", status: "pending" }]), [
    { step: "Inspect", status: "inProgress" },
    { step: "Test", status: "pending" },
  ]);
});

test("parses null-delimited git status including renames", () => {
  assert.deepEqual(parsePorcelainStatus(" M src/app.ts\0?? new file.md\0R  new-name.ts\0old-name.ts\0"), [
    { path: "src/app.ts", state: "M" },
    { path: "new file.md", state: "??" },
    { path: "new-name.ts", state: "R" },
  ]);
});

test("merges git status and numstat into a sorted file list", () => {
  const result = mergeFileChanges(
    [{ path: "src/b.ts", state: "M" }, { path: "src/a.ts", state: "??" }],
    parseNumstat("4\t2\tsrc/b.ts\n"),
  );
  assert.deepEqual(result, [
    { path: "src/a.ts", state: "??", added: 0, removed: 0 },
    { path: "src/b.ts", added: 4, removed: 2, state: "M" },
  ]);
});

test("flags destructive and unusually broad diffs", () => {
  const files = Array.from({ length: 21 }, (_, index) => ({ path: index === 0 ? "old.ts" : `src/${index}.ts`, state: index === 0 ? "D" : "M", added: 0, removed: index === 0 ? 300 : 0 }));
  const ids = buildRiskSignals(files, [], "idle").map((signal) => signal.id);
  assert.deepEqual(ids, ["wide-scope", "deletions", "large-removal"]);
});
