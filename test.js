import fs from 'fs'
import path from 'path'
import test from 'tape'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import latin from 'retext-latin'

import lexrank from './src/index.js'

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

    t.deepLooseEqual(actual, expected, 'should work on `' + fixture + '`')
  })

  t.end()
})
