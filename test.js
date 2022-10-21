import fs from 'fs'
import path from 'path'
import test from 'tape'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import pos from 'retext-pos'
import keywords from 'retext-keywords'
import latin from 'retext-latin'
import lexrank from './index.js'

const root = path.join('./fixtures')

test('Fixtures', function (t) {
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

    t.deepLooseEqual(actual, expected, `should work on ${fixture}`)
  })

  t.end()
})

test('Using retext-keywords for a different result', function (t) {
  fs.readdirSync(root).forEach(async function (fixture) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const expected = JSON.parse(fs.readFileSync(outputPath))
    const processor = unified().use(latin).use(pos).use(keywords).use(lexrank)
    const actual = processor.parse(file)
    processor.run(actual, file)

    t.notDeepLooseEqual(actual, expected, `should work on ${fixture}`)
  })
  t.end()
})
