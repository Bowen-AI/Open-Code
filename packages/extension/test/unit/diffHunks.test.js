const assert = require("node:assert/strict");

const { computeLineHunks, detectLineEnding } = require("../../out/agent/diffHunks");

assert.deepEqual(computeLineHunks("a\nb\nc", "a\nb\nc"), []);
assert.equal(detectLineEnding("a\r\nb\r\n"), "\r\n");

const hunks = computeLineHunks("a\nb\nc", "a\nB\nc\nd");
assert.equal(hunks.length, 2);
assert.equal(hunks[0].oldText, "b");
assert.equal(hunks[0].newText, "B");
assert.equal(hunks[1].oldLineCount, 0);
assert.equal(hunks[1].newText, "d");

console.log("Diff hunk unit tests passed.");
