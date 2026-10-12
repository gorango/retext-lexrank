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
 * @property {AbortSignal | undefined} [signal]
 *   Abort signal to cancel processing mid-chunk.
 * @property {((completed: number, total: number) => void) | undefined} [onChunkProgress]
 *   Callback fired after each chunk completes.
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
  const { signal, onChunkProgress } = options

  /**
   * Transform.
   *
   * @param {Root} tree Tree.
   * @param {VFile} file File.
   * @returns {Promise<undefined>} Nothing.
   */
  return async function transformer(tree, file) {
    const units = extract(tree, delimiter)
    const chunkCount = estimateChunkCount(units, maxSentencesPerChunk)
    const scores = await scoreByChunksAsync(
      units,
      getKeywords(file),
      maxSentencesPerChunk,
      signal,
      onChunkProgress,
      chunkCount
    )
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
    // Sentences shorter than three words (headings, list labels, fragments)
    // carry too little lexical signal for a meaningful similarity score, so
    // they are intentionally reported as unscored instead of adding noise.
    data.lexrank = wordCount < 3 ? 0 : scores[index]
    node.data = data
  }
}

/**
 * Estimate total chunk count for progress reporting.
 *
 * @param {ExtractedUnit[]} units Extracted sentence units.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @returns {number} Estimated chunk count.
 */
function estimateChunkCount(units, maxSentencesPerChunk) {
  let count = 0
  let currentSectionSentenceCount = 0

  for (const unit of units) {
    if (unit.delimiter) {
      count += countChunks(currentSectionSentenceCount, maxSentencesPerChunk)
      currentSectionSentenceCount = 0
    } else {
      currentSectionSentenceCount += unit.sentences.length
    }
  }

  return count + countChunks(currentSectionSentenceCount, maxSentencesPerChunk)
}

/**
 * Number of chunks a section of `sentenceCount` sentences is split into.
 *
 * @param {number} sentenceCount Sentence count.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @returns {number} Chunk count.
 */
function countChunks(sentenceCount, maxSentencesPerChunk) {
  if (sentenceCount <= 0) {
    return 0
  }

  return sentenceCount <= maxSentencesPerChunk
    ? 1
    : Math.ceil(sentenceCount / maxSentencesPerChunk)
}

/**
 * Calculate lexrank scores asynchronously with chunking.
 *
 * Scoring scope is deliberately **section-relative**. Every delimiter-delimited
 * section is scored on its own, and sections larger than `maxSentencesPerChunk`
 * are further split into independent chunks. Scores are therefore only
 * comparable within the same section; delimiter paragraphs are not scored and
 * are reported as `0`. A global stationary distribution over the whole document
 * would be quadratic in document length and would defeat `maxSentencesPerChunk`,
 * so scoring intentionally stays local to the unit being processed.
 *
 * @param {ExtractedUnit[]} units Extracted sentence units.
 * @param {string[]} keywords Keywords.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @param {AbortSignal | undefined} signal Abort signal.
 * @param {((completed: number, total: number) => void) | undefined} onChunkProgress Progress callback.
 * @param {number} chunkCount Total chunk count for progress.
 * @returns {Promise<number[]>} Scores.
 */
async function scoreByChunksAsync(
  units,
  keywords,
  maxSentencesPerChunk,
  signal,
  onChunkProgress,
  chunkCount
) {
  const scores = []
  let section = /** @type {ExtractedUnit[]} */ ([])
  let completedChunks = 0

  signal?.throwIfAborted()

  for (const unit of units) {
    if (unit.delimiter) {
      // Flush current section
      const sectionScores = await processSectionAsync(
        section,
        keywords,
        maxSentencesPerChunk,
        signal,
        (chunkSize) => {
          completedChunks += chunkSize
          onChunkProgress?.(completedChunks, chunkCount)
        }
      )
      scores.push(...sectionScores)
      section = []

      // Push 0 for delimiter sentences
      for (let i = 0; i < unit.sentenceNodes.length; i++) {
        scores.push(0)
      }
      continue
    }

    section.push(unit)
  }

  // Final flush
  if (section.length > 0) {
    const sectionScores = await processSectionAsync(
      section,
      keywords,
      maxSentencesPerChunk,
      signal,
      (chunkSize) => {
        completedChunks += chunkSize
        onChunkProgress?.(completedChunks, chunkCount)
      }
    )
    scores.push(...sectionScores)
  }

  return scores
}

