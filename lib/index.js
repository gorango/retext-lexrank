/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('nlcst').Root} Root
 * @typedef {import('nlcst').Nodes} Nodes
 * @typedef {import('nlcst').Paragraph} Paragraph
 * @typedef {import('nlcst').Sentence} Sentence
 * @typedef {import('nlcst').SentenceContent} SentenceContent
 * @typedef {import('nlcst').Word} Word
 *
 * @typedef {(text: string, node: Paragraph) => boolean} Delimiter
 *
 * @typedef Options
 *   Plugin options.
 * @property {number | undefined} [maxSentencesPerChunk]
 *   Maximum number of sentences per chunk. Defaults to `Infinity`.
 * @property {string | RegExp | Delimiter | undefined} [delimiter]
 *   Optional chunk delimiter matcher.
 */

import { visit } from 'unist-util-visit'
import { toString as nlcstToString } from 'nlcst-to-string'
import { stemmer } from 'stemmer'

/**
 * Assign lexrank scores to sentences.
 *
 * @param {Options | undefined} [options] Plugin options.
 * @returns Transform.
 */
export default function retextLexrank(options = {}) {
  const delimiter = createDelimiterMatcher(options.delimiter)
  const maxSentencesPerChunk =
    typeof options.maxSentencesPerChunk === 'number' && options.maxSentencesPerChunk > 0
      ? options.maxSentencesPerChunk
      : Infinity

  /**
   * Transform.
   *
   * @param {Root} tree Tree.
   * @param {VFile} file File.
   * @returns {undefined} Nothing.
   */
  return function transformer(tree, file) {
    const units = extract(tree, delimiter)
    const scores = scoreByChunks(units, getKeywords(file), maxSentencesPerChunk)
    const sentences = units.flatMap(unit => unit.sentenceNodes)
    collect(/** @type {Sentence[]} */ (sentences), scores)
  }
}

/**
 * Create paragraph delimiter matcher.
 *
 * @param {Options['delimiter']} delimiter Delimiter option.
 * @returns {(text: string, node: Paragraph) => boolean} Matcher.
 */
function createDelimiterMatcher(delimiter) {
  if (!delimiter) {
    return () => false
  }

  if (typeof delimiter === 'function') {
    return (text, node) => Boolean(delimiter(text, node))
  }

  if (delimiter instanceof RegExp) {
    return (text) => {
      delimiter.lastIndex = 0
      return delimiter.test(text)
    }
  }

  return (text) => text === delimiter
}

/**
 * Get keywords from the file.
 *
 * Keywords (optionally supplied with `retext-keywords`) can yield more polarized results
 *
 * @param {VFile} file
 * @returns {string[]} Keywords str array.
 */
function getKeywords(file) {
  const keywords = file.data.keywords
  if (!keywords || !Array.isArray(keywords)) {
    return []
  }
  const arr = []
  for (let index = 0; index < keywords.length; index++) {
    const { stem, score } = keywords[index]
    const count = Math.round(score * (keywords.length - index))
    const stems = Array(count).fill(stem)
    arr.push(...stems)
  }
  return arr
}

/**
 * Collect lexrank scores.
 *
 * @param {Sentence[]} sentences
 * @param {number[]} scores
 */
function collect(sentences, scores) {
  for (let index = 0; index < sentences.length; index++) {
    const node = sentences[index]
    const data = node.data || {}
    const children = /** @type {SentenceContent[]} */ (node.children)
    const wordCount = children.filter(/** @type {Word} */ (n) => n.type === 'WordNode').length
    data.lexrank = wordCount < 3 ? 0 : scores[index]
    node.data = data
  }
}

/**
 * Calculate lexrank scores.
 *
 * @param {ExtractedUnit[]} units Extracted sentence units.
 * @param {string[]} keywords Keywords.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @returns {number[]} Scores.
 */
function scoreByChunks(units, keywords, maxSentencesPerChunk) {
  const scores = []
  let section = /** @type {ExtractedUnit[]} */ ([])
  let sectionSentenceCount = 0

  for (const unit of units) {
    if (unit.delimiter) {
      flushSection()
      for (let i = 0; i < unit.sentenceNodes.length; i++) {
        scores.push(0)
      }
      continue
    }

    section.push(unit)
    sectionSentenceCount += unit.sentences.length
  }

  flushSection()
  return scores

  function flushSection() {
    if (!section.length) {
      return
    }

    const chunks = chunkSection(section, sectionSentenceCount, maxSentencesPerChunk)
    for (const chunk of chunks) {
      const paragraphs = chunk.map(unit => unit.sentences)
      const chunkScores = score(paragraphs, keywords)
      for (let index = 0; index < chunkScores.length; index++) {
        scores.push(chunkScores[index])
      }
    }

    section = []
    sectionSentenceCount = 0
  }
}

/**
 * Calculate lexrank scores.
 *
 * @param {string[][][]} paragraphs Paragraphs with sentences with words.
 * @param {string[]} [keywords] Keywords.
 * @returns {number[]} Scores.
 */
function score(paragraphs, keywords) {
  const sentences = paragraphs.flat()
  const pScores = calculate(sentences)
  if (paragraphs.length < 4) {
    return pScores
  }
  // @ts-expect-error hush
  const sScores = paragraphs.reduce((a, p) => [...a, ...calculate(p)], [])
  // @ts-expect-error hush
  return sScores.map((sScore, i) => (sScore + pScores[i]) / 2)

  /**
   * @param {string[][]} sentences
   * @returns {number[]} Scores.
   */
  function calculate(sentences) {
    if (sentences.length === 1) {
      return [0.5]
    }
    sentences = [...sentences, ...(keywords?.length ? [keywords] : [])]
    const matrix = wordsMatrix(sentences)
    const ranked = eigenValues(matrix, sentences)
    return keywords?.length ? ranked.slice(0, -1) : ranked
  }
}

