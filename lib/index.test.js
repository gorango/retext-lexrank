import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assert, expect, it } from 'vitest'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import pos from 'retext-pos'
import keywords from 'retext-keywords'
import latin from 'retext-latin'
import lexrank from '../index.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '../fixtures')

it('handles fixtures', async () => {
  for (const fixture of fs.readdirSync(root)) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const processor = unified().use(latin).use(lexrank)
    const actual = processor.parse(file)
    processor.runSync(actual, file)

    await expect(
      `${JSON.stringify(actual, null, 2)}\n`,
      `should work on ${fixture}`
    ).toMatchFileSnapshot(outputPath)
  }
})

it('handles retext-keywords', () => {
  for (const fixture of fs.readdirSync(root)) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const expected = JSON.parse(fs.readFileSync(outputPath).toString())
    const processor = unified().use(latin).use(pos).use(keywords).use(lexrank)
    const actual = processor.parse(file)
    processor.runSync(actual, file)

    assert.notDeepEqual(actual, expected, `should work on ${fixture}`)
  }
})
