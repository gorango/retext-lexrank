import { visit } from 'unist-util-visit'
import { toString } from 'nlcst-to-string'
import { stemmer } from 'stemmer'

export default lexrank

function lexrank() {
  return transformer

  function transformer(tree, file) {
    // keywords (optionally supplied with `retext-keywords`)
    const keywords = file.data?.keywords
    const scores = score(tree, keywords)
    visit(tree, all(scores))
  }
}

function score(tree, keywords = []) {
  // using `keywords` provides slightly more polarized results
  const entities = keywords.reduce((arr, { stem, score }, index) => {
    const count = Math.round(score * (keywords.length - index))
    return arr.concat(Array(count).fill(stem))
  }, [])
  const extracted = extract(tree)
  const sentences = keywords.length ? extracted.concat([entities]) : extracted
  const matrix = wordsMatrix(sentences)
  const ranked = eigenValues(matrix, sentences)
  return keywords.length ? ranked.slice(0, -1) : ranked
}

function all(scores) {
  let index = -1

  return function (node) {
    if (node.type === 'SentenceNode') {
      index = index + 1
      const data = node.data || {}
      data.lexrank = scores[index]
      node.data = data
    }
  }
}

function extract(tree) {
  return tree.children.reduce((paragraphs, paragraph) => {
    if (paragraph.type !== 'ParagraphNode') {
      return paragraphs
    }

    return [
      ...paragraphs,
      ...paragraph.children.reduce((sentences, sentence) => {
        if (sentence.type !== 'SentenceNode') {
          return sentences
        }

        return [
          ...sentences,
          sentence.children.reduce((words, word) => {
            if (word.type !== 'WordNode') {
              return words
            }

            const string = toString(word)
            const stem = stemmer(string)

            return words.concat(stem)
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
          w[i] = w[i] + (matrix[i][j] || 0) * eigen[j]
        })
      )
      eigen = normalize(w)
    })

  return eigen
}

function wordsMatrix(sentences) {
  return sentences.map((sen1) =>
    normalize(sentences.map((sen2) => tanimoto(sen1, sen2)))
  )
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
  const intersection = new Set([...A].filter((x) => B.has(x)))
  const inclusion = Array.from(intersection).length
  return inclusion / (a.length + b.length - inclusion) || 0
}