/**
 * Chunk a section using balanced target chunk size.
 *
 * @param {ExtractedUnit[]} section Units in one section.
 * @param {number} sentenceCount Sentence count in section.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @returns {ExtractedUnit[][]} Balanced chunks.
 */
function chunkSection(section, sentenceCount, maxSentencesPerChunk) {
  if (!Number.isFinite(maxSentencesPerChunk) || sentenceCount <= maxSentencesPerChunk) {
    return [section]
  }

  const chunkCount = Math.ceil(sentenceCount / maxSentencesPerChunk)
  const targetChunkSize = Math.ceil(sentenceCount / chunkCount)
  const chunks = []
  let chunk = []
  let chunkSentenceCount = 0

  for (const unit of section) {
    const unitSentenceCount = unit.sentences.length
    if (
      chunk.length > 0 &&
      chunkSentenceCount + unitSentenceCount > targetChunkSize &&
      chunks.length < chunkCount - 1
    ) {
      chunks.push(chunk)
      chunk = []
      chunkSentenceCount = 0
    }

    chunk.push(unit)
    chunkSentenceCount += unitSentenceCount
  }

  chunks.push(chunk)

  return chunks
}

/**
 * @typedef ExtractedUnit
 *   Extracted group of sentence nodes under the same parent.
 * @property {string[][]} sentences Sentences with stemmed words.
 * @property {Nodes[]} sentenceNodes Sentence nodes.
 * @property {boolean} delimiter Delimiter marker.
 *
 * Extract sentences from the tree.
 *
 * @param {Root} tree Tree
 * @param {(text: string, node: Paragraph) => boolean} isDelimiter Delimiter matcher.
 * @returns {ExtractedUnit[]} Extracted sentence units.
 */
function extract(tree, isDelimiter) {
  const units = /** @type {ExtractedUnit[]} */ ([])
  let paragraphNode = /** @type {Nodes | undefined} */ (undefined)
  let unit = /** @type {ExtractedUnit | undefined} */ (undefined)

  visit(tree, 'SentenceNode', (sentenceNode, _, parent) => {
    if (!parent) {
      return
    }

    unit = unit || { sentences: [], sentenceNodes: [], delimiter: false }

    if (parent !== paragraphNode) {
      paragraphNode = parent
      let delimiter = false
      if (parent.type === 'ParagraphNode') {
        delimiter = isDelimiter(nlcstToString(parent).trim(), parent)
      }

      unit = { sentences: [], sentenceNodes: [], delimiter }
      units.push(unit)
    }

    const words = /** @type {string[]} */ ([])
    for (const wordNode of sentenceNode.children) {
      if (wordNode.type !== 'WordNode') {
        continue
      }
      const stem = stemmer(nlcstToString(wordNode))
      const data = wordNode.data || {}
      data.stem = stem
      wordNode.data = data
      words.push(stem)
    }
    unit.sentenceNodes.push(sentenceNode)
    unit.sentences.push(words)
  })

  return units
}

/**
 * @param {number[][]} matrix
 * @param {string[][]} sentences
 * @returns {number[]} Eigen values.
 */
function eigenValues(matrix, sentences) {
  const maxIterations = 30
  const tolerance = 1e-6
  let eigen = Array(sentences.length).fill(1)
  for (let k = 0; k < maxIterations; k++) {
    const w = Array(sentences.length).fill(0)
    for (let i = 0; i < sentences.length; i++) {
      for (let j = 0; j < sentences.length; j++) {
        w[i] += matrix[i][j] * eigen[j]
      }
    }
    const next = normalize(w)
    let maxDelta = 0
    for (let i = 0; i < next.length; i++) {
      const delta = Math.abs(next[i] - eigen[i])
      if (delta > maxDelta) {
        maxDelta = delta
      }
    }
    eigen = next
    if (maxDelta < tolerance) {
      break
    }
  }
  return eigen
}

/**
 * @param {string[][]} sentences
 * @returns {number[][]} Words matrix.
 */
function wordsMatrix(sentences) {
  // return sentences.map(senA => normalize(sentences.map(senB => tanimoto(senA, senB))))
  const result = []
  for (let i = 0; i < sentences.length; i++) {
    const w = []
    for (let j = 0; j < sentences.length; j++) {
      w.push(tanimoto(sentences[i], sentences[j]))
    }
    result.push(normalize(w))
  }
  return result
}

/**
 * @param {number[]} arr
 * @returns {number[]} Normalized array.
 */
function normalize(arr) {
  const distance = Math.sqrt(arr.reduce((d, n) => d + n * n, 0))
  const l2 = arr.map(n => (distance ? n / distance : 0))
  const min = Math.min(...l2)
  const max = Math.max(...l2)

  if (max === min) {
    return l2.map(() => 0)
  }

  return l2.map(n => (n - min) / (max - min))
}

/**
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} Tanimoto coefficient.
 */
function tanimoto(a, b) {
  if (!a.length && !b.length) {
    return 0
  }

  const setA = new Set(a)
  const setB = new Set(b)
  let intersectionCount = 0

  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount += 1
    }
  }

  return intersectionCount / (setA.size + setB.size - intersectionCount) || 0
}
