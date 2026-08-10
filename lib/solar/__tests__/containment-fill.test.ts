import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assessContainment, kindFromRouteType, SPACE_FACTOR, TRUNKING_SIZES,
  type ContainmentRun,
} from '../containment-fill'
import { containmentChecks } from '../containment-fill'
import { C_VALUES, K_VALUES } from '../../sans/tables/conduit-fill'

function run(patch: Partial<ContainmentRun> = {}): ContainmentRun {
  return {
    key: 'k', label: 'Roof → DB', kind: 'conduit', shared: true,
    conduitMm: null, widthMm: null, heightMm: null, lengthM: 12,
    conductors: [],
    ...patch,
  }
}

// ── route type → wireway kind ────────────────────────────────────────────────

test('route types map to the right wireway (and open routes to none)', () => {
  assert.equal(kindFromRouteType('In conduit (surface)'), 'conduit')
  assert.equal(kindFromRouteType('Down wall (conduit)'), 'conduit')
  assert.equal(kindFromRouteType('Open trunking'), 'trunking')
  assert.equal(kindFromRouteType('Overhead (open)'), null)
  assert.equal(kindFromRouteType('Underground (direct burial)'), null)
  assert.equal(kindFromRouteType(''), null)
})

// ── conduit: the C/K method of 6.5.6.2.2 ─────────────────────────────────────

test('conduit ΣC is the tabulated table 6.23 sum and picks the smallest conduit that fits', () => {
  // 4× 2.5 mm² (C 14) + 2× 4 mm² (C 17) = 56 + 34 = 90 → exactly K for 20 mm.
  const a = assessContainment(run({
    conductors: [
      { cableLabel: 'AC', sizeMm2: 2.5, count: 4, pv: false },
      { cableLabel: 'AC', sizeMm2: 4, count: 2, pv: false },
    ],
  }))
  assert.equal(a.totalC, 4 * C_VALUES[2.5] + 2 * C_VALUES[4])
  assert.equal(a.totalC, 90)
  assert.equal(a.recommendedConduitMm, 20)
  assert.equal(K_VALUES[20], 90)
  assert.equal(a.conductorCount, 6)
})

test('an undersized conduit on a shared run is flagged over-full', () => {
  // 8× 6 mm² = 8 × 22 = 176 → needs 32 mm (K 240); 25 mm (K 144) is too small.
  const a = assessContainment(run({
    conduitMm: 25,
    conductors: [{ cableLabel: 'DC string', sizeMm2: 6, count: 8, pv: true }],
  }))
  assert.equal(a.totalC, 176)
  assert.equal(a.recommendedConduitMm, 32)
  assert.equal(a.status, 'over')
  assert.match(a.detail, /too small/)
})

test('a correctly sized conduit passes, and the exact-fit size reads as tight', () => {
  const conductors = [{ cableLabel: 'DC string', sizeMm2: 6, count: 8, pv: true }]
  assert.equal(assessContainment(run({ conduitMm: 40, conductors })).status, 'ok')
  assert.equal(assessContainment(run({ conduitMm: 32, conductors })).status, 'tight')
})

test('no conduit size chosen yet is info-level, not a failure, and states the minimum', () => {
  const a = assessContainment(run({
    conductors: [{ cableLabel: 'AC', sizeMm2: 2.5, count: 4, pv: false }],
  }))
  assert.equal(a.status, 'unsized')
  assert.equal(a.recommendedConduitMm, 20)
  assert.match(a.detail, /at least 20 mm/)
})

test('a bundle too big for 50 mm conduit says split the run', () => {
  const a = assessContainment(run({
    conduitMm: 50,
    conductors: [{ cableLabel: 'Battery', sizeMm2: 70, count: 6, pv: false }],
  }))
  assert.equal(a.totalC, 6 * C_VALUES[70])
  assert.ok(a.totalC! > K_VALUES[50])
  assert.equal(a.recommendedConduitMm, null)
  assert.equal(a.status, 'over')
  assert.match(a.detail, /split/)
})

