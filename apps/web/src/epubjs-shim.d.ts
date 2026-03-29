declare module 'epubjs' {
  interface SpineItem {
    load(fn: (url: string) => Promise<unknown>): Promise<void>
    document: Document | null
    href?: string
  }
  interface Spine {
    length: number
    get(index: number): SpineItem
  }
  interface EpubBook {
    /** Resolves when manifest, spine, metadata, etc. are loaded (Promise, not a function). */
    ready: Promise<void>
    packaging: { metadata: { title?: string } }
    spine: Spine
    load(url: string): Promise<unknown>
  }
  export default function ePub(src: ArrayBuffer | string | Uint8Array): EpubBook
}
