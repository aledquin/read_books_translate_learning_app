/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional email for higher MyMemory free-tier daily quota (see MyMemory docs). */
  readonly VITE_MYMEMORY_EMAIL?: string
}
