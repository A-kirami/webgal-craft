import { describe, expect, it } from 'vitest'

import {
  classifyAvailability,
  createWarning,
  normalizeImportPath,
} from '~/services/resource-health'
import { toLookupPathKey } from '~/services/resource-path/lookup'

describe('resource-health', () => {
  describe('normalizeImportPath', () => {
    it('反斜杠归一化为正斜杠并去除尾部分隔符', () => {
      expect(normalizeImportPath('C:\\Games\\Demo\\')).toEqual({
        normalizedPath: 'C:/Games/Demo',
        lookupKey: 'c:/games/demo',
      })
    })

    it('保留正斜杠路径并产出小写比较串', () => {
      expect(normalizeImportPath('/Users/Demo/Game')).toEqual({
        normalizedPath: '/Users/Demo/Game',
        lookupKey: '/users/demo/game',
      })
    })

    it('多余分隔符被压缩', () => {
      expect(normalizeImportPath('C:\\\\Games//Demo\\')).toEqual({
        normalizedPath: 'C:/Games/Demo',
        lookupKey: 'c:/games/demo',
      })
    })

    it('lookup key 由专用业务层 API 表达大小写折叠语义', () => {
      const normalized = normalizeImportPath('C:\\Games\\Demo\\')

      expect(normalized.lookupKey).toBe(toLookupPathKey(normalized.normalizedPath))
    })
  })

  describe('classifyAvailability', () => {
    it('结构与语义都通过 → available', () => {
      expect(classifyAvailability({
        pathExists: true,
        structureValid: true,
        semanticsValid: true,
      })).toBe('available')
    })

    it('路径不存在 → missing', () => {
      expect(classifyAvailability({
        pathExists: false,
        structureValid: false,
        semanticsValid: false,
      })).toBe('missing')
    })

    it('路径存在但结构无效 → broken', () => {
      expect(classifyAvailability({
        pathExists: true,
        structureValid: false,
        semanticsValid: false,
      })).toBe('broken')
    })

    it('路径存在结构有效但语义失败 → broken', () => {
      expect(classifyAvailability({
        pathExists: true,
        structureValid: true,
        semanticsValid: false,
      })).toBe('broken')
    })
  })

  describe('createWarning', () => {
    it('封装 code + message', () => {
      expect(createWarning('missing-favicon', 'favicon 不存在')).toEqual({
        code: 'missing-favicon',
        message: 'favicon 不存在',
      })
    })
  })
})
