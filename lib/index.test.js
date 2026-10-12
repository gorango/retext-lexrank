import fs from 'node:fs'
import path from 'node:path'
import { assert, expect, it } from 'vitest'
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import { VFile } from 'vfile'
import pos from 'retext-pos'
import keywords from 'retext-keywords'
import latin from 'retext-latin'
import lexrank from '../index.js'

const root = path.join('fixtures')

/**
 * Run text through the plugin and return sentence scores in document order.
 *
 * @param {string} text
 * @param {Record<string, unknown>} [options]
 * @returns {Promise<number[]>}
 */
async function scoreText(text, options) {
  const file = new VFile({ value: text })
  const processor = unified().use(latin).use(lexrank, options)
  const tree = processor.parse(file)
  await processor.run(tree, file)

  /** @type {number[]} */
  const scores = []
  for (const paragraph of tree.children) {
    if (paragraph.type !== 'ParagraphNode') continue
    for (const sentence of paragraph.children) {
      if (sentence.type !== 'SentenceNode') continue
      scores.push(sentence.data?.lexrank ?? -1)
    }
  }
  return scores
}

/**
 * Assert two numbers are within `delta` of each other.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {string} [message]
 */
function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-3, `${message ?? ''}: ${actual} != ${expected}`)
}

it('handles fixtures', async () => {
  for (const fixture of fs.readdirSync(root)) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const processor = unified().use(latin).use(lexrank)
    const actual = processor.parse(file)
    await processor.run(actual, file)

    await expect(`${JSON.stringify(actual, null, 2)}\n`, `should work on ${fixture}`).toMatchFileSnapshot(
      path.resolve(outputPath)
    )
  }
})

it('handles retext-keywords', async () => {
  for (const fixture of fs.readdirSync(root)) {
    const inputPath = path.join(root, fixture, 'input.txt')
    const outputPath = path.join(root, fixture, 'output.json')
    const file = readSync(inputPath, 'utf-8')
    const expected = JSON.parse(fs.readFileSync(outputPath).toString())
    const processor = unified().use(latin).use(pos).use(keywords).use(lexrank)
    const actual = processor.parse(file)
    await processor.run(actual, file)

    assert.notDeepEqual(actual, expected, `should work on ${fixture}`)
  }
})

it('supports delimiter-based chunking', async () => {
  const delimiterText = 'This delimiter paragraph has many words.'
  const text = [
    'Alpha sentence has enough words for scoring.',
    delimiterText,
    'Beta sentence also has enough words for scoring.'
  ].join('\n\n')

  const file = new VFile({ value: text })
  const processor = unified().use(latin).use(lexrank, { delimiter: delimiterText })
  const actual = processor.parse(file)
  await processor.run(actual, file)

  /** @type {number[]} */
  const scores = []
  for (const paragraph of actual.children) {
    if (paragraph.type !== 'ParagraphNode') continue
    for (const sentence of paragraph.children) {
      if (sentence.type !== 'SentenceNode') continue
      scores.push(sentence.data?.lexrank ?? -1)
    }
  }

  assert.deepEqual(scores, [1, 0, 1])
})

it('balances chunk sizes when max size leaves a tiny tail', async () => {
  const paragraphs = Array.from({ length: 505 }, (_, index) =>
    `Paragraph ${index + 1} sentence has enough words for scoring.`
  )
  const text = paragraphs.join('\n\n')

  const fileA = new VFile({ value: text })
  const processorA = unified().use(latin).use(lexrank, { maxSentencesPerChunk: 500 })
  const actualA = processorA.parse(fileA)
  await processorA.run(actualA, fileA)

  const fileB = new VFile({ value: text })
  const processorB = unified().use(latin).use(lexrank, { maxSentencesPerChunk: 253 })
  const actualB = processorB.parse(fileB)
  await processorB.run(actualB, fileB)

  assert.deepEqual(actualA, actualB)
})

