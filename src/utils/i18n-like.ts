import type { ComposerTranslation } from 'vue-i18n'

export type I18nT = ComposerTranslation
export type I18nLike<TArgs extends unknown[] = []> = string | ((t: I18nT, ...args: TArgs) => string)

export function resolveI18nLike<TArgs extends unknown[]>(value: I18nLike<TArgs> | undefined, t: I18nT, ...args: TArgs): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return value(t, ...args)
}
