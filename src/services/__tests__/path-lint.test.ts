import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

async function lintText(code: string) {
  const eslint = new ESLint({
    cwd: process.cwd(),
    overrideConfigFile: 'eslint.config.js',
  })

  return eslint.lintText(code, {
    filePath: 'src/__tests__/fixtures/path-lint-fixture.ts',
  })
}

describe('路径校验规则', () => {
  it('会拒绝在 ~/domain/path 之外使用正则归一化反斜杠', async () => {
    const [result] = await lintText([
      'export function normalizePath(path: string) {',
      String.raw`  return path.replace(/\\/g, '/')`,
      '}',
      '',
    ].join('\n'))

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 2,
          ruleId: 'no-restricted-syntax',
          message: expect.stringContaining('禁止裸 replace'),
        }),
      ]),
    )
  })

  it('会拒绝在路径工厂之外断言路径品牌类型', async () => {
    const [result] = await lintText([
      'import type { LookupPathKey } from \'~/services/resource-path/lookup\'',
      '',
      'export function createKey(path: string) {',
      '  return path as LookupPathKey',
      '}',
      '',
    ].join('\n'))

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 2,
          ruleId: 'no-restricted-syntax',
          message: expect.stringContaining('LookupPathKey'),
        }),
      ]),
    )
  })

  it('会拒绝导入来自 @tauri-apps/api/path 的禁用路径工具', async () => {
    const [result] = await lintText([
      'import { join, dirname } from \'@tauri-apps/api/path\'',
      '',
      'export const ref = { join, dirname }',
      '',
    ].join('\n'))

    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 2,
          ruleId: 'no-restricted-imports',
          message: expect.stringContaining('src/domain/path'),
        }),
      ]),
    )
  })
})
