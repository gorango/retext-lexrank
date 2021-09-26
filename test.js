import fs from 'fs'
import path from 'path'
import test from 'tape'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import pos from 'retext-pos'
import keywords from 'retext-keywords'
import latin from 'retext-latin'
import lexrank from './index.js'

test('Fixtures', function (t) {
  const root = path.join('./fixtures')

  fs.readdirSync(root).forEach(async function (fixture) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const processor = unified().use(latin).use(lexrank)

    const actual = processor.parse(file)
    processor.run(actual, file)

    let expected

    try {
      expected = JSON.parse(fs.readFileSync(outputPath))
    } catch (error) {
      fs.writeFileSync(outputPath, JSON.stringify(actual, null, 2) + '\n')
      return
    }

    // compareScores(t, actual, expected, true)

    t.deepLooseEqual(actual, expected, 'should work on `' + fixture + '`')
  })

  t.end()
})

test('Use keywords', function (t) {
  const fixture = path.join('./fixtures', 'vervake')

  const inputPath = path.join(fixture, 'input.txt')
  const outputPath = path.join(fixture, 'output.json')
  const file = readSync(inputPath, 'utf-8')
  const processor = unified().use(latin).use(pos).use(keywords).use(lexrank)

  const actual = processor.parse(file)
  const expected = JSON.parse(fs.readFileSync(outputPath))
  processor.run(actual, file)

  compareScores(t, actual, expected)

  t.notDeepLooseEqual(actual, expected, 'should work on `' + fixture + '`')
  t.end()
})

function compareScores(t, actual, expected, match) {
  actual.children.forEach(({ type, children }, i) => {
    if (type === 'ParagraphNode') {
      children.forEach((child, j) => {
        if (child.type === 'SentenceNode') {
          const ascore = child.data.lexrank
          const escore = expected.children[i].children[j].data.lexrank
          t[match ? 'equal' : 'notEqual'](ascore, escore)
        }
      })
    }
  })
}
