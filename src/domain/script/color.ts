/**
 * 脚本色值文本的语法分类，供诊断判断"这个色值编辑器能不能编辑、引擎能不能渲染"。
 * - `supported`：编辑器可解析（hex3/6/8、逗号分隔的数值 rgb/rgba、hsl/hsla、hsb/hsba）
 * - `unsupported`：语法本身是色值，但编辑器不支持编辑（命名色/关键字、4 位 hex、百分比与空格斜杠写法、hwb/lab/oklch 等）
 * - `invalid`：不是可识别的色值文本（位数不对的 hex、裸 hex、含非法字符的串）
 */
export type ColorTextSyntax = 'supported' | 'unsupported' | 'invalid'

// CSS 数值：允许 `.5`，不接受单独的小数点
const NUMBER = String.raw`(?:\d+(?:\.\d+)?|\.\d+)`

const HEX_TEXT_RE = /^#(?:[\da-f]{3}|[\da-f]{6}|[\da-f]{8})$/i
// reka 的解析器只认逗号分隔的数值分量：rgb 不接受百分比，hsl 的 S/L 必须带 `%`
const RGB_TEXT_RE = new RegExp(String.raw`^rgba?\(\s*${NUMBER}\s*,\s*${NUMBER}\s*,\s*${NUMBER}\s*(?:,\s*${NUMBER}\s*)?\)$`, 'i')
const HSL_TEXT_RE = new RegExp(String.raw`^hsla?\(\s*${NUMBER}\s*,\s*${NUMBER}%\s*,\s*${NUMBER}%\s*(?:,\s*${NUMBER}\s*)?\)$`, 'i')
// hsb() 不是 CSS 色值，但编辑器能解析，因此归入 supported（只诊断编辑器处理不了的值）。
// reka 的解析器只实现到 `hsb`/`hsba`/`hsbv`（其错误信息里提到的 hsv 实际解析不了），故 hsv() 归 unsupported
const HSB_TEXT_RE = new RegExp(String.raw`^hsb[av]?\(\s*${NUMBER}\s*,\s*${NUMBER}%?\s*,\s*${NUMBER}%?\s*(?:,\s*${NUMBER}\s*)?\)$`, 'i')

// 4 位 hex 是合法的 CSS 简写，reka 只支持 3/6/8 位
const HEX_WITH_SHORT_ALPHA_RE = /^#[\da-f]{4}$/i
// 已知的颜色函数名：内容不被编辑器支持时（百分比、空格分隔、斜杠透明度、宽色域）都归入 unsupported
const COLOR_FUNCTION_RE = /^(?:rgba?|hsla?|hsb[av]?|hsv[av]?|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark|device-cmyk)\(/i
// 命名色与 transparent/currentcolor 都是纯字母标识符。按标识符整体归类，
// 拼错的标识符会落到 unsupported（"格式不受支持"）而不是 invalid，避免对引擎能否渲染做错误断言
const IDENTIFIER_RE = /^[a-z]+$/i

export function classifyColorText(value: string): ColorTextSyntax {
  const text = value.trim()

  if (
    HEX_TEXT_RE.test(text)
    || RGB_TEXT_RE.test(text)
    || HSL_TEXT_RE.test(text)
    || HSB_TEXT_RE.test(text)
  ) {
    return 'supported'
  }

  if (
    HEX_WITH_SHORT_ALPHA_RE.test(text)
    || COLOR_FUNCTION_RE.test(text)
    || IDENTIFIER_RE.test(text)
  ) {
    return 'unsupported'
  }

  return 'invalid'
}
