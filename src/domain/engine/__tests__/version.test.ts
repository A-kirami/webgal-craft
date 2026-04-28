import { describe, expect, it } from 'vitest'

import { compareEngineVersions } from '../version'

describe('compareEngineVersions', () => {
  it('prefers stable release over prerelease', () => {
    expect(compareEngineVersions('1.0.0', '1.0.0-rc.1')).toBeLessThan(0)
    expect(compareEngineVersions('1.0.0-rc.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('keeps invalid versions behind valid ones', () => {
    expect(compareEngineVersions('4.8.1', 'invalid-build')).toBeLessThan(0)
    expect(compareEngineVersions('invalid-build', '4.8.1')).toBeGreaterThan(0)
  })

  it('falls back to numeric-aware locale order when both versions are invalid', () => {
    expect(compareEngineVersions('build-2', 'build-10')).toBeGreaterThan(0)
  })

  it('treats undefined and empty strings as smaller than any value', () => {
    expect(compareEngineVersions('1.0.0', undefined)).toBeLessThan(0)
    expect(compareEngineVersions(undefined, '1.0.0')).toBeGreaterThan(0)
    expect(compareEngineVersions(undefined, undefined)).toBe(0)
  })
})
