import type { Paragraph, Root } from 'nlcst'
import type { VFile } from 'vfile'

export interface Options {
  /**
   * Maximum number of sentences per chunk.
   *
   * Defaults to `Infinity`.
   */
  maxSentencesPerChunk?: number | undefined

  /**
   * Optional chunk delimiter matcher.
   */
  delimiter?: string | RegExp | ((text: string, node: Paragraph) => boolean) | undefined

  /**
   * Abort signal to cancel processing between chunks.
   */
  signal?: AbortSignal | undefined

  /**
   * Callback fired after each chunk completes.
   */
  onChunkProgress?: ((completed: number, total: number) => void) | undefined
}

export default function retextLexrank(options?: Options | undefined): (
  tree: Root,
  file: VFile
) => Promise<undefined>

declare module 'nlcst' {
  interface Data {
    /**
     * Lexrank score.
     *
     * Populated by `retext-lexrank` from the document.
     */
    lexrank?: number
    stem?: string
  }
}
