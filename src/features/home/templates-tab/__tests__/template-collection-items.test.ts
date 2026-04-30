import { describe, expect, it } from 'vitest'

import { createTestEngine } from '~/__tests__/factories'

import { buildTemplateCollectionItems } from '../template-collection-items'

describe('buildTemplateCollectionItems', () => {
  it('为引擎内置模板关联代表引擎和对应 serveUrl', () => {
    const stableEngine = createTestEngine({
      id: 'webgal-stable',
      name: 'WebGAL',
      path: '/engines/WebGAL/4.8.2',
      version: '4.8.2',
    })
    const legacyEngine = createTestEngine({
      id: 'webgal-legacy',
      name: 'WebGAL',
      path: '/engines/WebGAL/4.8.1',
      version: '4.8.1',
    })

    const items = buildTemplateCollectionItems({
      engines: [legacyEngine, stableEngine],
      resolveServeUrl: path => `serve://${path}`,
      templateGroups: [
        {
          key: 'standalone:Modern Template',
          name: 'Modern Template',
          sourceKind: 'standalone',
          sources: [
            {
              kind: 'standalone',
              templateId: 'template-1',
              name: 'Modern Template',
              path: '/templates/modern',
              createdAt: 1,
            },
          ],
        },
        {
          key: 'engineBuiltin:WebGAL',
          name: 'WebGAL',
          sourceKind: 'engineBuiltin',
          sources: [
            {
              kind: 'engineBuiltin',
              engineId: 'webgal-stable',
              engineName: 'WebGAL',
              engineVersion: '4.8.2',
              enginePath: '/engines/WebGAL/4.8.2',
              templatePath: '/engines/WebGAL/4.8.2/game/template',
              createdAt: 2,
            },
            {
              kind: 'engineBuiltin',
              engineId: 'webgal-legacy',
              engineName: 'WebGAL',
              engineVersion: '4.8.1',
              enginePath: '/engines/WebGAL/4.8.1',
              templatePath: '/engines/WebGAL/4.8.1/game/template',
              createdAt: 1,
            },
          ],
        },
      ],
    })

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      representativeEngineItem: undefined,
      templateGroup: {
        key: 'standalone:Modern Template',
      },
    })
    expect(items[1]).toMatchObject({
      representativeEngineItem: {
        engine: {
          id: 'webgal-stable',
        },
        serveUrl: 'serve:///engines/WebGAL/4.8.2',
      },
      templateGroup: {
        key: 'engineBuiltin:WebGAL',
      },
    })
  })

  it('在代表引擎缺失时保留模板项但不附带引擎图标数据', () => {
    const items = buildTemplateCollectionItems({
      engines: [],
      resolveServeUrl: () => undefined,
      templateGroups: [
        {
          key: 'engineBuiltin:WebGAL',
          name: 'WebGAL',
          sourceKind: 'engineBuiltin',
          sources: [
            {
              kind: 'engineBuiltin',
              engineId: 'missing-engine',
              engineName: 'WebGAL',
              engineVersion: '4.8.2',
              enginePath: '/engines/WebGAL/4.8.2',
              templatePath: '/engines/WebGAL/4.8.2/game/template',
              createdAt: 2,
            },
          ],
        },
      ],
    })

    expect(items).toEqual([
      expect.objectContaining({
        representativeEngineItem: undefined,
        templateGroup: expect.objectContaining({
          key: 'engineBuiltin:WebGAL',
        }),
      }),
    ])
  })
})
