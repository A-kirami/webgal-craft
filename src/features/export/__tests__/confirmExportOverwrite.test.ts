import { describe, expect, it, vi } from 'vitest'

import { confirmExportOverwrite } from '../confirmExportOverwrite'

vi.mock('~/stores/modal', () => ({
  useModalStore: vi.fn(),
}))

describe('confirmExportOverwrite', () => {
  it.each([
    ['onConfirm', true],
    ['onCancel', false],
  ] as const)('通过 %s 返回用户选择', async (handler, expected) => {
    const open = vi.fn()
    const pending = confirmExportOverwrite(
      '/exports/Demo',
      (key, values) => values?.path ? `${key}:${values.path}` : key,
      { open },
    )

    expect(open).toHaveBeenCalledWith('AlertModal', expect.objectContaining({
      cancelText: 'common.cancel',
      confirmText: 'export.overwrite.confirm',
      content: 'export.overwrite.description:/exports/Demo',
      title: 'export.overwrite.title',
      type: 'danger',
    }), expect.stringMatching(/^export-overwrite-/))

    open.mock.calls[0][1][handler]()
    await expect(pending).resolves.toBe(expected)
  })
})
