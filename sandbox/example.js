// const inspect = require('unist-util-inspect')
const vfile = require('to-vfile')
const unified = require('unified')
const latin = require('retext-latin')
const pos = require('retext-pos')
const keywords = require('retext-keywords')

const lexrank = require('../src')

const processor = unified()
  .use(latin)
  // .use(pos)
  // .use(keywords)
  .use(lexrank)

const file = vfile.readSync('fixtures/onezero_ai-listening-ethics/input.txt')
const tree = processor.parse(file)

processor.run(tree, file)

// console.log(inspect(tree))

const ranks = getRanks(tree)

const top = ranks.sort().slice(- Math.round(ranks.length * .2))
const mid = ranks.sort().slice(Math.round(ranks.length * .3), - Math.round(ranks.length * .3))
const bot = ranks.sort().slice(0, Math.round(ranks.length * .2))

// console.log(Math.max(...top) - Math.min(...top))
// console.log(Math.max(...mid) - Math.min(...mid))
// console.log(Math.max(...bot) - Math.min(...bot))
console.log(ranks)

function getRanks (tree) {
  let data = []

  tree.children.forEach(node => {
    if (node.type === 'ParagraphNode') {
      node.children.forEach(node => {
        if (node.type === 'SentenceNode') {
          data.push(node.data.lexrank)
        }
      })
    }
  })

  return data
}

function one (node) {
  if (node.type === 'SentenceNode') {
    data.push(node.data.lexrank)
  } else {
    if (node.children) {
      node.children.forEach(one)
    }
  }
}
