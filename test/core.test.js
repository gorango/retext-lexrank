const fs = require('fs')
const path = require('path')
const test = require('tape')
const vfile = require('to-vfile')
const unified = require('unified')
const latin = require('retext-latin')

const lexrank = require('../src')

test('Fixtures', function(t) {
  const root = path.join(__dirname, '../fixtures')

  fs.readdirSync(root)
    .forEach(async function(fixture) {
      const input = path.join(root, fixture, 'input.txt')
      const output = path.join(root, fixture, 'output.json')
      const file = vfile.readSync(input, 'utf-8')
      const processor = unified()
        .use(latin)
        .use(lexrank)

      const actual = processor.parse(file)
      processor.run(actual, file)

      let expected

      try {
        expected = JSON.parse(fs.readFileSync(output))
      } catch (error) {
        fs.writeFileSync(output, JSON.stringify(actual, null, 2) + '\n')
        return
      }

      t.deepEqual(actual, expected, 'should work on `' + fixture + '`')
    })

  t.end()
})
