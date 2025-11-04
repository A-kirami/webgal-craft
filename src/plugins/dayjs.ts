import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'
import 'dayjs/locale/zh-tw'
import 'dayjs/locale/en'
import 'dayjs/locale/ja'

dayjs.extend(relativeTime)

const DEFAULT_LOCALE = 'zh-cn'

const LOCALE_MAP: Readonly<Record<string, string>> = {
  'zh-Hans': 'zh-cn',
  'zh-Hant': 'zh-tw',
  'zh-CN': 'zh-cn',
  'zh-SG': 'zh-cn',
  'zh-MY': 'zh-cn',
  'zh-TW': 'zh-tw',
  'zh-HK': 'zh-tw',
  'zh-MO': 'zh-tw',
  'en': 'en',
  'ja': 'ja',
}

/**
 * 设置 dayjs 的 locale
 */
export function setDayjsLocale(language: string) {
  dayjs.locale(LOCALE_MAP[language] ?? DEFAULT_LOCALE)
}

export { default } from 'dayjs'
