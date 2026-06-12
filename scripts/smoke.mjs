/**
 * Headless browser smoke test against the preview build using system Edge.
 * Loads the app, starts a solo game, plays a few turns, screenshots
 * desktop (1280x800) and phone-portrait (390x844) layouts.
 *
 *   node scripts/smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:4173/';
mkdirSync('scratch-shots', { recursive: true });

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors = [];

async function run(name, viewport, play) {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (err) => errors.push(`[${name}] pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const loc = msg.location();
      errors.push(`[${name}] console: ${msg.text()} (${loc.url})`);
    }
  });
  await page.goto(base, { waitUntil: 'networkidle' });
  await play(page);
  await page.screenshot({ path: `scratch-shots/${name}.png` });
  await page.close();
}

// Desktop: start a full-map game, set a move target, end two turns
await run('desktop-start', { width: 1280, height: 800 }, async () => {});
await run('desktop-game', { width: 1280, height: 800 }, async (page) => {
  await page.getByText('Begin Assault').click();
  await page.waitForTimeout(1200);
  // tap the tactical view a bit left of centre to set a course
  await page.mouse.click(450, 380);
  await page.waitForTimeout(400);
  await page.getByText('End Turn').click();
  await page.waitForTimeout(2600);
  await page.getByText('End Turn').click();
  await page.waitForTimeout(2600);
});
// Phone portrait per the brief: 390x844
await run('phone-game', { width: 390, height: 844 }, async (page) => {
  await page.getByText('Gateway Compact — 50%').click();
  await page.getByText('Begin Assault').click();
  await page.waitForTimeout(1500);
});
// Damage + repair story: dev seam mangles systems, then the repair flow runs
await run('desktop-damaged', { width: 1280, height: 800 }, async (page) => {
  await page.goto(base + '?dev=1', { waitUntil: 'networkidle' });
  await page.getByText('Begin Assault').click();
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const { controller, bump } = window.__kraken;
    const s = controller.state.kraken.systems;
    s.treadLeft = 'dark';
    s.sensorArray = 'red';
    s.secondary1 = 'amber';
    bump();
  });
  await page.waitForTimeout(300);
  // queue the tread repair via the dashboard, then end the turn
  await page.evaluate(() => {
    const { controller, bump } = window.__kraken;
    if (!controller.setRepair('treadLeft')) throw new Error('setRepair failed');
    bump();
  });
  await page.getByText('End Turn').click();
  await page.waitForTimeout(2600);
  await page.evaluate(() => {
    const { controller } = window.__kraken;
    if (!controller.state.kraken.repair) throw new Error('repair did not start');
  });
  await page.getByText('End Turn').click();
  await page.waitForTimeout(2600);
});

await browser.close();
if (errors.length > 0) {
  console.error('SMOKE FAILURES:');
  for (const e of errors) console.error('  ' + e);
  process.exit(1);
}
console.log('smoke OK — screenshots in scratch-shots/');
