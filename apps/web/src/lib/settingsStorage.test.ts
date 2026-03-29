import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultSettings, type ReaderSettings } from '../types/book'
import { loadUiSettings, saveUiSettings } from './settingsStorage'

const KEY = 'progressive-reader-settings-v1'

describe('settingsStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('loadUiSettings', () => {
    it('returns defaults when key missing', () => {
      const s = loadUiSettings()
      expect(s).toEqual({ ...defaultSettings })
    })

    it('round-trips valid saved settings', () => {
      const custom: ReaderSettings = {
        ...defaultSettings,
        theme: 'dark',
        learnWordCap: 250,
      }
      saveUiSettings(custom)
      expect(loadUiSettings()).toEqual(custom)
    })

    it('merges partial JSON with defaults', () => {
      localStorage.setItem(KEY, JSON.stringify({ theme: 'light' }))
      const s = loadUiSettings()
      expect(s.theme).toBe('light')
      expect(s.learnWordCap).toBe(defaultSettings.learnWordCap)
    })

    it('falls back to defaults on invalid JSON', () => {
      localStorage.setItem(KEY, '{not json')
      expect(loadUiSettings()).toEqual({ ...defaultSettings })
    })

    it('clamps learnWordCap below 1 up to 1', () => {
      localStorage.setItem(KEY, JSON.stringify({ learnWordCap: 0 }))
      expect(loadUiSettings().learnWordCap).toBe(1)
    })

    it('clamps learnWordCap above 5000 down to 5000', () => {
      localStorage.setItem(KEY, JSON.stringify({ learnWordCap: 9000 }))
      expect(loadUiSettings().learnWordCap).toBe(5000)
    })

    it('uses default learnWordCap when value is NaN or non-finite', () => {
      localStorage.setItem(KEY, JSON.stringify({ learnWordCap: NaN }))
      expect(loadUiSettings().learnWordCap).toBe(defaultSettings.learnWordCap)
      localStorage.setItem(KEY, JSON.stringify({ learnWordCap: Number.POSITIVE_INFINITY }))
      expect(loadUiSettings().learnWordCap).toBe(defaultSettings.learnWordCap)
    })
  })

  describe('saveUiSettings', () => {
    it('persists to localStorage', () => {
      saveUiSettings({ ...defaultSettings, fontSizePx: 22 })
      const raw = localStorage.getItem(KEY)
      expect(raw).toBeTruthy()
      expect(JSON.parse(raw!).fontSizePx).toBe(22)
    })
  })
})
