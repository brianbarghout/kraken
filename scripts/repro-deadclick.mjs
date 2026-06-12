/**
 * P1 regression repro — dead first-arm click (Phase 1.2 brief).
 * Drives the REAL input chain under several conditions:
 *   A) settled: arm, wait, click unit centre
 *   B) impatient: arm and click immediately (no settle wait)
 *   C) mid-session: several END TURNs first, then arm + click
 *   D) ring-area click (ground next to the unit, inside its ring)
 * Any click on a ringed target must lock or explicitly reject — silence fails.
 *
 *   node scripts/repro-deadclick.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';

const base = (process.argv[2] ?? 'http://localhost:4173/') + '?dev=1';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const failures = [];

async function newGamePage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('pageerror', (e) => failures.push(`pageerror: ${e.message}`));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.getByText('Begin Assault').click();
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const { controller, bump } = window.__kraken;
    const k = controller.state.krakenPosition;
    const tank = controller.state.defenders.find((u) => u.type === 'heavyTank');
    tank.position = { q: k.q - 3, r: k.r };
    window.__tankId = tank.id;
    bump();
  });
  await page.waitForTimeout(300);
  return page;
}

async function state(page) {
  return page.evaluate(() => ({
    locks: window.__kraken.controller.pending.fires.length,
    hint: document.querySelector('.hint-bar')?.textContent ?? '',
    mode: undefined,
  }));
}

async function tankPos(page) {
  const pos = await page.evaluate(() =>
    window.__kraken.sceneRef.current.screenPositionOfUnit(window.__tankId),
  );
  if (!pos) throw new Error('tank not on screen');
  return pos;
}

async function check(name, page, { settleMs = 400, ringOffset = 0, turnsFirst = 0 }) {
  for (let i = 0; i < turnsFirst; i++) {
    await page.getByText('End Turn').click();
    await page.waitForTimeout(350);
    await page.mouse.click(640, 300); // skip playback
    await page.waitForTimeout(350);
  }
  await page.getByRole('button', { name: 'Main', exact: true }).click(); // ARM
  if (settleMs > 0) await page.waitForTimeout(settleMs);
  const before = await state(page);
  const pos = await tankPos(page);
  await page.mouse.click(pos.x + ringOffset, pos.y);
  await page.waitForTimeout(300);
  const after = await state(page);
  if (after.locks >= 1) {
    console.log(`PASS [${name}]: locked on first-arm click`);
    return;
  }
  if (after.hint !== before.hint) {
    console.log(`SOFT [${name}]: no lock but explicit feedback: "${after.hint}"`);
    return;
  }
  failures.push(`DEAD CLICK [${name}]: no lock, no feedback (hint: "${after.hint}")`);
}

await check('A settled', await newGamePage(), {});
await check('B impatient', await newGamePage(), { settleMs: 0 });
await check('C mid-session', await newGamePage(), { turnsFirst: 3 });
await check('D ring-area', await newGamePage(), { ringOffset: 14 });

// E) overlays must never swallow battlefield clicks — every informational
// overlay over the canvas needs pointer-events: none, or a unit standing
// behind it is silently unclickable (the dead-click class).
{
  const page = await newGamePage();
  const blocked = await page.evaluate(() =>
    ['.hint-bar', '.turn-banner', '.minimap', '.event-ticker', '.order-checklist', '.phase-label']
      .flatMap((sel) => [...document.querySelectorAll(sel)])
      .filter((el) => getComputedStyle(el).pointerEvents !== 'none')
      .map((el) => el.className),
  );
  if (blocked.length > 0) {
    failures.push(`DEAD CLICK [E overlays]: click-swallowing overlays: ${blocked.join(', ')}`);
  } else {
    console.log('PASS [E overlays]: all canvas overlays are click-through');
  }
  await page.close();
}

await browser.close();
if (failures.length > 0) {
  console.error('FAIL:');
  for (const f of failures) console.error('  ' + f);
  process.exit(1);
}
console.log('repro-deadclick: all variants produced lock or explicit feedback');
