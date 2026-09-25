import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
// Exercise pointer/animation orchestration in Node. No browser or screenshot QA.
const fake = `export const slots=[]; export const states=[];
export const useRef=x=>{const r={current:x};slots.push(r);return r};
export const useState=x=>{const i=states.push(x)-1;return[x,v=>states[i]=typeof v==='function'?v(states[i]):v]};
export const useEffect=()=>{}; export const useLayoutEffect=()=>{}; export const flushSync=f=>f();`;
writeFileSync('work/motion-react.mjs', fake);
await build({
  entryPoints: [
    'hooks/use-card-motion.ts',
    'hooks/use-card-flight.ts',
    'hooks/use-group-motion.ts',
  ],
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
  style: {
    transform: '',
    visibility: '',
    width: `${r.width}px`,
    height: `${r.height}px`,
  },
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
    discards = 0;
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
  assert.equal(
    motion.ghost.current.style.transform,
    direct && !cancel
      ? 'translate3d(260px,100px,0) rotate(0deg) scale(1,1)'
      : 'translate3d(50px,330px,0) rotate(0deg) scale(1,1)',
    'card settles exactly onto its real destination, flat and at full size',
  );
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
    'translate3d(180px,240px,0) rotate(0deg) scale(1.1111111111111112,1.1111111111111112)',
  );
}
console.log(
  'PASS: 30 consecutive retargeted flights land precisely and clean up their source/layer.',
);

// Pointer-level double taps work for touch and mouse even when native clicks
// are suppressed after pointer capture. Single taps never discard or declare.
{
  const discarded = [];
  const motion = useCardMotion(
    ['~group:a', 'a', 'b'],
    () => {},
    async () => null,
    async () => false,
    'double-tap',
    (id) => discarded.push(id),
  );
  const target = {
    ...element(rect(10, 300)),
    closest: () => ({ setPointerCapture() {} }),
  };
  const tap = async (id, x = 20) => {
    motion.start(event(x, 320, target), 'hand', id, { id, r: 4, s: 0 });
    await motion.end(event(x, 320, target));
  };
  await tap('a');
  assert.deepEqual(discarded, []);
  await tap('a');
  assert.deepEqual(discarded, ['a']);
  await tap('a');
  await tap('b');
  assert.deepEqual(discarded, ['a']);
  await tap('b');
  assert.deepEqual(discarded, ['a', 'b']);
  await new Promise((r) => setTimeout(r, 510));
  console.log(
    'PASS: double-tap discards once; single taps and taps on different cards do not discard.',
  );
}
{
  let order = ['~group:a', 'a', 'b', 'c'];
  const group = {
    dataset: { handGroup: '~group:a' },
    offsetWidth: 180,
    getBoundingClientRect: () => rect(100, 300, 90, 80),
    querySelectorAll: () =>
      order.filter((id) => !id.startsWith('~')).map(cardElement),
  };
  function cardElement(id) {
    const index = order.filter((id) => !id.startsWith('~')).indexOf(id);
    return {
      ...element(rect(100 + index * 22.5, 300, 45, 63), { card: id }),
      offsetWidth: 90,
      offsetLeft: index * 45,
      offsetParent: group,
      closest: () => ({ setPointerCapture() {} }),
    };
  }
  globalThis.getComputedStyle = () => ({ marginLeft: '-45', getPropertyValue: () => '' });
  const motion = useCardMotion(
    order,
    (next) => {
      order = next;
    },
    async () => null,
    async () => false,
    'scaled-hand',
  );
  motion.hand.current = {
    getBoundingClientRect: () => rect(90, 290, 160, 100),
    querySelectorAll: (selector) =>
      selector === '[data-card]' ? group.querySelectorAll() : [group],
  };
  motion.ghost.current = element(rect(100, 300, 45, 63));
  hitDiscard = false;
  motion.start(event(105, 320, cardElement('a')), 'hand', 'a', {
    id: 'a',
    r: 3,
    s: 0,
  });
  motion.move(event(140, 320, cardElement('a')));
  await motion.end(event(140, 320, cardElement('a')));
  assert.deepEqual(order, ['~group:a', 'b', 'a', 'c', '~group:discard']);
  await new Promise((r) => setTimeout(r, 510));
  console.log(
    'PASS: a half-scale mobile hand inserts at the correct physical pointer position.',
  );
}

