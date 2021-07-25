import { visit } from 'unist-util-visit'
import { toString } from 'nlcst-to-string'
import { stemmer } from 'stemmer'

export default lexrank

function lexrank(options) {
  return transformer

  function transformer(tree, file) {
    /**
     * keywords (optional): supplied by retext-keywords
     * provides slightly better results
     */
    const scores = score(tree, file.data?.keywords)
    visit(tree, all(scores))
  }
}

function score(tree, keywords = []) {
  /**
   * Produce an additional sentence to add to the text,
   * containing the top keywords in proportional frequency
   */
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

  return function patch(node, i, parent) {
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
  const ratio = Math.max(...arr) / 100
  return arr.map((num) => {
    return num < ratio ? num : num / ratio / 100
    // if num < ratio, it's largely inconsequential to the top scores
    // however, applying the formula can produce numbers that fall out of `sort` range
  })
}

function tanimoto(a, b) {
  if (!a.length && !b.length) return 0

  const [A, B] = [new Set(a), new Set(b)]
  const intersection = new Set([...A].filter((x) => B.has(x)))
  const inclusion = Array.from(intersection).length
  return inclusion / (a.length + b.length - inclusion) || 0
}
