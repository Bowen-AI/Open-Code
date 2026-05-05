const assert = require("node:assert");
const Mocha = require("mocha");
const vscode = require("vscode");

function run() {
  const mocha = new Mocha({ color: true });
  const suite = Mocha.Suite.create(mocha.suite, "Open Code extension");

  suite.addTest(new Mocha.Test("activates and contributes core commands", async () => {
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
  }));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} extension test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { run };
