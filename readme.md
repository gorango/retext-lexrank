# Retext Lexrank

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Downloads][downloads-badge]][downloads]
[![Size][size-badge]][size]

NodeJS implementation of [Radev's Lexrank algorithm][paper] for unsupervised text summarization. Essentially applying PageRank to each sentence in a document and ranking each one for relevance to the entire text.

# Usage

Install from npm

```
npm i --save retext-lexrank
```

In your script:

```js
import { readSync } from 'to-vfile'
import { unified } from 'unified'
import latin from 'retext-latin'
import lexrank from 'retext-lexrank'
import inspect from 'unist-util-inspect'

const processor = unified().use(latin).use(lexrank)

const file = readSync('fixtures/nyt_predictive-algorithms-crime/input.txt')
const tree = processor.parse(file)

processor.run(tree, file)

console.log(inspect(tree))
```

# Tests

Run `npm test` to run tests in all `*.spec.js` files.

Run `npm coverage` to produce a test coverage report.

## License

[MIT][license] © [Goran Spasojevic][author]

<!-- Definitions -->

[build-badge]: https://github.com/gorango/retext-lexrank/workflows/main/badge.svg
[build]: https://github.com/gorango/retext-lexrank/actions
[coverage-badge]: https://img.shields.io/codecov/c/github/gorango/retext-lexrank.svg
[coverage]: https://codecov.io/github/gorango/retext-lexrank
[downloads-badge]: https://img.shields.io/npm/dm/retext-lexrank.svg
[downloads]: https://www.npmjs.com/package/retext-lexrank
[size-badge]: https://img.shields.io/bundlephobia/minzip/retext-lexrank.svg
[size]: https://bundlephobia.com/result?p=retext-lexrank
[paper]: http://www.jair.org/papers/paper1523.html
[license]: license
[author]: https://github.com/gorango
