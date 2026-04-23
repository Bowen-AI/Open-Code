/**
 * Test runner for the Open-Cursor extension.
 * Runs all tests in the out/test directory using Mocha.
 * This file is executed with plain Node.js (no VSCode host required).
 */
/* eslint-disable @typescript-eslint/no-var-requires */

import * as path from 'path';

// Register a vscode stub so core modules can be tested without a VSCode host.
const vscodeStubPath = path.resolve(__dirname, 'vscodeStub.js');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Module = require('module') as { _resolveFilename: (...args: unknown[]) => string };
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request: unknown, ...rest: unknown[]): string {
  if (request === 'vscode') {
    return vscodeStubPath;
  }
  return origResolve(request, ...rest);
};

const Mocha = require('mocha') as typeof import('mocha');
const glob = require('glob') as { sync: (pattern: string, opts: object) => string[] };

async function run(): Promise<void> {
  const mocha = new Mocha({
    ui: 'bdd',
    color: true,
    timeout: 10000,
  });

  const testsRoot = path.resolve(__dirname);
  const files: string[] = glob.sync('**/*.test.js', { cwd: testsRoot });

  for (const file of files) {
    mocha.addFile(path.resolve(testsRoot, file));
  }

  return new Promise<void>((resolve, reject) => {
    mocha.run((failures: number) => {
      if (failures > 0) {
        reject(new Error(`${failures} test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}

run().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