it('supports regex and function delimiters and empty-section flushes', async () => {
  const text = [
    '[BREAK]',
    '[BREAK]',
    'Alpha sentence has enough words for scoring.',
    'Chapter 2',
    'Beta sentence has enough words for scoring.'
  ].join('\n\n')

  const fileRegex = new VFile({ value: text })
  const treeRegex = unified().use(latin).use(lexrank, { delimiter: /^\[BREAK\]$/ }).parse(fileRegex)
  await unified().use(latin).use(lexrank, { delimiter: /^\[BREAK\]$/ }).run(treeRegex, fileRegex)

  /** @type {number[]} */
  const regexScores = []
  for (const paragraph of treeRegex.children) {
    if (paragraph.type !== 'ParagraphNode') continue
    for (const sentence of paragraph.children) {
      if (sentence.type !== 'SentenceNode') continue
      regexScores.push(sentence.data?.lexrank ?? -1)
    }
  }

  assert.equal(regexScores[0], 0)
  assert.equal(regexScores[1], 0)

  const fileFn = new VFile({ value: text })
  const treeFn = unified()
    .use(latin)
    .use(lexrank, { delimiter: (value) => value.startsWith('Chapter ') })
    .parse(fileFn)
  await unified().use(latin).use(lexrank, { delimiter: (value) => value.startsWith('Chapter ') }).run(treeFn, fileFn)

  /** @type {number[]} */
  const fnScores = []
  for (const paragraph of treeFn.children) {
    if (paragraph.type !== 'ParagraphNode') continue
    for (const sentence of paragraph.children) {
      if (sentence.type !== 'SentenceNode') continue
      fnScores.push(sentence.data?.lexrank ?? -1)
    }
  }

  assert.equal(fnScores[3], 0)
})

it('handles orphan sentence roots without crashing', async () => {
  const processor = unified().use(lexrank)
  const tree = /** @type {any} */ ({
    type: 'SentenceNode',
    children: []
  })

  const file = new VFile({ value: 'orphan' })
  await processor.run(tree, file)
  assert.ok(true)
})

it('handles sentence children under non-paragraph parents', async () => {
  const processor = unified().use(lexrank)
  const tree = /** @type {any} */ ({
    type: 'RootNode',
    children: [
      {
        type: 'SentenceNode',
        children: [
          { type: 'WordNode', children: [{ type: 'TextNode', value: 'alpha' }] },
          { type: 'WhiteSpaceNode', value: ' ' },
          { type: 'WordNode', children: [{ type: 'TextNode', value: 'beta' }] },
          { type: 'WhiteSpaceNode', value: ' ' },
          { type: 'WordNode', children: [{ type: 'TextNode', value: 'gamma' }] },
          { type: 'PunctuationNode', value: '.' }
        ]
      }
    ]
  })

  const file = new VFile({ value: 'alpha beta gamma.' })
  await processor.run(tree, file)

  assert.equal(tree.children[0].data.lexrank, 1)
})

it('supports AbortSignal to cancel processing', async () => {
  const paragraphs = Array.from({ length: 1000 }, (_, index) =>
    `Paragraph ${index + 1} sentence has enough words for scoring.`
  )
  const text = paragraphs.join('\n\n')

  const controller = new AbortController()
  const file = new VFile({ value: text })
  const processor = unified().use(latin).use(lexrank, {
    maxSentencesPerChunk: 10,
    signal: controller.signal
  })
  const actual = processor.parse(file)

  // Abort quickly to interrupt processing
  setTimeout(() => controller.abort(), 1)

  await expect(processor.run(actual, file)).rejects.toThrow()
})

it('supports onChunkProgress callback', async () => {
  const paragraphs = Array.from({ length: 20 }, (_, index) =>
    `Paragraph ${index + 1} sentence has enough words for scoring.`
  )
  const text = paragraphs.join('\n\n')

  /** @type {number[]} */
  const progressCalls = []
  const file = new VFile({ value: text })
  const processor = unified().use(latin).use(lexrank, {
    maxSentencesPerChunk: 5,
    onChunkProgress: (completed, total) => {
      progressCalls.push(completed)
    }
  })
  const actual = processor.parse(file)
  await processor.run(actual, file)

  assert.ok(progressCalls.length > 0, 'should have called progress callback')
})

