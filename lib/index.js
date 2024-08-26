/**
 * @typedef {import('vfile').VFile} VFile
 * @typedef {import('nlcst').Root} Root
 * @typedef {import('nlcst').Nodes} Nodes
 */

import { visit } from 'unist-util-visit'
import { toString } from 'nlcst-to-string'
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
    const scores = score(tree, getKeywords(file))
    visit(tree, collect(scores))
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
 * @param {number[]} scores
 */
function collect(scores) {
  let index = -1
  /**
   * @param {Nodes} node
   */
  return (node) => {
    if (node.type === 'SentenceNode') {
      index = index + 1
      const data = node.data || {}
      data.lexrank = node.children.length <= 6 ? 0 : scores[index]
      node.data = data
    }
  }
}

/**
 * Calculate lexrank scores.
 *
 * @param {Root} tree Tree.
 * @param {string[]} [keywords] Keywords.
 * @returns {number[]} Scores.
 */
function score(tree, keywords) {
  const paragraphs = extract(tree)
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
 * @returns {string[][][]} Paragraphs with sentences with words.
 */
function extract(tree) {
  const paragraphs = /** @type {string[][][]} */ ([])
  for (const paragraphNode of tree.children) {
    if (paragraphNode.type !== 'ParagraphNode') {
      continue
    }
    const sentences = /** @type {string[][]} */ ([])
    for (const sentenceNode of paragraphNode.children) {
      if (sentenceNode.type !== 'SentenceNode') {
        continue
      }
      const words = /** @type {string[]} */ ([])
      for (const wordNode of sentenceNode.children) {
        if (wordNode.type !== 'WordNode') {
          continue
        }
        const stem = stemmer(toString(wordNode))
        const data = wordNode.data || {}
        data.stem = stem
        wordNode.data = data
        words.push(stem)
      }
      sentences.push(words)
    }
    paragraphs.push(sentences)
  }
  return paragraphs
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