// A translated overlay (keyboard/browser chrome at mobile startup) must not
// translate the dragged card away from the same client-coordinate finger.
{
  const { positionCard } = await import('../lib/card-position.ts');
  const el = element(rect(100, 200, 90, 126));
  el.parentElement = {
    offsetWidth: 800,
    getBoundingClientRect: () => rect(0, -180, 800, 400),
  };
  positionCard(el, 100, 200, 90, 126);
  assert.equal(
    el.style.transform,
    'translate3d(100px,380px,0) rotate(0deg) scale(1,1)',
  );
  el.parentElement = {
    offsetWidth: 800,
    getBoundingClientRect: () => rect(0, 0, 800, 400),
  };
  positionCard(el, 100, 200, 90, 126);
  assert.equal(
    el.style.transform,
    'translate3d(100px,200px,0) rotate(0deg) scale(1,1)',
  );
  console.log(
    'PASS: ghost compensates for a changing mobile overlay origin without shifting away from its client-coordinate anchor.',
  );
}
{
  let order = ['~group:left', 'a', 'b', '~group:right', 'c', 'd'];
  const original = [...order];
  const parent = {
    offsetWidth: 440,
    getBoundingClientRect: () => rect(80, 270, 440, 220),
  };
  const zones = [
    { id: '~group:left', left: 100, top: 330 },
    { id: '~group:right', left: 300, top: 290 },
  ].map((z) => ({
    dataset: { handGroup: z.id },
    parentElement: parent,
    getBoundingClientRect: () => rect(z.left, z.top, 135, 126),
    offsetWidth: 135,
    querySelectorAll: () => cardsIn(z.id).map(cardEl),
  }));
  function cardsIn(group) {
    const i = order.indexOf(group);
    let end = order.findIndex((id, j) => j > i && id.startsWith('~'));
    if (end < 0) end = order.length;
    return order.slice(i + 1, end);
  }
  function cardEl(id) {
    const group = zones.find((z) => cardsIn(z.dataset.handGroup).includes(id));
    const slot = cardsIn(group.dataset.handGroup).indexOf(id);
    const r = group.getBoundingClientRect();
    return {
      ...element(rect(r.left + slot * 45, r.top), { card: id }),
      offsetWidth: 90,
      offsetLeft: slot * 45,
      offsetParent: group,
      closest: (selector) =>
        selector === 'main' ? { setPointerCapture() {} } : group,
    };
  }
  const motion = useCardMotion(
    order,
    (next) => (order = next),
    async () => null,
    async () => false,
    'stable-targets',
  );
  motion.hand.current = {
    getBoundingClientRect: () => rect(80, 270, 440, 220),
    querySelectorAll: (selector) =>
      selector === '[data-card]'
        ? order.filter((id) => !id.startsWith('~')).map(cardEl)
        : zones,
  };
  motion.ghost.current = element(rect(100, 330));
  motion.start(event(115, 350, cardEl('a')), 'hand', 'a', {
    id: 'a',
    r: 4,
    s: 0,
  });
  motion.move(event(325, 310, cardEl('a')));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(
    cardsIn('~group:right').includes('a'),
    'destination opens a slot before release',
  );
  assert.deepEqual(cardsIn('~group:left'), ['b']);
  assert.equal(
    order.filter((id) => id === 'a').length,
    1,
    'preview never duplicates the card',
  );
  assert.equal(zones[1].dataset.dropTarget, 'true');
  const frozen = motion.groupStyle('~group:right', 3, 90, 45);
  assert.equal(frozen.position, 'absolute');
  assert.equal(frozen.left, 220);
  assert.equal(frozen.top, 20);
  assert.equal(frozen.width, 135);
  assert.equal(frozen.height, 126);
  assert.equal(motion.groupStyle('~group:right', 2, 90, 45).left, frozen.left);
  assert.equal(motion.groupStyle('~group:right', 2, 90, 45).width, frozen.width);
  motion.move(event(115, 350, cardEl('a')));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(
    cardsIn('~group:left').includes('a'),
    'can preview back into the original group',
  );
  motion.move(event(325, 310, cardEl('a')));
  await new Promise((r) => setTimeout(r, 20));
  await motion.end(event(325, 310, cardEl('a')));
  assert.deepEqual(motion.groupStyle('~group:right', 3, 90, 45), {});
  assert.ok(cardsIn('~group:right').includes('a'));
  assert.deepEqual(cardsIn('~group:left'), ['b']);
  await new Promise((r) => setTimeout(r, 510));
  console.log(
    'PASS: cross-group insertion previews before release while retaining cached hit targets.',
  );
}
// Both piles preview insertion before release, including before a draw resolves.
for (const source of ['draw', 'open']) {
  let order = ['~group:a', 'a', 'b', 'c'];
  const group = {
    dataset: { handGroup: '~group:a' },
    offsetWidth: 300,
    getBoundingClientRect: () => rect(0, 300, 300, 126),
    querySelectorAll: () =>
      order.filter((id) => !id.startsWith('~')).map(cardEl),
  };
  function cardEl(id) {
    const slot = order.filter((id) => !id.startsWith('~')).indexOf(id);
    return {
      ...element(rect(slot * 45, 300), { card: id }),
      offsetWidth: 90,
      offsetLeft: slot * 45,
      offsetParent: group,
    };
  }
  const motion = useCardMotion(
    order,
    (next) => (order = next),
    async () => ({ id: 'new', r: 4, s: 0 }),
    async () => false,
    'pile-preview',
  );
  motion.hand.current = {
    getBoundingClientRect: () => handRect,
    querySelectorAll: (selector) =>
      selector === '[data-card]' ? group.querySelectorAll() : [group],
  };
  motion.ghost.current = element(pileRect);
  const target = {
    querySelector: () => element(pileRect),
    closest: () => ({ setPointerCapture() {} }),
  };
  motion.start(
    event(280, 120, target),
    source,
    INCOMING,
    source === 'open' ? { id: 'new', r: 4, s: 0 } : null,
  );
  motion.move(event(5, 340, target));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(
    order.filter(
      (id) => !id.startsWith('~group:draw') && id !== '~group:discard',
    ),
    ['~group:a', INCOMING, 'a', 'b', 'c'],
  );
  motion.move(event(240, 340, target));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(
    order.filter(
      (id) => !id.startsWith('~group:draw') && id !== '~group:discard',
    ),
    ['~group:a', 'a', 'b', 'c', INCOMING],
  );
  motion.move(event(280, 150, target));
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(!order.includes(INCOMING), 'leaving hand closes preview gap');
  motion.move(event(5, 340, target));
  await new Promise((r) => setTimeout(r, 20));
  await motion.end(event(5, 340, target));
  assert.deepEqual(
    order.filter(
      (id) => !id.startsWith('~group:draw') && id !== '~group:discard',
    ),
    ['~group:a', 'new', 'a', 'b', 'c'],
  );
}
console.log(
  'PASS: draw/open cards preview moving hand slots, close gaps outside hand and retain chosen position on release.',
);

