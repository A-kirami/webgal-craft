import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { AbsPath } from '~/domain/path'

import SaveAnimationFileModal from './SaveAnimationFileModal.vue'

const { existsMock, saveFileMock, syncAnimationTableMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
  saveFileMock: vi.fn(),
  syncAnimationTableMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/services/animation-table-sync', () => ({
  syncAnimationTable: syncAnimationTableMock,
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    writeFile: saveFileMock,
  },
}))

const globalStubs = {
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogContent: createBrowserContainerStub('StubDialogContent', 'section'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
}

async function renderModal() {
  const onSaved = vi.fn()
  await renderInBrowser(SaveAnimationFileModal, {
    browser: {
      i18nMode: 'localized',
    },
    props: {
      frames: [{ duration: 120 }],
      gamePath: AbsPath.from('/games/demo'),
      open: true,
      onSaved,
    },
    global: {
      stubs: globalStubs,
    },
  })
  return { onSaved }
}

async function submitName(fileName: string): Promise<void> {
  await page.getByRole('textbox').fill(fileName)
  await page.getByRole('button', { name: '保存' }).click()
}

beforeEach(() => {
  existsMock.mockReset()
  saveFileMock.mockReset()
  syncAnimationTableMock.mockReset()
})

describe('SaveAnimationFileModal', () => {
  it('把草稿帧写成动画文件并回到调用方', async () => {
    existsMock.mockResolvedValue(false)
    saveFileMock.mockResolvedValue(undefined)
    syncAnimationTableMock.mockResolvedValue(undefined)
    const { onSaved } = await renderModal()

    await submitName('walk/fade')

    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledWith('walk/fade')
    })
    expect(existsMock).toHaveBeenCalledWith('/games/demo/game/animation/walk/fade.json')
    expect(saveFileMock).toHaveBeenCalledWith(
      '/games/demo/game/animation/walk/fade.json',
      expect.stringContaining('"duration": 120'),
    )
    expect(syncAnimationTableMock).toHaveBeenCalledWith('/games/demo')
  })

  it('保存进行中禁用按钮，避免重复提交', async () => {
    let resolveExists: ((value: boolean) => void) | undefined
    existsMock.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveExists = resolve
    }))
    saveFileMock.mockResolvedValue(undefined)
    syncAnimationTableMock.mockResolvedValue(undefined)
    const { onSaved } = await renderModal()

    await page.getByRole('textbox').fill('walk/fade')

    const saveButton = await page.getByRole('button', { name: '保存' }).element() as HTMLButtonElement
    saveButton.click()
    await vi.waitFor(() => {
      expect(existsMock).toHaveBeenCalledOnce()
      expect(saveButton.disabled).toBe(true)
    })

    // 提交进行中再次点击不会发起第二次保存
    saveButton.click()
    expect(existsMock).toHaveBeenCalledOnce()

    resolveExists?.(false)
    await vi.waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce()
    })
  })

  it('空名称显示本地化提示而不是 zod 的默认错误', async () => {
    await renderModal()

    await page.getByRole('button', { name: '保存' }).click()

    await expect.element(page.getByText('动画名称不能为空')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Invalid input')
    expect(existsMock).not.toHaveBeenCalled()
    expect(saveFileMock).not.toHaveBeenCalled()
  })

  it('目标文件已存在时拒绝保存并提示', async () => {
    existsMock.mockResolvedValue(true)
    const { onSaved } = await renderModal()

    await submitName('walk/fade')

    await expect.element(page.getByText('同名动画文件已存在')).toBeInTheDocument()
    expect(saveFileMock).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('保留名与绝对路径在提交前被拒绝', async () => {
    await renderModal()

    await submitName('animationTable')
    await expect.element(page.getByText('animationTable 是动画表的保留名称，不能用作动画名称')).toBeInTheDocument()

    await submitName('/absolute/fade')
    await expect.element(page.getByText('只能输入 game/animation 下的相对路径')).toBeInTheDocument()

    expect(existsMock).not.toHaveBeenCalled()
    expect(saveFileMock).not.toHaveBeenCalled()
  })
})