it('emits onChunkProgress with correct total when section exceeds maxSentencesPerChunk before delimiter', async () => {
  const sentences = Array.from({ length: 15 }, (_, index) =>
    `Sentence ${index + 1} has enough words for scoring here.`
  )
  const text = [...sentences, '', '--- DELIMITER ---', '', 'Final sentence here for scoring.'].join('\n\n')

  /** @type {number[]} */
  const progressCalls = []
  /** @type {number[]} */
  const totalCalls = []
  const file = new VFile({ value: text })
  const processor = unified().use(latin).use(lexrank, {
    maxSentencesPerChunk: 5,
    delimiter: '--- DELIMITER ---',
    onChunkProgress: (completed, total) => {
      progressCalls.push(completed)
      totalCalls.push(total)
    }
  })
  const actual = processor.parse(file)
  await processor.run(actual, file)

  assert.ok(progressCalls.length > 0, 'should have called progress callback')
  const total = totalCalls[0]
  assert.equal(total, 4, 'should estimate 4 chunks (3 for 15 sentences + 1 for final section)')
})

it('scores two partially overlapping sentences as a tie instead of zero', async () => {
  // Before the fix the per-row min-max rescaler collapsed every 2x2 similarity
  // matrix to the identity matrix, so both sentences scored 0.
  assert.deepEqual(await scoreText('Alpha beta gamma. Alpha beta delta.'), [1, 1])
})

it('scores two disjoint sentences as a tie instead of zero', async () => {
  assert.deepEqual(await scoreText('Alpha beta gamma. One two three.'), [1, 1])
})

it('keeps a sentence with no overlap in the graph score non-zero', async () => {
  // A disconnected node should still receive teleport probability.
  const scores = await scoreText('Alpha beta gamma. Alpha beta delta. Xylophone zebra quartz.')
  assert.equal(scores.length, 3)
  closeTo(scores[0], 1, 'similar sentence A')
  closeTo(scores[1], 1, 'similar sentence B')
  closeTo(scores[2], 0.15, 'disconnected sentence')
  assert.ok(scores[2] > 0, 'disconnected sentence is genuinely scored')
})

it('does not zero uniform (boilerplate) similarity rows', async () => {
  // Every row had a single distinct value, which hit normalize()'s max === min
  // branch and returned all zeros.
  assert.deepEqual(await scoreText('Alpha beta gamma. Alpha beta gamma. Alpha beta gamma.'), [1, 1, 1])
})

it('produces a genuine spread for multi-sentence prose', async () => {
  const text = [
    'This sentence has five words in it.',
    'Here are five more words for you.',
    'Five word sentences are fine to read.',
    'But several words together become monotonous.',
    'Listen to the words that sing.'
  ].join(' ')
  const scores = await scoreText(text)
  const expected = [0.7668999117461778, 0.7668999117461778, 1, 0.4776475088410792, 0.5861101600736722]

  assert.equal(scores.length, 5)
  for (let index = 0; index < expected.length; index++) {
    closeTo(scores[index], expected[index], `sentence ${index}`)
  }
  assert.ok(
    scores.every(score => score > 0),
    'every sentence is scored'
  )
  assert.ok(
    scores.every(score => score >= 0 && score <= 1),
    'scores stay within the [0, 1] contract'
  )
  assert.equal(Math.max(...scores), 1)
})

it('scores each delimiter section independently (section-relative contract)', async () => {
  const delimiter = 'Section break has several words.'
  const text = [
    'Alpha beta gamma. Alpha beta delta.',
    delimiter,
    'Xylophone zebra quartz. Xylophone zebra quux.'
  ].join('\n\n')
  const scores = await scoreText(text, { delimiter })

  // Section 1 tie, unscored delimiter, section 2 tie.
  assert.deepEqual(scores, [1, 1, 0, 1, 1])
})
