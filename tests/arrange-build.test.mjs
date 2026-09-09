import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';

// Check the production integration, not just the source algorithm. Vinext can
// replace import.meta.url with a build-time file URL in client modules.
const root = new URL('../dist/client/', import.meta.url);
const chunks = new URL('_next/static/chunks/', root);
const sources = await Promise.all(
  (await readdir(chunks))
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFile(new URL(name, chunks), 'utf8')),
);
const source = sources.find((code) => code.includes('new Worker('));
assert.ok(source, 'Production client must contain the Arrange worker factory');
const constructor = source.match(/new Worker\(([^;]*?)\)\}/)?.[0].slice(0, -1);
assert.ok(constructor, 'Worker constructor must be inspectable');
let workerUrl;
vm.runInNewContext(constructor, {
  e: undefined,
  URL,
  Worker: class {
    constructor(url) {
      workerUrl = String(url);
    }
  },
});
const resolved = new URL(workerUrl, 'https://example.com/');
assert.equal(
  resolved.origin,
  'https://example.com',
  'Worker must resolve to the game origin, never a local file URL',
);
assert.ok(resolved.pathname.startsWith('/_next/static/arrange.worker-'));
const workerCode = await readFile(
  new URL(resolved.pathname.slice(1), root),
  'utf8',
);
let response;
const self = {
  postMessage: (data) => {
    response = data;
  },
};
vm.runInNewContext(workerCode, { self });
const hand = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2].map((r, i) => ({
  id: String(i),
  r,
  s: 0,
}));
self.onmessage({ data: { hand, wild: 8, picked: null } });
assert.equal(response.error, undefined);
assert.deepEqual(
  [...response.groups.flat()].sort(),
  hand.map((c) => c.id).sort(),
);
console.log(
  'PASS: production worker resolves on the game origin and returns every card through its message handler.',
);
