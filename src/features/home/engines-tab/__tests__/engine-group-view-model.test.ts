import { describe, expect, it } from 'vitest'

import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import { buildEngineGroupCollectionItems } from '../engine-group-view-model'

describe('buildEngineGroupCollectionItems', () => {
  it('使用最新的可用版本作为代表项', () => {
    const items = buildEngineGroupCollectionItems({
      defaultEngineId: 'open-webgal.webgal',
      engines: [
        createTestEngine({
          id: 'legacy',
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          path: AbsPath.from('/engines/WebGAL/4.4.0'),
          version: '4.4.0',
          metadata: {
            description: 'legacy build',
          },
        }),
        createTestEngine({
          id: 'broken-latest',
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          path: AbsPath.from('/engines/WebGAL/4.6.0'),
          version: '4.6.0',
          availability: 'broken',
          metadata: {
            description: 'broken build',
          },
        }),
        createTestEngine({
          id: 'stable',
          engineId: 'open-webgal.webgal',
          name: 'WebGAL',
          path: AbsPath.from('/engines/WebGAL/4.5.0'),
          version: '4.5.0',
          metadata: {
            description: 'stable build',
          },
        }),
      ],
      resolveServeUrl: path => `serve://${path}`,
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      isDefault: true,
      latestVersionLabel: '4.5.0',
      name: 'WebGAL',
      summary: 'stable build',
      unavailableCount: 1,
      versionCount: 3,
    })
    expect(items[0]?.representativeItem?.engine.id).toBe('stable')
    expect(items[0]?.engines.map(item => item.engine.id)).toEqual(['broken-latest', 'stable', 'legacy'])
  })

  it('保留没有可用版本的分组，并将其标记为不可用', () => {
    const items = buildEngineGroupCollectionItems({
      engines: [
        createTestEngine({
          id: 'unavailable',
          name: 'Legacy',
          path: AbsPath.from('/engines/Legacy/1.0.0'),
          version: '1.0.0',
          availability: 'broken',
          metadata: {
            description: 'legacy only',
          },
        }),
      ],
      resolveServeUrl: () => undefined,
    })

    expect(items[0]).toMatchObject({
      hasAvailableVersion: false,
      latestVersionLabel: undefined,
      summary: 'legacy only',
      versionCount: 1,
    })
    expect(items[0]?.representativeItem).toBeUndefined()
  })
})
