import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import {
  createResourceValidationFailure,
  createResourceValidationSummary,
  logResourceValidationSummary,
} from '~/services/resource-validation-summary'

const { loggerWarnMock } = vi.hoisted(() => ({
  loggerWarnMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

describe('createResourceValidationFailure', () => {
  it('会把未知错误稳定转换成字符串', () => {
    expect(createResourceValidationFailure(AbsPath.from('/games/demo'), new Error('disk unavailable')))
      .toEqual({
        error: 'Error: disk unavailable',
        path: '/games/demo',
      })
  })
})

describe('createResourceValidationSummary', () => {
  it('会根据失败列表生成数量摘要', () => {
    const failures = [
      { error: 'missing config', path: AbsPath.from('/games/first') },
      { error: 'permission denied', path: AbsPath.from('/games/second') },
    ]

    expect(createResourceValidationSummary(3, failures)).toEqual({
      failed: 2,
      failures,
      total: 3,
    })
  })
})

describe('logResourceValidationSummary', () => {
  beforeEach(() => {
    loggerWarnMock.mockReset()
  })

  it('没有失败时不会写入日志', () => {
    logResourceValidationSummary('游戏校验', {
      failed: 0,
      failures: [],
      total: 2,
    })

    expect(loggerWarnMock).not.toHaveBeenCalled()
  })

  it('会截断样例并写入剩余异常数量', () => {
    logResourceValidationSummary('模板校验', {
      failed: 4,
      failures: [
        { error: 'missing config', path: AbsPath.from('/templates/first') },
        { error: 'invalid json', path: AbsPath.from('/templates/second') },
        { error: 'unsupported version', path: AbsPath.from('/templates/third') },
        { error: 'permission denied', path: AbsPath.from('/templates/fourth') },
      ],
      total: 5,
    })

    expect(loggerWarnMock).toHaveBeenCalledWith(
      '模板校验异常 4/5: /templates/first -> missing config; /templates/second -> invalid json; /templates/third -> unsupported version; 另有 1 个异常',
    )
  })
})
