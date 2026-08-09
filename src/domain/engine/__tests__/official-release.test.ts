import { describe, expect, it } from 'vitest'

import {
  filterSupportedOfficialEngineReleases,
  isOfficialWebgalEngine,
  OFFICIAL_WEBGAL_ENGINE_ID,
  OFFICIAL_WEBGAL_ENGINE_NAME,
} from '../official-release'
import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '../runtime-capabilities'

describe('isOfficialWebgalEngine', () => {
  it('只识别官方 WebGAL 引擎 ID', () => {
    expect(isOfficialWebgalEngine(OFFICIAL_WEBGAL_ENGINE_ID)).toBe(true)
    expect(isOfficialWebgalEngine(OFFICIAL_WEBGAL_ENGINE_NAME)).toBe(false)
    expect(isOfficialWebgalEngine('custom.webgal')).toBe(false)
  })
})

describe('filterSupportedOfficialEngineReleases', () => {
  it('按项目最低运行时版本过滤并按版本降序排列', () => {
    const createRelease = (version: string) => ({
      assetName: `WebGAL-${version}.zip`,
      assetUrl: `https://example.com/${version}.zip`,
      engineId: OFFICIAL_WEBGAL_ENGINE_ID,
      name: OFFICIAL_WEBGAL_ENGINE_NAME,
      releaseUrl: `https://example.com/${version}`,
      sha256: 'a'.repeat(64),
      version,
    })

    const releases = filterSupportedOfficialEngineReleases([
      createRelease(MIN_WEBGAL_EDITOR_RUNTIME_VERSION),
      createRelease('1.0.0'),
    ])

    expect(releases.map(release => release.version)).toEqual([MIN_WEBGAL_EDITOR_RUNTIME_VERSION])
  })
})
