import { beforeEach, describe, expect, it, vi } from 'vitest'

import { editorDynamicOptionSources } from '~/features/editor/command-registry/dynamic-options'

const { readTextFileMock } = vi.hoisted(() => ({
  readTextFileMock: vi.fn<(path: string | URL) => Promise<string>>(),
}))

vi.mock(import('@tauri-apps/plugin-fs'), async importOriginal => ({
  ...await importOriginal(),
  readTextFile: readTextFileMock,
}))

function requireFigureSkinsSource() {
  const source = editorDynamicOptionSources.find(item => item.key === 'figureSkins')
  if (!source) {
    throw new TypeError('missing figureSkins source')
  }
  return source
}

describe('editorDynamicOptionSources', () => {
  beforeEach(() => {
    readTextFileMock.mockReset()
  })

  it.each([
    { format: '数组', skins: [{ name: 'winter' }, { name: 'default' }], additionalSkin: 'winter' },
    { format: '对象', skins: { summer: {}, default: {} }, additionalSkin: 'summer' },
  ])('figureSkins 从 Spine $format格式加载并排序皮肤名称', async ({ skins, additionalSkin }) => {
    readTextFileMock.mockResolvedValue(JSON.stringify({ skins }))

    await expect(requireFigureSkinsSource().loadOptions({
      gamePath: 'C:/games/demo',
      content: 'hero.json?type=spine',
    })).resolves.toEqual([
      { label: 'default', value: 'default' },
      { label: additionalSkin, value: additionalSkin },
    ])
  })
})
