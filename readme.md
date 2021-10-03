# Retext Lexrank

[![Build][build-badge]][build]
[![Coverage][coverage-badge]][coverage]
[![Size][size-badge]][size]

[Retext][retext] plugin for generating unsupervised text summarization using the [Lexrank algorithm][paper].

## Install

```
npm i --save retext-lexrank
```

# Use

<!-- prettier-ignore -->
```js
import { unified } from 'unified'
import latin from 'retext-latin'
import lexrank from 'retext-lexrank'

const processor = unified()
  .use(latin)
  .use(lexrank)

const file = '...' // vfile or text string
const tree = processor.parse(file)

processor.run(tree, file)
```

# Example

> **Disclaimer**
>
> The `retext-lexrank` plugin works best on medium-to-long samples of text, like web articles, blogs, and essays. The following is not a perfect example.

We'll use the classic [wooorm/write-music][write-music] example from the [unifiedjs use-cases][unified-case].

### Write Music (by [Gary Provost](garyprovost.com))

```txt
This sentence has five words. Here are five more words.
Five word sentences are fine. But several together
become monotonous. Listen to what is happening. The
writing is getting boring. The sound of it drones. It's
like a stuck record. The ear demands some variety.

Now listen. I vary the sentence length, and I create
music. Music. The writing sings. It has a pleasant
rhythm, a lilt, a harmony. I use short sentences. And I
use sentences of medium length. And sometimes when I am
certain the reader is rested, I will engage him with a
sentence of considerable length, a sentence that burns
with energy and builds with all the impetus of a
crescendo, the roll of the drums, the crash of the
cymbals—sounds that say listen to this, it is important.

So write with a combination of short, medium, and long
sentences. Create a sound that pleases the reader's ear.
Don't just write words. Write music.
```

Supplying the above text to the [`processor`](#use), we can then find the top-ranked sentences:

```js
import { selectAll } from 'unist-util-select'
import { toString } from 'nlcst-to-string'

selectAll('SentenceNode', tree)
  .sort(({ data: { lexrank: a } }, { data: { lexrank: b } }) => b - a)
  .slice(0, 3)
  .forEach(sentence => {
    const score = sentence.data.lexrank.toFixed(2)
    console.log(`[${score}]: ${toString(sentence)}`)
  })
```

Running the above yields:

```
[1.00]: I vary the sentence length, and I create music.
[0.85]: And I use sentences of medium length.
[0.71]: So write with a combination of short, medium, and long sentences.
```

# Tests

Run `npm test` to run tests.

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
[retext]: https://github.com/retextjs/retext
[pos]: https://github.com/retextjs/retext-pos
[unified-case]: https://unifiedjs.com/community/case/
[write-music]: https://wooorm.com/write-music/
[license]: license
[author]: https://github.com/gorango