/**
 * Process a section asynchronously in chunks.
 *
 * @param {ExtractedUnit[]} section Units in one section.
 * @param {string[]} keywords Keywords.
 * @param {number} maxSentencesPerChunk Maximum chunk size.
 * @param {AbortSignal | undefined} signal Abort signal.
 * @param {((chunkSize: number) => void) | undefined} onChunk Progress callback.
 * @returns {Promise<number[]>} Scores.
 */
async function processSectionAsync(section, keywords, maxSentencesPerChunk, signal, onChunk) {
  const sectionSentenceCount = section.flatMap(u => u.sentences).length

  if (countChunks(sectionSentenceCount, maxSentencesPerChunk) <= 1) {
    signal?.throwIfAborted()
    await new Promise(resolve => setImmediate(resolve))
    signal?.throwIfAborted()
    onChunk?.(1)
    const paragraphs = section.map(unit => unit.sentences)
    return score(/** @type {string[][][]} */ (paragraphs), keywords)
  }

  // Break into chunks and process each separately (matching original behavior)
  const chunks = chunkSection(section, sectionSentenceCount, maxSentencesPerChunk)
  const results = []

  for (let i = 0; i < chunks.length; i++) {
    signal?.throwIfAborted()

    // Yield to event loop between chunks
    await new Promise(resolve => setImmediate(resolve))

    signal?.throwIfAborted()

    const chunk = chunks[i]
    const paragraphs = chunk.map(unit => unit.sentences)
    const chunkScores = score(/** @type {string[][][]} */ (paragraphs), keywords)
    results.push(...chunkScores)
    onChunk?.(1)
  }

  return results
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
    return ensureMaxScore(pScores, sentences)
  }
  // @ts-expect-error hush
  const sScores = paragraphs.reduce((a, p) => [...a, ...calculate(p)], [])
  // @ts-expect-error hush
  const blended = sScores.map((sScore, i) => (sScore + pScores[i]) / 2)
  return ensureMaxScore(blended, sentences)

  /**
   * @param {string[][]} sentences
   * @returns {number[]} Scores.
   */
  function calculate(sentences) {
    if (sentences.length === 1) {
      return [0.5]
    }
    sentences = [...sentences, ...(keywords?.length ? [keywords] : [])]
    const similarities = wordsMatrix(sentences)
    const stochastic = rowStochastic(similarities, 0)
    const ranked = stationaryDistribution(stochastic)
    return keywords?.length ? ranked.slice(0, -1) : ranked
  }
}

/**
 * Rescale a section so its highest scoreable sentence receives `1`.
 *
 * Sentence-level scores are max-normalised on their own, so the blended section
 * score can fall below `1`. Rescaling restores the documented per-section
 * contract. Sentences below the short-sentence threshold are ignored because
 * they are reported as `0` afterwards.
 *
 * @param {number[]} scores Section scores.
 * @param {string[][]} sentences Section sentences with stemmed words.
 * @returns {number[]} Scores with the top scoreable sentence at `1`.
 */
function ensureMaxScore(scores, sentences) {
  let max = 0
  for (let index = 0; index < scores.length; index++) {
    if (sentences[index].length >= 3 && scores[index] > max) {
      max = scores[index]
    }
  }
  return max > 0 ? scores.map(score => score / max) : scores
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
  /* istanbul ignore if */
  if (!Number.isFinite(maxSentencesPerChunk) || sentenceCount <= maxSentencesPerChunk) {
    return [section]
  }

  const chunkCount = countChunks(sentenceCount, maxSentencesPerChunk)
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

    if (parent !== paragraphNode) {
      paragraphNode = parent
      let delimiter = false
      if (parent.type === 'ParagraphNode') {
        delimiter = isDelimiter(nlcstToString(parent).trim(), parent)
      }

      unit = { sentences: [], sentenceNodes: [], delimiter }
      units.push(unit)
    }

    const current = /** @type {ExtractedUnit} */ (unit)

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
    current.sentenceNodes.push(sentenceNode)
    current.sentences.push(words)
  })

  return units
}

