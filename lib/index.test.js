import fs from 'node:fs'
import path from 'node:path'
import { assert, it } from 'vitest'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import pos from 'retext-pos'
import keywords from 'retext-keywords'
import latin from 'retext-latin'
import lexrank from '../index.js'

const root = path.join('./fixtures')

it('handles fixtures', () => {
  fs.readdirSync(root).forEach(async (fixture) => {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const processor = unified().use(latin).use(lexrank)
    const actual = processor.parse(file)
    processor.run(actual, file)

    let expected
    try {
      expected = JSON.parse(fs.readFileSync(outputPath).toString())
    }
    catch (error) {
      fs.writeFileSync(outputPath, `${JSON.stringify(actual, null, 2)}\n`)
      return
    }

    assert.deepEqual(actual, expected, `should work on ${fixture}`)
  })
})

it('handles retext-keywords', () => {
  fs.readdirSync(root).forEach(async (fixture) => {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const expected = JSON.parse(fs.readFileSync(outputPath).toString())
    const processor = unified().use(latin).use(pos).use(keywords).use(lexrank)
    const actual = processor.parse(file)
    processor.run(actual, file)

    assert.notDeepEqual(actual, expected, `should work on ${fixture}`)
  })
})
