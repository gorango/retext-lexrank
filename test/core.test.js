const test = require('tape')
const unified = require('unified')
const vfile = require('to-vfile')
const latin = require('retext-latin')
const { selectAll } = require('unist-util-select')

const lexrank = require('../src')

const processor = unified()
  .use(latin)
  .use(lexrank)
  .freeze()

const fixtures = [
  'essay.txt',
]

test('Scores sentiment', t => {
  for (const fixture of fixtures) {
    const path = `fixtures/${fixture}`
    const file = vfile.readSync(path)
    const tree = processor.parse(file)

    processor.run(tree, file)

    const sentences = selectAll('SentenceNode', tree)
    const ranked = sentences.reduce((hasRank, sentence) => {
      return hasRank && 'lexrank' in sentence.data
    }, true)

    t.assert(ranked, `All sentences in ${fixture} have a rank`)
  }

  t.end()
})
