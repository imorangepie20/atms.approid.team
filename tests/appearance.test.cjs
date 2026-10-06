const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/context/appearance.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText

function load(storage) {
  const exports = {}
  vm.runInNewContext(compiled, { exports, localStorage: storage })
  return exports
}

const defaults = { theme: 'dark', accentColor: 'cyan', fontSize: 'medium' }
const cases = [
  ['new browser', null, null, defaults],
  ['legacy light theme', null, 'light', { ...defaults, theme: 'light' }],
  ['legacy dark theme', null, 'dark', defaults],
  ['saved preferences', '{"theme":"system","accentColor":"pink","fontSize":"large"}', 'light',
    { theme: 'system', accentColor: 'pink', fontSize: 'large' }],
  ['malformed JSON with legacy fallback', '{broken', 'light', { ...defaults, theme: 'light' }],
  ['null JSON', 'null', null, defaults],
  ['primitive JSON', '42', null, defaults],
  ['invalid fields', '{"theme":"invalid","accentColor":"#bad","fontSize":999}', null, defaults],
  ['independent field recovery', '{"theme":"light","accentColor":"red","fontSize":false}', null,
    { ...defaults, theme: 'light', accentColor: 'red' }],
]

for (const [name, saved, legacy, expected] of cases) {
  test(name, () => {
    const preferences = load({ getItem: key => key === 'theme' ? legacy : saved }).readAppearance()
    assert.deepEqual(JSON.parse(JSON.stringify(preferences)), expected)
  })
}

test('storage denied does not stop loading', () => {
  const preferences = load({ getItem() { throw new Error('Storage denied') } }).readAppearance()
  assert.deepEqual(JSON.parse(JSON.stringify(preferences)), defaults)
})

function luminance(hex) {
  const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}

for (const color of load({ getItem: () => null }).accentColors) {
  test(`${color.label} text contrast in both themes`, () => {
    for (const [accent, foreground] of [[color.dark, '#0e1726'], [color.light, '#ffffff']]) {
      const levels = [luminance(accent), luminance(foreground)].sort((a, b) => a - b)
      const ratio = (levels[1] + 0.05) / (levels[0] + 0.05)
      assert.ok(ratio >= 4.5, `${color.label}: contrast ${ratio.toFixed(2)} must be >= 4.5`)
    }
  })
}
