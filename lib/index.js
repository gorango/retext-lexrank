/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('nlcst').Root} Root
 * @typedef {import('nlcst').Nodes} Nodes
 */

import { visit } from 'unist-util-visit'
import { toString as nlcstToString } from 'nlcst-to-string'
import { stemmer } from 'stemmer'

/**
 * Assign lexrank scores to sentences.
 *
 * @returns Transform.
 */
export default function retextLexrank() {
  /**
   * Transform.
   *
   * @param {Root} tree Tree.
   * @param {VFile} file File.
   * @returns {undefined} Nothing.
   */
  return function transformer(tree, file) {
    const { paragraphs, sentences } = extract(tree)
    const scores = score(paragraphs, getKeywords(file))
    collect(sentences, scores)
  }
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
 * @param {Nodes[]} sentences
 * @param {number[]} scores
 */
function collect(sentences, scores) {
  for (let index = 0; index < sentences.length; index++) {
    const node = sentences[index]
    if (node.type === 'SentenceNode') {
      const data = node.data || {}
      data.lexrank = node.children.length <= 6 ? 0 : scores[index]
      node.data = data
    }
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
 * Extract sentences from the tree.
 *
 * @param {Root} tree Tree
 * @returns {{paragraphs: string[][][], sentences: Nodes[]}} Paragraph words and sentence nodes.
 */
function extract(tree) {
  const paragraphs = /** @type {string[][][]} */ ([])
  const sentences = /** @type {Nodes[]} */ ([])
  let paragraphNode

  visit(tree, 'SentenceNode', (sentenceNode, _, parent) => {
    if (!parent) {
      return
    }

    if (parent !== paragraphNode) {
      paragraphNode = parent
      paragraphs.push([])
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
    sentences.push(sentenceNode)
    paragraphs[paragraphs.length - 1].push(words)
  })

  return { paragraphs, sentences }
}

/**
 * @param {number[][]} matrix
 * @param {string[][]} sentences
 * @returns {number[]} Eigen values.
 */
function eigenValues(matrix, sentences) {
  let eigen = Array(sentences.length).fill(1)
  for (let k = 0; k < 10; k++) {
    const w = Array(sentences.length).fill(0)
    for (let i = 0; i < sentences.length; i++) {
      for (let j = 0; j < sentences.length; j++) {
        w[i] += matrix[i][j] * eigen[j]
      }
    }
    eigen = normalize(w)
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
  const result = arr.map(n => (distance ? n / distance : 0))
  const [min, max] = [Math.min(...result), Math.max(...result) || 1]
  return result.map(n => (n - min) / max)
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
  const [A, B] = [new Set(a), new Set(b)]
  const intersection = new Set([...A].filter(x => B.has(x)))
  const inclusion = Array.from(intersection).length
  return inclusion / (a.length + b.length - inclusion) || 0
}
