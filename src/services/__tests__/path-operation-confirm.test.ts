import { describe, expect, it, vi } from 'vitest'

import { createTextMetadata } from '~/domain/document/document-model'
import { AbsPath } from '~/domain/path'
import { createPathOperationRewriteConfirm } from '~/services/path-operation-confirm'

import type { PathOperationPlan } from '~/services/path-operation'
import type { TranslatePathOperationMessage } from '~/services/path-operation-feedback'

vi.mock('~/stores/modal', () => ({
  useModalStore: vi.fn(() => ({
    open: vi.fn(),
  })),
}))

describe('createPathOperationRewriteConfirm', () => {
  const translate = ((key: string, values?: Record<string, string | number> | number) => (
    values && typeof values === 'object'
      ? `${key}:${JSON.stringify(values)}`
      : key
  )) as TranslatePathOperationMessage

  function createPlan(kind: PathOperationPlan['kind']): PathOperationPlan {
    const sourcePath = AbsPath.from('/project/game/background/bg.jpg')
    const targetPath = kind === 'rename'
      ? AbsPath.from('/project/game/background/bg-next.jpg')
      : AbsPath.from('/project/game/foreground/bg.jpg')

    return {
      kind,
      sourcePath,
      targetPath,
      rewrites: [
        {
          filePath: AbsPath.from('/project/game/scene/a.txt'),
          kind: 'scene',
          referenceCount: 2,
          before: 'a',
          after: 'b',
          source: 'disk',
          baselineRevision: {
            kind: 'disk-hash',
            hash: 'hash-a',
          },
        },
        {
          filePath: AbsPath.from('/project/game/scene/b.txt'),
          kind: 'scene',
          referenceCount: 1,
          before: 'c',
          after: 'd',
          source: 'editor-buffer',
          baselineRevision: {
            kind: 'editor-buffer',
            revision: 'rev-b',
          },
          metadata: createTextMetadata('c'),
        },
      ],
      blockedReasons: [],
      rollback: {
        files: [],
      },
    }
  }

  async function openConfirm(kind: PathOperationPlan['kind']) {
    const openMock = vi.fn()
    const confirm = createPathOperationRewriteConfirm(
      translate,
      {
        open: openMock,
      },
    )

    const prompt = confirm(createPlan(kind))
    const props = openMock.mock.calls[0]?.[1] as {
      cancelText?: string
      content?: string
      dangerText?: string
      defaultText?: string
      onCancel?: () => void
      onDanger?: () => void
      onDefault?: () => void
      title?: string
    } | undefined

    return {
      openMock,
      prompt,
      props,
    }
  }

  it('重命名时会显示重命名文案', async () => {
    const { openMock, prompt, props } = await openConfirm('rename')

    expect(openMock).toHaveBeenCalledWith('PathOperationRewriteModal', expect.objectContaining({
      title: 'edit.pathOperation.confirmRewrite.title:{"name":"bg.jpg"}',
      content: 'edit.pathOperation.confirmRewrite.renameContent:{"fileCount":2,"referenceCount":3}',
      defaultText: 'edit.pathOperation.confirmRewrite.renameConfirm',
      dangerText: 'edit.pathOperation.confirmRewrite.renameOnly',
      cancelText: 'common.cancel',
    }), expect.stringMatching(/^path-operation-confirm-/))

    props?.onDefault?.()
    await expect(prompt).resolves.toBe('rewrite')
  })

  it('移动时会显示移动文案', async () => {
    const { openMock, prompt, props } = await openConfirm('move')

    expect(openMock).toHaveBeenCalledWith('PathOperationRewriteModal', expect.objectContaining({
      title: 'edit.pathOperation.confirmRewrite.title:{"name":"bg.jpg"}',
      content: 'edit.pathOperation.confirmRewrite.moveContent:{"fileCount":2,"referenceCount":3}',
      defaultText: 'edit.pathOperation.confirmRewrite.moveConfirm',
      dangerText: 'edit.pathOperation.confirmRewrite.moveOnly',
      cancelText: 'common.cancel',
    }), expect.stringMatching(/^path-operation-confirm-/))

    props?.onDefault?.()
    await expect(prompt).resolves.toBe('rewrite')
  })

  it('点击取消时会返回 cancel', async () => {
    const { prompt, props } = await openConfirm('rename')

    props?.onCancel?.()
    await expect(prompt).resolves.toBe('cancel')
  })

  it('选择仅重命名后会打开二级确认，并在确认后返回 path-only', async () => {
    const { openMock, prompt, props } = await openConfirm('rename')

    props?.onDanger?.()

    expect(openMock).toHaveBeenNthCalledWith(2, 'AlertModal', expect.objectContaining({
      title: 'edit.pathOperation.confirmSkipRewrite.renameTitle:{"name":"bg.jpg"}',
      content: 'edit.pathOperation.confirmSkipRewrite.renameContent',
      confirmText: 'edit.pathOperation.confirmSkipRewrite.renameConfirm',
      cancelText: 'common.back',
    }), expect.stringMatching(/^path-operation-skip-rewrite-/))

    const skipProps = openMock.mock.calls[1]?.[1] as {
      onCancel?: () => void
      onConfirm?: () => void
    } | undefined

    skipProps?.onConfirm?.()
    await expect(prompt).resolves.toBe('path-only')
  })

  it('二级确认返回时不会结束首次确认', async () => {
    const { openMock, prompt, props } = await openConfirm('move')

    props?.onDanger?.()

    const skipProps = openMock.mock.calls[1]?.[1] as {
      onCancel?: () => void
      onConfirm?: () => void
    } | undefined

    skipProps?.onCancel?.()

    expect(openMock).toHaveBeenCalledTimes(2)

    props?.onCancel?.()
    await expect(prompt).resolves.toBe('cancel')
  })
})
