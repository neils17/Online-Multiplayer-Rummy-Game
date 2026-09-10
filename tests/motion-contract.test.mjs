import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
// Exercise pointer/animation orchestration in Node. No browser or screenshot QA.
const fake = `export const slots=[]; export const states=[];
export const useRef=x=>{const r={current:x};slots.push(r);return r};
export const useState=x=>{const i=states.push(x)-1;return[x,v=>states[i]=typeof v==='function'?v(states[i]):v]};
export const useEffect=()=>{}; export const useLayoutEffect=()=>{}; export const flushSync=f=>f();`;
writeFileSync('work/motion-react.mjs', fake);
await build({
  entryPoints: ['hooks/use-card-motion.ts', 'hooks/use-card-flight.ts'],
  outdir: 'work/motion-test',
  bundle: true,
  platform: 'node',
  format: 'esm',
  plugins: [
    {
      name: 'hook-runtime',
      setup(b) {
        b.onResolve({ filter: /^react(-dom)?$/ }, () => ({
          path: new URL('../work/motion-react.mjs', import.meta.url).pathname,
          external: true,
        }));
      },
    },
  ],
});
const runtime = await import('../work/motion-react.mjs');
const { useCardMotion, INCOMING } =
  await import('../work/motion-test/use-card-motion.js');
const { useCardFlight } =
  await import('../work/motion-test/use-card-flight.js');
globalThis.matchMedia = () => ({ matches: false });
let clock = 0,
  frames = 0;
globalThis.requestAnimationFrame = (callback) =>
  setTimeout(() => {
    clock += 16;
    frames++;
    callback(clock);
  }, 0);
globalThis.cancelAnimationFrame = clearTimeout;
const rect = (left, top, width = 90, height = 126) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});
const pileRect = rect(260, 100),
  handRect = rect(0, 300, 700, 180);
let animations = [];
const element = (r, data = {}) => ({
  dataset: data,
  style: { transform: '', visibility: '' },
  getBoundingClientRect: () => r,
  animate: (keyframes, options) => {
    animations.push({ keyframes, options });
    return { finished: Promise.resolve(), cancel() {} };
  },
});
let hitDiscard = false;
const pile = {
  getBoundingClientRect: () => pileRect,
  querySelector: () => element(pileRect),
};
globalThis.document = {
  elementFromPoint: () => ({ closest: () => (hitDiscard ? pile : null) }),
};
const event = (x, y, target) => ({
  button: 0,
  pointerId: 1,
  clientX: x,
  clientY: y,
  currentTarget: target,
});
async function gesture({
  direct = false,
  cancel = false,
  tap = false,
  slow = false,
} = {}) {
  let order = ['~group:a', 'old'];
  let draws = 0,
    discards = 0,
    selected = null;
  const card = { id: 'new', r: 7, s: 1 };
  let release;
  const drawPromise = slow
    ? new Promise((r) => (release = r))
    : Promise.resolve(card);
  const motion = useCardMotion(
    order,
    (next) => {
      order = next;
    },
    (v) => (selected = v),
    async () => {
      draws++;
      return drawPromise;
    },
    async (id, animate) => {
      assert.equal(id, 'new');
      discards++;
      await animate();
      return true;
    },
    'room/1/playing',
  );
  motion.ghost.current = element(rect(120, 100));
  motion.hand.current = {
    getBoundingClientRect: () => handRect,
    querySelectorAll: (selector) =>
      selector === '[data-card]'
        ? order
            .filter((x) => !x.startsWith('~'))
            .map((id, i) => element(rect(i * 50, 330), { card: id }))
        : [],
    scrollLeft: 0,
    scrollTop: 0,
  };
  const target = {
    querySelector: () => element(rect(120, 100)),
    closest: () => ({ setPointerCapture() {} }),
  };
  motion.start(event(140, 130, target), 'draw', INCOMING, null);
  assert.equal(draws, 1, 'pointer press starts exactly one irreversible draw');
  if (!tap) motion.move(event(direct ? 275 : 150, direct ? 150 : 350, target));
  hitDiscard = direct;
  const ending = motion.end(
    event(direct ? 275 : 150, direct ? 150 : 350, target),
    cancel,
  );
  if (slow) {
    assert.equal(discards, 0, 'discard waits for authoritative draw');
    release(card);
  }
  await ending;
  assert.equal(draws, 1, 'release never draws twice');
  assert.equal(discards, direct && !cancel ? 1 : 0);
  assert.ok(!motion.isDragging());
  assert.ok(!order.includes(INCOMING));
  assert.equal(
    order.filter((x) => x === 'new').length,
    1,
    'exactly one destination card',
  );
  assert.equal(selected, null, 'landed card is level and unselected');
  let prevented = false;
  motion.click({
    detail: 1,
    clientX: 600,
    clientY: 450,
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {},
  });
  assert.equal(
    prevented,
    false,
    'a later unrelated button click is not swallowed',
  );
}
await gesture({ direct: true, slow: true });
await gesture({ cancel: true });
await gesture({ tap: true });
await gesture();
assert.ok(
  animations.every((a) =>
    a.keyframes.at(-1).transform.includes('rotate(0deg)'),
  ),
);
console.log(
  'PASS: immediate draw request, slow-network deck-to-discard, cancellation keeps committed card, tap draws once, level landing, unrelated controls remain clickable.',
);
// Repeated moving-target flights must finish exactly at their latest destination,
// restore their source and leave no retained WAAPI effects.
const flight = useCardFlight();
flight.element.current = element(rect(0, 0));
for (let i = 0; i < 30; i++) {
  const source = element(rect(0, 0));
  let target = rect(120, 200),
    begin = 0,
    commits = 0;
  const startFrames = frames;
  await flight.fly(
    rect(0, 0),
    () => {
      if (frames - startFrames > 8) target = rect(180, 240, 100, 140);
      return target;
    },
    null,
    'test',
    () => commits++,
    source,
    () => begin++,
  );
  assert.equal(begin, 1);
  assert.equal(commits, 1);
  assert.equal(source.style.visibility, '');
  assert.equal(
    flight.element.current.style.transform,
    'translate3d(180px,240px,0) scale(1.1111111111111112,1.1111111111111112)',
  );
}
console.log(
  'PASS: 30 consecutive retargeted flights land precisely and clean up their source/layer.',
);