const { useGroupMotion } =
  await import('../work/motion-test/use-group-motion.js');
{
  let order = ['~group:a', 'a', '~group:b', 'b', '~group:c', 'c'];
  const nodes = ['~group:a', '~group:b', '~group:c'].map((id) => {
    const node = element(rect(0, 300, 100, 160), { handGroup: id });
    node.offsetWidth = 100;
    node.getBoundingClientRect = () =>
      rect(
        order.filter((x) => x.startsWith('~')).indexOf(id) * 110,
        300,
        100,
        160,
      );
    return node;
  });
  const hand = { current: { querySelectorAll: () => nodes } };
  const motion = useGroupMotion(
    hand,
    order,
    (next) => (order = next),
    'groups',
  );
  const header = { setPointerCapture() {} };
  const pointer = (x) => ({
    ...event(x, 310, header),
    target: { closest: () => null },
    preventDefault() {},
    stopPropagation() {},
  });
  motion.start(pointer(10), '~group:a');
  motion.move(pointer(250));
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(order, ['~group:b', 'b', '~group:c', 'c', '~group:a', 'a']);
  motion.end(pointer(250));
  assert.equal(motion.isActive(), false);
  assert.equal(nodes[0].style.translate, 'none');
  assert.ok(!nodes[0].dataset.groupDragging);
  motion.start(pointer(230), '~group:a');
  motion.move(pointer(10));
  await new Promise((r) => setTimeout(r, 20));
  motion.end(pointer(10), true);
  assert.deepEqual(
    order,
    ['~group:b', 'b', '~group:c', 'c', '~group:a', 'a'],
    'cancelling restores whole group order',
  );
  console.log(
    'PASS: header dragging reorders whole groups, keeps membership, settles cleanly and restores order on cancellation.',
  );
}
// A target created for this draw survives every hover, then is retired only
// after release if the new card landed elsewhere. Test both piles and outcomes.
for (const source of ['draw', 'open'])
  for (const useNewGroup of [false, true]) {
    let order = ['~group:a', 'a', '~group:b', 'b'];
    const groups = () =>
      order
        .filter((id) => id.startsWith('~group:'))
        .map((id, index) => ({
          dataset: { handGroup: id },
          offsetWidth: 160,
          getBoundingClientRect: () => rect(index * 200, 300, 160, 126),
          querySelectorAll: () => {
            const start = order.indexOf(id),
              next = order.findIndex(
                (v, i) => i > start && v.startsWith('~group:'),
              );
            return order
              .slice(start + 1, next < 0 ? undefined : next)
              .map((card, i) => ({
                ...element(rect(index * 200 + i * 45, 300), { card }),
                offsetWidth: 90,
                offsetLeft: i * 45,
                offsetParent: {
                  offsetWidth: 160,
                  getBoundingClientRect: () => rect(index * 200, 300, 160, 126),
                },
              }));
          },
        }));
    const motion = useCardMotion(
      order,
      (next) => (order = next),
      async () => ({ id: 'new', r: 4, s: 0 }),
      async () => false,
      'temporary-target',
    );
    motion.hand.current = {
      getBoundingClientRect: () => handRect,
      querySelectorAll: (selector) =>
        selector === '[data-card]'
          ? groups().flatMap((g) => g.querySelectorAll())
          : groups(),
    };
    motion.ghost.current = element(pileRect);
    const target = {
      querySelector: () => element(pileRect),
      closest: () => ({ setPointerCapture() {} }),
    };
    hitDiscard = false;
    motion.start(
      event(280, 120, target),
      source,
      INCOMING,
      source === 'open' ? { id: 'new', r: 4, s: 0 } : null,
    );
    const created = motion.protectedGroup();
    assert.ok(created);
    motion.move(event(405, 340, target));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(order.includes(INCOMING));
    motion.move(event(600, 160, target));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(
      order.includes(created),
      'new empty group survives leaving the hand',
    );
    motion.move(event(5, 340, target));
    await new Promise((r) => setTimeout(r, 20));
    assert.ok(
      order.includes(created),
      'new empty group survives hovering another group',
    );
    if (useNewGroup) {
      motion.move(event(405, 340, target));
      await new Promise((r) => setTimeout(r, 20));
    }
    await motion.end(event(useNewGroup ? 405 : 5, 340, target));
    assert.equal(
      order.includes(created),
      useNewGroup,
      'only unused temporary target is removed after release',
    );
    assert.equal(order.filter((id) => id === 'new').length, 1);
    assert.equal(motion.protectedGroup(), undefined);
    assert.ok(order.includes('~group:b'), 'unrelated groups remain');
  }
console.log(
  'PASS: temporary draw/open groups survive hover-out and re-entry; release keeps occupied targets and removes only unused temporary targets.',
);
