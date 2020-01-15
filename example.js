const vfile = require('to-vfile')
const report = require('vfile-reporter')
const inspect = require('unist-util-inspect')
const unified = require('unified')
const latin = require('retext-latin')

const lexrank = require('./src')

const processor = unified()
  .use(latin)
  .use(lexrank)

const file = vfile.readSync('fixtures/essay.txt')
const tree = processor.parse(file)

processor.run(tree, file)

console.log(inspect(tree))
