export { default } from './lib/index.js'

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
