import { describe, expect, it } from 'vitest'

import { resolveI18nLike } from '../i18n-like'

import type { I18nLike } from '../i18n-like'

describe('resolveI18nLike', () => {
  it('支持字符串、回调和空值', () => {
    const t = (key: string) => `t:${key}`

    expect(resolveI18nLike('plain', t)).toBe('plain')
    expect(resolveI18nLike(translate => translate('plain'), t)).toBe('t:plain')
    expect(resolveI18nLike(undefined, t)).toBe('')
  })

  it('支持向回调透传额外参数', () => {
    const t = (key: string) => `t:${key}`
    const value: I18nLike<[content?: string]> = (translate, content) => translate(`key:${content}`)

    expect(resolveI18nLike(value, t, 'body')).toBe('t:key:body')
  })
})
