const assert = require("node:assert/strict");

const { stripMaybeFences } = require("../../out/agent/textSanitizer");

assert.equal(stripMaybeFences("  leading\ntrailing\n"), "  leading\ntrailing\n");
assert.equal(stripMaybeFences("```ts\nconst x = 1;\n```"), "const x = 1;");
assert.equal(stripMaybeFences("\n```python\n  print('x')\n```  \n"), "  print('x')");
assert.equal(stripMaybeFences("```not closed\nconst x = 1;\n"), "```not closed\nconst x = 1;\n");

console.log("Text sanitizer unit tests passed.");
