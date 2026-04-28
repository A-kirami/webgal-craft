import { describe, expect, it } from 'vitest'

import { AppError } from '~/types/errors'

describe('AppError.fromInvoke', () => {
  it('保留 schema version 过新错误的结构化字段', () => {
    const error = AppError.fromInvoke('read_project_config_cmd', {
      code: 'SCHEMA_VERSION_TOO_NEW',
      message: '项目配置 schema 版本过新：发现 v3，最高支持 v1',
      found: 3,
      maxSupported: 1,
    })

    expect(error.code).toBe('SCHEMA_VERSION_TOO_NEW')
    expect(error.details).toEqual({
      found: 3,
      maxSupported: 1,
    })
  })

  it('保留项目配置错误的结构化字段', () => {
    const error = AppError.fromInvoke('read_project_config_cmd', {
      code: 'INVALID_PROJECT_CONFIG',
      message: '项目配置无效：缺少 engine',
      reason: '缺少 engine',
    })

    expect(error.code).toBe('INVALID_PROJECT_CONFIG')
    expect(error.details).toEqual({
      reason: '缺少 engine',
    })
  })
})
