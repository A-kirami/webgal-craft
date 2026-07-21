import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { querySentenceResourceReferences } from '~/features/editor/command-registry/diagnostics'

import { createEmptyAssetReferenceIndexSnapshot, rebuildReferenceSource } from '../references'

const { readTextFileMock } = vi.hoisted(() => ({ readTextFileMock: vi.fn() }))

vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: readTextFileMock }))

describe('rebuildReferenceSource', () => {
  beforeEach(() => {
    readTextFileMock.mockReset()
  })

  it('从场景中的 setAnimation 建立动画资源引用', async () => {
    readTextFileMock.mockResolvedValue('setAnimation:effects/fade;')
    const gamePath = AbsPath.from('/project')
    const sourcePath = AbsPath.from('/project/game/scene/start.txt')

    const result = await rebuildReferenceSource(
      createEmptyAssetReferenceIndexSnapshot(),
      gamePath,
      sourcePath,
      querySentenceResourceReferences,
    )

    expect(result.failures).toEqual([])
    expect(result.snapshot.records).toEqual([{
      sourcePath,
      sourceKind: 'scene',
      assetKey: {
        root: 'asset',
        assetType: 'animation',
        relativePath: 'effects/fade.json',
      },
      fieldKey: '__content__',
      statementId: 1,
    }])
  })
})