/**
 * Compute the LexRank stationary distribution for a row-stochastic similarity
 * matrix using damped power iteration (PageRank-style).
 *
 * The damping factor guarantees convergence for any (including disconnected)
 * graph, because every node receives a share of the teleport probability.
 *
 * @param {number[][]} matrix Row-stochastic matrix.
 * @returns {number[]} Stationary distribution, scaled so the maximum is `1`.
 */
function stationaryDistribution(matrix) {
  const size = matrix.length
  const damping = 0.85
  const tolerance = 1e-6
  const maxIterations = 100
  const teleport = (1 - damping) / size
  let eigen = Array(size).fill(1 / size)

  for (let k = 0; k < maxIterations; k++) {
    const next = Array(size).fill(teleport)

    for (let i = 0; i < size; i++) {
      const weight = damping * eigen[i]
      if (weight === 0) {
        continue
      }
      const row = matrix[i]
      for (let j = 0; j < size; j++) {
        next[j] += weight * row[j]
      }
    }

    let maxDelta = 0
    for (let i = 0; i < size; i++) {
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

  return normalize(eigen)
}

/**
 * Build the pairwise Tanimoto similarity matrix.
 *
 * @param {string[][]} sentences
 * @returns {number[][]} Similarity matrix.
 */
function wordsMatrix(sentences) {
  const size = sentences.length
  const sets = sentences.map(sentence => new Set(sentence))
  const result = Array.from({ length: size }, () => Array(size).fill(0))

  for (let i = 0; i < size; i++) {
    for (let j = i; j < size; j++) {
      const value = tanimoto(sets[i], sets[j])
      result[i][j] = value
      result[j][i] = value
    }
  }

  return result
}

/**
 * Turn a similarity matrix into a row-stochastic transition matrix.
 *
 * Self-similarity is replaced with `self` (`0` here): the diagonal is always
 * the row maximum, carries no information, and would otherwise dominate the
 * random walk. Rows with no similarity to any other sentence are dangling, so
 * they are distributed uniformly to keep probability mass in the graph.
 *
 * @param {number[][]} matrix Similarity matrix.
 * @param {number} self Value used for the diagonal.
 * @returns {number[][]} Row-stochastic matrix.
 */
function rowStochastic(matrix, self) {
  const size = matrix.length
  const result = []

  for (let i = 0; i < size; i++) {
    const row = Array(size).fill(0)
    let sum = 0

    for (let j = 0; j < size; j++) {
      const value = i === j ? self : Math.max(matrix[i][j], 0)
      row[j] = value
      sum += value
    }

    result.push(sum === 0 ? Array(size).fill(1 / size) : row.map(value => value / sum))
  }

  return result
}

/**
 * Scale an array so its maximum is `1`, preserving the `[0, 1]` contract.
 *
 * The stationary distribution produced by `stationaryDistribution` is always non-negative
 * and, thanks to damping, has a positive maximum, so this is a pure rescale -
 * it never manufactures zeros (`[0, 0, ...]` inputs only occur for an empty
 * vector).
 *
 * @param {number[]} arr
 * @returns {number[]} Max-normalised array.
 */
function normalize(arr) {
  let max = 0
  for (const value of arr) {
    if (value > max) {
      max = value
    }
  }
  return max > 0 ? arr.map(value => value / max) : arr.map(() => 0)
}

/**
 * @param {Set<string>} setA
 * @param {Set<string>} setB
 * @returns {number} Tanimoto coefficient.
 */
function tanimoto(setA, setB) {
  if (!setA.size && !setB.size) {
    return 0
  }

  let intersectionCount = 0

  for (const item of setA) {
    if (setB.has(item)) {
      intersectionCount += 1
    }
  }

  return intersectionCount / (setA.size + setB.size - intersectionCount) || 0
}
