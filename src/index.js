const unified = require('unified')
const latin = require('retext-latin')
const stringify = require('retext-stringify')
const visit = require('unist-util-visit')
const toString = require('nlcst-to-string')
const stemmer = require('stemmer')
const pos = require('retext-pos')
const keywords = require('retext-keywords')

module.exports = lexrank

function lexrank (options) {
  return transformer

  function transformer (tree, file) {
    const outliers = entities(file)
    const scores = score(tree, outliers)
    visit(tree, all(scores))
  }

  function entities (file) {
    const { data } = unified()
      .use(latin)
      .use(stringify)
      .use(pos)
      .use(keywords, { maximum: 6 })
      .processSync(file) || {}

    return data && data.keywords.map(({ stem, score }) => ({ stem, score }))
  }
}

function score (tree, outliers) {
  const entities = outliers.reduce((arr, { stem, score }, index) => {
    const count = Math.round(score * (outliers.length - index))
    return arr.concat(Array(count).fill(stem))
  }, [])
  const sentences = extract(tree).concat([entities])
  const matrix = wordsMatrix(sentences)
  const ranked = eigenValues(matrix, sentences).slice(0, -1)

  return ranked
}

function all (scores) {
  let index = -1

  return function patch (node, i, parent) {
    if (node.type === 'SentenceNode') {
      index = index + 1
      const data = node.data || {}
      data.lexrank = scores[index]
      node.data = data
    }
    // return node
  }
}

function extract (tree) {
  return tree.children.reduce((paragraphs, paragraph) => {
    if (paragraph.type !== 'ParagraphNode') { return paragraphs }

    return [
      ...paragraphs,
      ...paragraph.children.reduce((sentences, sentence) => {
        if (sentence.type !== 'SentenceNode') { return sentences }

        return [
          ...sentences,
          sentence.children.reduce((words, word) => {
            if (word.type !== 'WordNode') { return words }

            const string = toString(word)
            const stem = stemmer(string)

            return words.concat(stem)
          }, [])
        ]
      }, [])
    ]
  }, [])
}

function eigenValues (matrix, sentences) {
  let eigen = Array(sentences.length).fill(1)

  Array(10).fill().forEach(() => {
    let w = Array(sentences.length).fill(0)
    sentences.forEach((_, i) => sentences.forEach((_, j) => {
      w[i] = w[i] + matrix[i][j] * eigen[j]
    }))
    eigen = normalize(w)
  })

  return eigen
}

function wordsMatrix (sentences) {
  return sentences.map(sen1 => normalize(
    sentences.map(sen2 => tanimoto(sen1, sen2))
  ))
}

function normalize (arr) {
  const ratio = Math.max(...arr) / 100
  return arr.map(num => num / ratio / 100)
}

function tanimoto (a, b) {
  const [A, B] = [new Set(a), new Set(b)]
  const intersection = new Set([...A].filter(x => B.has(x)))
  const inclusion = Array.from(intersection).length
  return (inclusion / (a.length + b.length - inclusion))
}
