import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

const { loggerErrorMock, toastErrorMock } = vi.hoisted(() => ({
  loggerErrorMock: vi.fn(),
  toastErrorMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
  },
}))

describe('handleError', () => {
  beforeEach(() => {
    loggerErrorMock.mockReset()
    toastErrorMock.mockReset()
  })

  it('会包装未知错误并同时记录日志与通知', () => {
    handleError(new Error('boom'))

    expect(loggerErrorMock).toHaveBeenCalledWith('[UNKNOWN] boom')
    expect(toastErrorMock).toHaveBeenCalledWith('boom')
  })

  it('展示嵌套 AppError 的根因，并拼接业务上下文', () => {
    const rootError = new AppError('IO_ERROR', '磁盘已满')
    const outerError = new AppError('FS_ERROR', '保存失败', { cause: rootError })

    handleError(outerError, { context: '保存文件失败' })

    expect(loggerErrorMock).toHaveBeenCalledWith('[FS_ERROR] 保存失败')
    expect(toastErrorMock).toHaveBeenCalledWith('保存文件失败: 磁盘已满')
  })

  it('silent 模式只记录日志，不弹通知', () => {
    handleError(new AppError('DIR_NOT_FOUND', '目录不存在'), { silent: true })

    expect(loggerErrorMock).toHaveBeenCalledWith('[DIR_NOT_FOUND] 目录不存在')
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
})