test('a conductor size outside table 6.23 is reported honestly, not guessed', () => {
  const a = assessContainment(run({
    conduitMm: 50,
    conductors: [{ cableLabel: 'Feed', sizeMm2: 95, count: 3, pv: false }],
  }))
  assert.equal(a.totalC, null)
  assert.equal(a.status, 'unsized')
  assert.match(a.detail, /outside table 6\.23/)
})

// ── trunking / ducting: the area method of 6.5.6.3 ───────────────────────────

test('trunking uses the 45 % space factor and ducting 35 %', () => {
  assert.equal(SPACE_FACTOR.trunking, 45)
  assert.equal(SPACE_FACTOR.ducting, 35)
  assert.equal(SPACE_FACTOR.conduit, 40)

  const conductors = [{ cableLabel: 'AC', sizeMm2: 6, count: 10, pv: false }]
  const t = assessContainment(run({ kind: 'trunking', widthMm: 50, heightMm: 50, conductors }))
  const d = assessContainment(run({ kind: 'ducting', widthMm: 50, heightMm: 50, conductors }))
  assert.equal(t.limitPct, 45)
  assert.equal(d.limitPct, 35)
  assert.equal(t.wirewayAreaMm2, 2500)
  // Same cables, same box — the stricter limit is the one that can fail first.
  assert.equal(t.fillPct, d.fillPct)
})

test('over-full trunking names a size that clears the space factor', () => {
  const a = assessContainment(run({
    kind: 'trunking', widthMm: 25, heightMm: 16,
    conductors: [{ cableLabel: 'AC', sizeMm2: 10, count: 12, pv: false }],
  }))
  assert.equal(a.status, 'over')
  assert.ok(a.fillPct! > 45)
  assert.ok(a.recommendedTrunking)
  const rec = a.recommendedTrunking!
  assert.ok((a.cableAreaMm2 / (rec.widthMm * rec.heightMm)) * 100 <= 45)
  assert.ok(TRUNKING_SIZES.some((s) => s.widthMm === rec.widthMm && s.heightMm === rec.heightMm))
})

test('PV cable is counted fatter than building wire of the same copper size', () => {
  const pv = assessContainment(run({
    kind: 'trunking', widthMm: 50, heightMm: 50,
    conductors: [{ cableLabel: 'DC', sizeMm2: 6, count: 4, pv: true }],
  }))
  const pvc = assessContainment(run({
    kind: 'trunking', widthMm: 50, heightMm: 50,
    conductors: [{ cableLabel: 'AC', sizeMm2: 6, count: 4, pv: false }],
  }))
  assert.ok(pv.cableAreaMm2 > pvc.cableAreaMm2)
})

// ── compliance rows ──────────────────────────────────────────────────────────

test('a shared over-full run blocks; the same overflow on a lone cable only warns', () => {
  const conductors = [{ cableLabel: 'DC string', sizeMm2: 6, count: 8, pv: true }]
  const shared = containmentChecks([assessContainment(run({ conduitMm: 25, conductors }))])
  const lone = containmentChecks([assessContainment(run({ conduitMm: 25, shared: false, conductors }))])
  assert.equal(shared[0].status, 'blocker')
  assert.equal(lone[0].status, 'warning')
  assert.match(shared[0].reference, /6\.5\.6\.2\.2/)
})

test('trunking rows cite 6.5.6.3 and admit the estimate', () => {
  const [check] = containmentChecks([assessContainment(run({
    kind: 'trunking', widthMm: 100, heightMm: 50,
    conductors: [{ cableLabel: 'AC', sizeMm2: 4, count: 6, pv: false }],
  }))])
  assert.match(check.reference, /6\.5\.6\.3/)
  assert.match(check.detail, /Estimated from typical overall cable diameters/)
})

test('checks come back loudest-first so the collapsed chip counts the right thing', () => {
  const ordered = containmentChecks([
    assessContainment(run({ key: 'a', conduitMm: 40, conductors: [{ cableLabel: 'x', sizeMm2: 2.5, count: 2, pv: false }] })),
    assessContainment(run({ key: 'b', conduitMm: 20, conductors: [{ cableLabel: 'y', sizeMm2: 10, count: 6, pv: false }] })),
  ])
  assert.equal(ordered[0].status, 'blocker')
  assert.equal(ordered[1].status, 'pass')
})
