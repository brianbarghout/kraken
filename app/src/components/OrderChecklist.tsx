/**
 * P4.1 — persistent orders checklist: one glance answers
 * "am I ready to END TURN?"
 */
import { axialToOffset, hexEquals } from '../../../engine/src/hex';
import { weaponAttack, WEAPON_SYSTEMS } from '../../../engine/src/kraken';
import { SoloController } from '../game/controller';
import { targetTag, WEAPON_META } from '../game/weaponMeta';

export function OrderChecklist({
  controller,
}: {
  controller: SoloController;
  /** re-render key — pending orders are mutated in place */
  tick: number;
}) {
  const { pending, state } = controller;
  const course = pending.moveTo ? axialToOffset(pending.moveTo) : null;
  const overruns = (controller.movePlan?.overruns ?? [])
    .map((hex) => state.defenders.find((u) => u.state !== 'dead' && hexEquals(u.position, hex)))
    .filter((u) => u !== undefined)
    .map((u) => u!.id.toUpperCase());
  return (
    <div className="order-checklist">
      <div className="oc-title rj">Orders</div>
      <div className={course ? 'oc-set' : 'oc-unset'}>
        {course
          ? `Course → (${course.col},${course.row})${overruns.length ? ` · overruns ${overruns.join(', ')}` : ''}`
          : 'No course set'}
      </div>
      {WEAPON_SYSTEMS.map((w) => {
        if (weaponAttack(state.kraken, state.data, w) <= 0) return null;
        const lock = pending.fires.find((f) => f.weapon === w);
        return (
          <div key={w} className={lock ? 'oc-set' : 'oc-unset'}>
            <span style={lock ? { color: WEAPON_META[w].css } : undefined}>
              {WEAPON_META[w].label}
            </span>{' '}
            {lock ? `◉ ${targetTag(lock)}` : 'idle'}
          </div>
        );
      })}
      <div className={pending.repair || state.kraken.repair ? 'oc-set' : 'oc-unset'}>
        {state.kraken.repair
          ? `Repairing ${state.kraken.repair.system}`
          : pending.repair
            ? `Repair → ${pending.repair}`
            : 'No repair'}
      </div>
      <div className={pending.deploySmoke ? 'oc-set' : 'oc-unset'}>
        {pending.deploySmoke ? 'Smoke ready to pop' : 'Smoke held'}
      </div>
    </div>
  );
}
