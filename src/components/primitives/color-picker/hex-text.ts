import { colorToString, normalizeColor } from 'reka-ui'

import { clamp } from '~/utils/math'

import type { Color } from 'reka-ui'

const BARE_HEX_TEXT_RE = /^[0-9a-fA-F]{3,8}$/
const HEX_WITH_ALPHA_RE = /^#?[0-9a-fA-F]{8}$/
// 函数式写法按逗号分量计数：第 4 个分量即透明度（reka 只接受逗号分隔形式）
const FUNCTIONAL_WITH_ALPHA_RE = /^[a-z]+\s*\([^)]*(?:,[^),]*){3}/i

/** 规范色值：大写 hex、带 `#`（写入 model 与持久化一律用这个形式） */
export function formatHexValue(color: Color): string {
  return colorToString(color, 'hex').toUpperCase()
}

/**
 * hex 字段展示文本：只保留色值本身，大写且不带 `#`（与设计软件一致）。
 * 输入框里只编辑 RGB 部分，透明度由 % 字段负责。
 */
export function formatHexText(color: Color): string {
  return formatHexValue({ ...color, alpha: 1 }).slice(1)
}

/** 分量非有限（正则放行的 `rgb(., 0, 0)`）说明文本本身非法，抛错交给调用方的非法输入路径 */
function clampChannel(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid color channel: ${value}`)
  }

  return clamp(value, 0, max)
}

/**
 * 分量裁剪到通道的合法区间。reka 解析不裁剪、序列化也只补零不校验长度，
 * 越界的 `rgb(300, 0, 0)` 会拼出 7 位畸形 hex（`#12C0000`），让写进 model 的色值再也解析不回来；
 * CSS 对越界分量做裁剪，这里对齐同一语义。色相不在裁剪之列：CSS 对色相是取模，
 * reka 的回绕结果与之一致，裁剪到 360 反而会把 `hsl(400, …)` 错误地变成纯红。
 */
function clampChannels(color: Color): Color {
  const alpha = clampChannel(color.alpha, 1)
  switch (color.space) {
    case 'rgb': {
      return { ...color, r: clampChannel(color.r, 255), g: clampChannel(color.g, 255), b: clampChannel(color.b, 255), alpha }
    }
    case 'hsl': {
      return { ...color, s: clampChannel(color.s, 100), l: clampChannel(color.l, 100), alpha }
    }
    case 'hsb': {
      return { ...color, s: clampChannel(color.s, 100), b: clampChannel(color.b, 100), alpha }
    }

    // no default
  }
}

/**
 * hex 字段提交文本：裸 hex（`56d799`、`f00`、`56d79980`）补上 `#` 后再解析，
 * 其他形式（`#...`、`rgb(...)`、`hsl(...)`）原样解析，越界分量按 CSS 语义裁剪，非法文本抛错。
 */
export function normalizeHexText(text: string): Color {
  const trimmed = text.trim()
  return clampChannels(normalizeColor(BARE_HEX_TEXT_RE.test(trimmed) ? `#${trimmed}` : trimmed))
}

/**
 * 输入文本是否自带透明度：8 位 hex，或函数式写法的第 4 个分量。
 * 函数名带不带 `a` 不作数——`rgb(r, g, b, a)` 同样合法。
 * 只在文本能被 `normalizeHexText` 解析时有意义。
 */
export function hasExplicitAlpha(text: string): boolean {
  const trimmed = text.trim()
  return HEX_WITH_ALPHA_RE.test(trimmed) || FUNCTIONAL_WITH_ALPHA_RE.test(trimmed)
}
