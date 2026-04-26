const assert = require("node:assert");
const vscode = require("vscode");

suite("Open Code extension", () => {
  test("activates and contributes core commands", async () => {
    const extension = vscode.extensions.getExtension("open-code.open-code-vscode-extension");
    assert.ok(extension, "Open Code extension should be discoverable");
    await extension.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const command of [
      "open-code.startAutodrive",
      "open-code.runAgent",
      "open-code.reviewProposed",
      "open-code.revertLastChange",
      "open-code.health",
      "open-code.setCredentialRef",
      "open-code.deleteCredentialRef",
      "open-code.clearMemory",
      "open-code.showMemory",
      "open-code.discriminateCommit"
    ]) {
      assert.ok(commands.includes(command), `Missing command ${command}`);
    }
  });
});
