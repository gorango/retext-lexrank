import { visit } from 'unist-util-visit'
import { toString } from 'nlcst-to-string'
import { stemmer } from 'stemmer'

export default lexrank

function lexrank() {
  return transformer

  function transformer(tree, file) {
    const scores = score(tree, getKeywords(file))
    visit(tree, collect(scores))
  }
}

// keywords (optionally supplied with `retext-keywords`) yields more polarized results
function getKeywords(file) {
  return (file.data?.keywords || []).reduce((arr, { stem, score }, index, keywords) => {
    const count = Math.round(score * (keywords.length - index))
    return arr.concat(Array(count).fill(stem))
  }, [])
}

function collect(scores) {
  let index = -1

  return node => {
    if (node.type === 'SentenceNode') {
      index = index + 1
      const data = node.data || {}
      data.lexrank = scores[index]
      node.data = data
    }
  }
}

function score(tree, keywords) {
  const paragraphs = extract(tree)
  const sentences = flatten(paragraphs)
  const pScores = calculate(sentences)

  if (paragraphs.length < 7) {
    return pScores
  }

  const sScores = flatten(paragraphs.map(calculate))
  return sScores.map((sScore, i) => (sScore + pScores[i]) / 2)

  function calculate(sentences) {
    if (sentences.length === 1) return [0.5]
    sentences = [...sentences, ...(keywords.length ? [keywords] : [])]
    const matrix = wordsMatrix(sentences)
    const ranked = eigenValues(matrix, sentences)
    return keywords.length ? ranked.slice(0, -1) : ranked
  }
}

function extract(tree) {
  return tree.children.reduce((paragraphs, node) => {
    if (node.type !== 'ParagraphNode') {
      return paragraphs
    }

    return [
      ...paragraphs,
      node.children.reduce((sentences, node) => {
        if (node.type !== 'SentenceNode') {
          return sentences
        }

        return [
          ...sentences,
          node.children.reduce((words, node) => {
            if (node.type !== 'WordNode') {
              return words
            }

            return words.concat(stemmer(toString(node)))
          }, [])
        ]
      }, [])
    ]
  }, [])
}

function eigenValues(matrix, sentences) {
  let eigen = Array(sentences.length).fill(1)

  Array(10)
    .fill()
    .forEach(() => {
      let w = Array(sentences.length).fill(0)
      sentences.forEach((_, i) =>
        sentences.forEach((_, j) => {
          w[i] = w[i] + matrix[i][j] * eigen[j]
        })
      )
      eigen = normalize(w)
    })

  return eigen
}

function wordsMatrix(sentences) {
  return sentences.map(senA => normalize(sentences.map(senB => tanimoto(senA, senB))))
}

function normalize(arr) {
  const distance = Math.sqrt(arr.reduce((d, n) => d + n * n, 0))
  const result = arr.map(n => (distance ? n / distance : 0))
  const [min, max] = [Math.min(...result), Math.max(...result) || 1]
  return result.map(n => (n - min) / max)
}

function tanimoto(a, b) {
  if (!a.length && !b.length) return 0

  const [A, B] = [new Set(a), new Set(b)]
  const intersection = new Set([...A].filter(x => B.has(x)))
  const inclusion = Array.from(intersection).length
  return inclusion / (a.length + b.length - inclusion) || 0
}

function flatten(arr) {
  return arr.reduce((a, b) => [...a, ...b], [])
}
