import { describe, expect, test } from 'vitest';
import { createRng } from '../src/rng';
import { loadUnitData } from '../src/node';
import { resolveAttack } from '../src/combat';
import { createDefender, defenderAttack, defenderSpeed, applyDamageToDefender } from '../src/units';
import { axial } from '../src/hex';

const data = loadUnitData();

describe('resolveAttack — GDD §8.5 combat resolution', () => {
  test('attack >= 2x armour is a kill, no roll', () => {
    const rng = createRng(1);
    for (let i = 0; i < 20; i++) {
      expect(resolveAttack(6, 3, data, rng)).toBe('kill');
      expect(resolveAttack(4, 2, data, rng)).toBe('kill');
    }
  });

  test('attack < armour is a ping, no roll', () => {
    const rng = createRng(2);
    for (let i = 0; i < 20; i++) {
      expect(resolveAttack(2, 3, data, rng)).toBe('ping');
    }
  });

  test('attack >= armour but < 2x is a 50/50 damage roll', () => {
    const rng = createRng(3);
    const results = new Map<string, number>();
    for (let i = 0; i < 400; i++) {
      const r = resolveAttack(3, 2, data, rng);
      results.set(r, (results.get(r) ?? 0) + 1);
      expect(['damage', 'noEffect']).toContain(r);
    }
    expect(results.get('damage')! / 400).toBeGreaterThan(0.4);
    expect(results.get('damage')! / 400).toBeLessThan(0.6);
  });

  test('zero attack can never hurt anything (scouts)', () => {
    const rng = createRng(4);
    expect(resolveAttack(0, 0, data, rng)).toBe('ping');
  });

  test('any positive attack kills armour 0 (scout bikes are fragile)', () => {
    const rng = createRng(5);
    expect(resolveAttack(2, 0, data, rng)).toBe('kill');
  });

  test('autoDamage option converts the 50/50 bracket into certain damage (light tank vs treads)', () => {
    const rng = createRng(6);
    for (let i = 0; i < 50; i++) {
      expect(resolveAttack(3, 2, data, rng, { autoDamage: true })).toBe('damage');
    }
    // but still a kill at 2x — autoDamage never downgrades
    expect(resolveAttack(4, 2, data, rng, { autoDamage: true })).toBe('kill');
  });
});

describe('defender units', () => {
  test('createDefender takes stats from units.json', () => {
    const t = createDefender('u1', 'heavyTank', 'fleet-a', axial(0, 0));
    expect(t.state).toBe('green');
    expect(defenderAttack(t, data)).toBe(4);
    expect(defenderSpeed(t, data)).toBe(2);
  });

  test('damaged units fight and move worse', () => {
    const t = createDefender('u1', 'heavyTank', 'fleet-a', axial(0, 0));
    t.state = 'amber';
    expect(defenderAttack(t, data)).toBe(2); // 4 * 0.5
    expect(defenderSpeed(t, data)).toBe(1); // 2 - 1
  });

  test('damage result: green -> amber -> dead', () => {
    const t = createDefender('u1', 'gev', 'fleet-a', axial(0, 0));
    applyDamageToDefender(t, 'damage', data, createRng(7));
    expect(t.state).toBe('amber');
    applyDamageToDefender(t, 'damage', data, createRng(8));
    expect(t.state).toBe('dead');
  });

  test('kill result destroys outright', () => {
    const t = createDefender('u1', 'lightTank', 'fleet-a', axial(0, 0));
    applyDamageToDefender(t, 'kill', data, createRng(9));
    expect(t.state).toBe('dead');
  });

  test('heavy tank can survive one main-battery kill as a glance (GDD §8.5)', () => {
    // survival chance is 0.5 — find a seed where the roll succeeds
    const t = createDefender('u1', 'heavyTank', 'fleet-a', axial(0, 0));
    const rng = createRng(1); // first next() < 0.5 for this seed or not — assert both branches below
    applyDamageToDefender(t, 'kill', data, rng, { fromMainBattery: true });
    if (t.state === 'amber') {
      // glance used — a second main-battery kill is final
      applyDamageToDefender(t, 'kill', data, rng, { fromMainBattery: true });
      expect(t.state).toBe('dead');
      expect(t.glanceUsed).toBe(true);
    } else {
      expect(t.state).toBe('dead');
    }
  });

  test('glance survival happens for some seeds and not others (it is a real roll)', () => {
    const outcomes = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      const t = createDefender('u1', 'heavyTank', 'fleet-a', axial(0, 0));
      applyDamageToDefender(t, 'kill', data, createRng(seed), { fromMainBattery: true });
      outcomes.add(t.state);
    }
    expect(outcomes).toEqual(new Set(['amber', 'dead']));
  });

  test('light tanks get no glance from the main battery (GDD §8.5: no survival roll)', () => {
    for (let seed = 0; seed < 20; seed++) {
      const t = createDefender('u1', 'lightTank', 'fleet-a', axial(0, 0));
      applyDamageToDefender(t, 'kill', data, createRng(seed), { fromMainBattery: true });
      expect(t.state).toBe('dead');
    }
  });
});
