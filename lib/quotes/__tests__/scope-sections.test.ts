// Renaming a section, and saving one as a reusable preset.
//
// The two invariants worth pinning: a rename is a RELABEL (every line keeps its
// id and its price, and none of them are left pointing at the old heading), and
// a preset never re-quotes an old margin — only a deliberately overridden sell
// price survives the round trip.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyScope, newScopeLine, newPackage, renameScopeSection, scopeSectionNames,
  type QuoteScope,
} from '../scope'
import {
  parsePresetPayload, presetSectionName, presetToScopeLines, sectionToPreset,
} from '../scope-presets'

function scopeWith(): QuoteScope {
  const s = emptyScope({ sections: ['Materials', 'Compliance'] })
  s.lines = [
    { ...newScopeLine('Materials'), id: 'a', sku: 'CB-63', description: 'Breaker', qty: 2, unitCostR: 100, unitSellR: 115 },
    { ...newScopeLine('Materials'), id: 'b', description: 'Cable', qty: 10, unitCostR: 20, unitSellR: 30, sellOverridden: true },
    { ...newScopeLine('Compliance'), id: 'c', description: 'COC', qty: 1, unitCostR: 0, unitSellR: 1500, sellOverridden: true },
  ]
  return s
}

test('rename moves the heading and every line under it, and nothing else', () => {
  const next = renameScopeSection(scopeWith(), null, 'Materials', 'Board parts')
  assert.ok(next)
  // Order is preserved — the renamed section stays where it was.
  assert.deepEqual(next.sections, ['Board parts', 'Compliance'])
  assert.deepEqual(next.lines.map((l) => l.section), ['Board parts', 'Board parts', 'Compliance'])
  // Same lines: same ids, same prices, same overrides.
  assert.deepEqual(next.lines.map((l) => l.id), ['a', 'b', 'c'])
  assert.equal(next.lines[1].unitSellR, 30)
  assert.equal(next.lines[1].sellOverridden, true)
})

test('rename is refused when it would blank or merge a section', () => {
  const scope = scopeWith()
  assert.equal(renameScopeSection(scope, null, 'Materials', '   '), null)
  assert.equal(renameScopeSection(scope, null, 'Materials', 'Compliance'), null)
  assert.equal(renameScopeSection(scope, null, 'Materials', 'compliance'), null)
})

test('re-casing a section is not a clash with itself', () => {
  const next = renameScopeSection(scopeWith(), null, 'Materials', 'materials')
  assert.ok(next)
  assert.deepEqual(next.sections, ['materials', 'Compliance'])
  assert.equal(next.lines.filter((l) => l.section === 'materials').length, 2)
})

test('rename touches one package only — the same name elsewhere is left alone', () => {
  const scope = scopeWith()
  const pkg = { ...newPackage(), id: 'pkg-1', sections: ['Materials'] }
  scope.packages = [pkg]
  scope.lines.push({ ...newScopeLine('Materials', 'material', 'pkg-1'), id: 'd', description: 'Trunking' })

  const next = renameScopeSection(scope, 'pkg-1', 'Materials', 'Containment')
  assert.ok(next)
  assert.deepEqual(next.packages[0].sections, ['Containment'])
  assert.equal(next.lines.find((l) => l.id === 'd')?.section, 'Containment')
  // The quote's own Materials section is a different section and stays put.
  assert.deepEqual(next.sections, ['Materials', 'Compliance'])
  assert.equal(next.lines.find((l) => l.id === 'a')?.section, 'Materials')
})

test('a straggler section renames off its lines even with nothing declared', () => {
  const scope = scopeWith()
  scope.sections = ['Compliance']
  assert.deepEqual(scopeSectionNames(scope, null), ['Compliance', 'Materials'])

  const next = renameScopeSection(scope, null, 'Materials', 'Board parts')
  assert.ok(next)
  assert.deepEqual(next.sections, ['Compliance'])
  assert.equal(next.lines.filter((l) => l.section === 'Board parts').length, 2)
})

test('a preset round-trips its lines and re-derives sell at the current markup', () => {
  const payload = sectionToPreset(scopeWith(), null, 'Materials')
  assert.equal(payload.section, 'Materials')
  assert.equal(payload.lines.length, 2)

  const read = parsePresetPayload(JSON.parse(JSON.stringify(payload)))
  assert.ok(read)

  // Markup has moved to 30% since the preset was saved.
  const lines = presetToScopeLines(read, 'Materials', null, 1.3)
  assert.equal(lines[0].unitSellR, 130) // auto-priced line follows the new markup
  assert.equal(lines[1].unitSellR, 30)  // overridden price was a decision — kept
  assert.equal(lines[1].sellOverridden, true)
  assert.equal(lines[0].sku, 'CB-63')
  assert.equal(lines[0].section, 'Materials')
  assert.equal(lines[0].packageId, null)
  // Fresh ids: inserting twice gives two independent sets of items.
  const again = presetToScopeLines(read, 'Materials', null, 1.3)
  assert.notEqual(lines[0].id, again[0].id)
  assert.notEqual(lines[0].id, 'a')
})

test('an inserted preset never merges into a section already on the quote', () => {
  const payload = sectionToPreset(scopeWith(), null, 'Materials')
  assert.equal(presetSectionName(payload, ['Compliance']), 'Materials')
  assert.equal(presetSectionName(payload, ['Materials', 'Compliance']), 'Materials 2')
  assert.equal(presetSectionName(payload, ['Materials', 'Materials 2']), 'Materials 3')
  // A preset saved with no section name falls back to what it was called.
  assert.equal(presetSectionName({ ...payload, section: '' }, [], 'Standard COC'), 'Standard COC')
})

test('a preset with unreadable lines is read as far as it goes, not dropped', () => {
  const read = parsePresetPayload({
    section: 'Materials',
    lines: [null, { description: 'Cable', qty: '4', unit: 'm', unitCostR: 12 }],
  })
  assert.ok(read)
  assert.equal(read.lines.length, 1)
  assert.equal(read.lines[0].qty, 4)
  assert.equal(read.lines[0].unit, 'm')
  assert.equal(read.lines[0].kind, 'material')
  assert.equal(parsePresetPayload({ section: 'x' }), null)
})
