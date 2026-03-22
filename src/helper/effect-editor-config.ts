import { EASE } from '~/helper/command-registry/common-params'
import { ChoiceField, ColorField, DialField, I18nLike, UNSPECIFIED } from '~/helper/command-registry/schema'
import { Transform } from '~/types/stage'

import type { NumberField } from '~/helper/command-registry/schema'

// ─── 效果编辑器参数类型（基于 FieldDef 子集） ───

/** 效果编辑器支持的参数类型：NumberField（含 slider / linked-slider）、DialField、ColorField、ChoiceField（segmented） */
export type EffectParamDef = NumberField | DialField | ColorField | ChoiceField

export interface EffectCategory {
  label: I18nLike
  icon: string
  defaultOpen?: boolean
  params: EffectParamDef[]
}

// ─── EffectRenderItem：判别联合，用于模板类型安全分发 ───

export type EffectRenderItem =
  | { kind: 'position', key: string, params: NumberField[] }
  | { kind: 'number', key: string, param: NumberField }
  | { kind: 'slider', key: string, param: NumberField }
  | { kind: 'linked-slider', key: string, param: NumberField & { linkedPairKey: string } }
  | { kind: 'dial', key: string, param: DialField }
  | { kind: 'color', key: string, param: ColorField & { colorPaths: [string, string, string], colorDefaults: [number, number, number] } }
  | { kind: 'choice', key: string, param: ChoiceField }

export function getEffectParamKey(param: EffectParamDef): string {
  if (param.type === 'color' && param.colorPaths) {
    return param.colorPaths.join('|')
  }
  if (param.type === 'number' && param.linkedPairKey) {
    return `${param.key}|${param.linkedPairKey}`
  }
  return param.key
}

export function buildCategoryRenderItems(params: EffectParamDef[]): EffectRenderItem[] {
  const items: EffectRenderItem[] = []

  // 收集 position 参数
  const positionParams = params.filter(
    (p): p is NumberField => p.type === 'number' && p.effectGroup === 'position',
  )
  if (positionParams.length > 0) {
    items.push({ kind: 'position', key: 'position', params: positionParams })
  }

  // 遍历非 position 参数
  for (const param of params) {
    if (param.type === 'number' && param.effectGroup === 'position') {
      continue
    }

    const key = getEffectParamKey(param)

    switch (param.type) {
      case 'number': {
        if (param.variant === 'slider-input' && param.linkedPairKey) {
          // linked-slider 成对出现（如 scale.x / scale.y），
        // 只在字典序较小的一端创建渲染项，避免重复渲染同一对控件
          if (param.key < param.linkedPairKey) {
            items.push({
              kind: 'linked-slider',
              key,
              param: param as NumberField & { linkedPairKey: string },
            })
          }
        } else if (param.variant === 'slider-input') {
          items.push({ kind: 'slider', key, param })
        } else {
          items.push({ kind: 'number', key, param })
        }
        break
      }
      case 'dial': {
        items.push({ kind: 'dial', key, param })
        break
      }
      case 'color': {
        items.push({
          kind: 'color',
          key,
          param: param as ColorField & {
            colorPaths: [string, string, string]
            colorDefaults: [number, number, number]
          },
        })
        break
      }
      case 'choice': {
        items.push({ kind: 'choice', key, param })
        break
      }
      default: {
        break
      }
    }
  }

  return items
}

const FILTER_SEGMENT_OPTIONS: { label: I18nLike, value: string }[] = [
  { label: t => t('modals.effectEditor.filterOptions.default'), value: UNSPECIFIED },
  { label: t => t('modals.effectEditor.filterOptions.on'), value: '1' },
  { label: t => t('modals.effectEditor.filterOptions.off'), value: '0' },
]

// ─── 效果编辑器 ease 选项（在注册表 EASE.options 基础上增加"默认"占位） ───

export const DEFAULT_EASE_OPTION_VALUE = '__effect-editor-default-ease__'

export const EFFECT_EASE_OPTIONS: { label: I18nLike, value: string }[] = [
  { label: t => t('edit.visualEditor.options.default'), value: DEFAULT_EASE_OPTION_VALUE },
  ...(EASE.options ?? []),
]

export const EFFECT_CATEGORIES: EffectCategory[] = [
  {
    label: t => t('modals.effectEditor.categories.transform'),
    icon: 'i-lucide-move',
    defaultOpen: true,
    params: [
      { key: 'position.x', type: 'number', label: t => t('modals.effectEditor.params.positionX'), defaultValue: 0, effectGroup: 'position', scrubbable: true, scrubStep: 1 },
      { key: 'position.y', type: 'number', label: t => t('modals.effectEditor.params.positionY'), defaultValue: 0, effectGroup: 'position', scrubbable: true, scrubStep: 1 },
      { key: 'scale.x', type: 'number', label: t => t('modals.effectEditor.params.scaleX'), linkedGroupLabel: t => t('modals.effectEditor.params.scale'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, linkedPairKey: 'scale.y', variant: 'slider-input' },
      { key: 'scale.y', type: 'number', label: t => t('modals.effectEditor.params.scaleY'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, linkedPairKey: 'scale.x', variant: 'slider-input' },
      { key: 'rotation', type: 'dial', label: t => t('modals.effectEditor.params.rotation'), defaultValue: 0, dialUnit: 'rad', compact: true },
    ],
  },
  {
    label: t => t('modals.effectEditor.categories.effects'),
    icon: 'i-lucide-eye',
    defaultOpen: true,
    params: [
      { key: 'alpha', type: 'number', label: t => t('modals.effectEditor.params.alpha'), defaultValue: 1, min: 0, max: 1, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'blur', type: 'number', label: t => t('modals.effectEditor.params.blur'), defaultValue: 0, min: 0, max: 50, step: 0.5, center: 0, variant: 'slider-input' },
    ],
  },
  {
    label: t => t('modals.effectEditor.categories.colorAdjustment'),
    icon: 'i-lucide-palette',
    params: [
      { key: 'brightness', type: 'number', label: t => t('modals.effectEditor.params.brightness'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'contrast', type: 'number', label: t => t('modals.effectEditor.params.contrast'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'saturation', type: 'number', label: t => t('modals.effectEditor.params.saturation'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'gamma', type: 'number', label: t => t('modals.effectEditor.params.gamma'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'color', type: 'color', label: t => t('modals.effectEditor.params.color'), colorPaths: ['colorRed', 'colorGreen', 'colorBlue'], colorDefaults: [255, 255, 255] },
    ],
  },
  {
    label: t => t('modals.effectEditor.categories.bloom'),
    icon: 'i-lucide-sun',
    params: [
      { key: 'bloom', type: 'number', label: t => t('modals.effectEditor.params.bloom'), defaultValue: 0, min: 0, max: 1, step: 0.01, center: 0, variant: 'slider-input' },
      { key: 'bloomBrightness', type: 'number', label: t => t('modals.effectEditor.params.bloomBrightness'), defaultValue: 1, min: 0, max: 2, step: 0.01, center: 1, variant: 'slider-input' },
      { key: 'bloomThreshold', type: 'number', label: t => t('modals.effectEditor.params.bloomThreshold'), defaultValue: 0, min: 0, max: 1, step: 0.01, center: 0, variant: 'slider-input' },
      { key: 'bloomBlur', type: 'number', label: t => t('modals.effectEditor.params.bloomBlur'), defaultValue: 0, min: 0, max: 50, step: 0.5, center: 0, variant: 'slider-input' },
    ],
  },
  {
    label: t => t('modals.effectEditor.categories.bevel'),
    icon: 'i-lucide-layers',
    params: [
      { key: 'bevelThickness', type: 'number', label: t => t('modals.effectEditor.params.bevelThickness'), defaultValue: 0, min: 0, max: 100, step: 0.5, center: 0, variant: 'slider-input' },
      { key: 'bevel', type: 'number', label: t => t('modals.effectEditor.params.bevel'), defaultValue: 0, min: 0, max: 1, step: 0.01, center: 0, variant: 'slider-input' },
      { key: 'bevelSoftness', type: 'number', label: t => t('modals.effectEditor.params.bevelSoftness'), defaultValue: 0, min: 0, max: 1, step: 0.01, center: 0, variant: 'slider-input' },
      { key: 'bevelRotation', type: 'dial', label: t => t('modals.effectEditor.params.bevelRotation'), defaultValue: 0, dialUnit: 'deg' },
      { key: 'bevelColor', type: 'color', label: t => t('modals.effectEditor.params.bevelColor'), colorPaths: ['bevelRed', 'bevelGreen', 'bevelBlue'], colorDefaults: [255, 255, 255] },
    ],
  },
  {
    label: t => t('modals.effectEditor.categories.filters'),
    icon: 'i-lucide-film',
    params: [
      { key: 'oldFilm', type: 'choice', label: t => t('modals.effectEditor.params.oldFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
      { key: 'dotFilm', type: 'choice', label: t => t('modals.effectEditor.params.dotFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
      { key: 'reflectionFilm', type: 'choice', label: t => t('modals.effectEditor.params.reflectionFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
      { key: 'glitchFilm', type: 'choice', label: t => t('modals.effectEditor.params.glitchFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
      { key: 'rgbFilm', type: 'choice', label: t => t('modals.effectEditor.params.rgbFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
      { key: 'godrayFilm', type: 'choice', label: t => t('modals.effectEditor.params.godrayFilm'), variant: 'segmented', options: FILTER_SEGMENT_OPTIONS },
    ],
  },
]

// ─── Path Rules（从 FieldDef 参数定义派生） ───

interface EffectPathRule {
  path: string
  kind: 'number' | 'flag'
  defaultValue?: number
}

function pushPathRule(rules: EffectPathRule[], rule: EffectPathRule): void {
  if (!rules.some(item => item.path === rule.path)) {
    rules.push(rule)
  }
}

function buildPathRules(categories: EffectCategory[]): EffectPathRule[] {
  const rules: EffectPathRule[] = []

  for (const category of categories) {
    for (const param of category.params) {
      switch (param.type) {
        case 'number':
        case 'dial': {
          pushPathRule(rules, {
            path: param.key,
            kind: 'number',
            defaultValue: param.defaultValue,
          })
          break
        }
        case 'color': {
          const paths = param.colorPaths!
          const defaults = param.colorDefaults!
          for (let i = 0; i < 3; i++) {
            pushPathRule(rules, {
              path: paths[i],
              kind: 'number',
              defaultValue: defaults[i],
            })
          }
          break
        }
        case 'choice': {
          pushPathRule(rules, {
            path: param.key,
            kind: 'flag',
          })
          break
        }
        default: {
          const neverParam: never = param
          void neverParam
        }
      }
    }
  }

  return rules
}

const EFFECT_PATH_RULES = buildPathRules(EFFECT_CATEGORIES)

// ─── 路径操作工具 ───

/** 从嵌套对象中按路径读取值 */
export function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

/** 向嵌套对象中按路径写入值 */
export function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as Record<string, unknown>
  }
  current[keys.at(-1)!] = value
}

/** 向嵌套对象中按路径删除值，删除后会清理空对象 */
export function unsetValueByPath(obj: Record<string, unknown>, path: string): void {
  const keys = path.split('.')
  const parents: Record<string, unknown>[] = [obj]
  const pathKeys: string[] = []
  let current: Record<string, unknown> = obj

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const next = current[key]
    if (!next || typeof next !== 'object') {
      return
    }
    current = next as Record<string, unknown>
    parents.push(current)
    pathKeys.push(key)
  }

  delete current[keys.at(-1)!]

  for (let i = parents.length - 1; i > 0; i--) {
    const child = parents[i]
    if (Object.keys(child).length > 0) {
      break
    }
    const parent = parents[i - 1]
    const key = pathKeys[i - 1]
    delete parent[key]
  }
}

// ─── 值转换与序列化 ───

/**
 * 将原始值按规则类型转换为有效数值，无效时返回 undefined。
 * flag 类型仅接受 0/1，number 类型接受任意有限数值。
 */
function coerceRuleValue(rule: EffectPathRule, raw: unknown): number | undefined {
  const num = Number(raw)
  if (rule.kind === 'flag') {
    return (num === 0 || num === 1) ? num : undefined
  }
  return Number.isFinite(num) ? num : undefined
}

/** 从嵌套对象中按规则提取所有有效字段为扁平 key-value */
function objectToFields(source: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rule of EFFECT_PATH_RULES) {
    const raw = getValueByPath(source, rule.path)
    if (raw === undefined || raw === null) {
      continue
    }
    const num = coerceRuleValue(rule, raw)
    if (num !== undefined) {
      result[rule.path] = String(num)
    }
  }
  return result
}

/**
 * 将扁平 key-value 按规则写入嵌套对象，返回是否写入了任何值。
 * skipDefault 为 true 时跳过等于默认值的 number 字段（用于序列化时省略冗余值）。
 */
function fieldsToObject(fields: Record<string, string>, obj: Record<string, unknown>, skipDefault: boolean): boolean {
  let hasValue = false
  for (const rule of EFFECT_PATH_RULES) {
    const raw = fields[rule.path]
    if (raw === undefined || raw === '' || raw === UNSPECIFIED) {
      continue
    }
    const num = coerceRuleValue(rule, raw)
    if (num === undefined) {
      continue
    }
    if (skipDefault && rule.kind === 'number' && rule.defaultValue !== undefined && num === rule.defaultValue) {
      continue
    }
    setValueByPath(obj, rule.path, num)
    hasValue = true
  }
  return hasValue
}

// ─── 公共 API ───

/** 将 transform JSON 字符串解析为扁平 key-value（key 为 path） */
export function parseEffectJson(json: string): Record<string, string> {
  if (!json.trim()) {
    return {}
  }
  try {
    return objectToFields(JSON.parse(json) as Record<string, unknown>)
  } catch {
    return {}
  }
}

/** 将扁平 key-value 还原为 Transform 对象 */
export function fieldsToTransform(fields: Record<string, string>): Transform {
  const obj: Record<string, unknown> = {}
  fieldsToObject(fields, obj, false)
  return obj as Transform
}

/** 将 Transform 对象扁平化为 key-value（key 为 path） */
export function transformToFields(transform: Transform): Record<string, string> {
  return objectToFields(transform as unknown as Record<string, unknown>)
}

interface EffectSerializeOptions {
  preserveDefaults?: boolean
}

// 序列化时默认跳过等于默认值的字段（如 alpha=1、position.x=0），
// 减少脚本中的冗余 JSON 体积；preserveDefaults 保留默认值，
// 用于覆盖重置之前的效果（如将某个属性显式设回默认值）
/** 将扁平 key-value 序列化为 transform JSON 字符串 */
export function serializeEffectJson(fields: Record<string, string>, options: EffectSerializeOptions = {}): string {
  const obj: Record<string, unknown> = {}
  const skipDefault = options.preserveDefaults !== true
  const hasValue = fieldsToObject(fields, obj, skipDefault)
  return hasValue ? JSON.stringify(obj) : ''
}

/** 解析 transformJson 为 Transform（仅保留效果编辑器已知字段） */
export function parseTransformJson(transformJson: string): Transform {
  const fields = parseEffectJson(transformJson)
  return fieldsToTransform(fields)
}

/** 将 Transform 序列化为 transformJson */
export function serializeTransform(transform: Transform, options: EffectSerializeOptions = {}): string {
  const fields = transformToFields(transform)
  return serializeEffectJson(fields, options)
}

/** 直接比较两个 Transform 的所有效果字段是否相等（避免序列化开销） */
export function isTransformEqual(left: Transform, right: Transform): boolean {
  const leftObj = left as unknown as Record<string, unknown>
  const rightObj = right as unknown as Record<string, unknown>
  for (const rule of EFFECT_PATH_RULES) {
    const leftRaw = getValueByPath(leftObj, rule.path)
    const rightRaw = getValueByPath(rightObj, rule.path)
    const leftNum = leftRaw === undefined ? undefined : coerceRuleValue(rule, leftRaw)
    const rightNum = rightRaw === undefined ? undefined : coerceRuleValue(rule, rightRaw)
    if (leftNum !== rightNum) {
      return false
    }
  }
  return true
}

/**
 * 解析效果 JSON，返回有非默认值的效果类别列表（用于折叠速览）。
 * 对全部参数都是 segmented（开关标志）的类别（如滤镜），展开为各个活跃的参数项。
 */
export function getActiveEffectCategories(json: string): { label: I18nLike, icon: string }[] {
  const fields = parseEffectJson(json)
  if (Object.keys(fields).length === 0) {
    return []
  }

  const result: { label: I18nLike, icon: string }[] = []

  for (const category of EFFECT_CATEGORIES) {
    const allSegmented = category.params.every(p => p.type === 'choice')
    if (allSegmented) {
      // 全部为开关标志的类别：逐个展示活跃的参数（如 老电影、故障）
      for (const param of category.params) {
        if (param.type === 'choice' && fields[param.key] !== undefined && fields[param.key] !== '0') {
          result.push({ label: param.label, icon: category.icon })
        }
      }
    } else if (isCategoryActive(category, fields)) {
      result.push({ label: category.label, icon: category.icon })
    }
  }

  return result
}

function isCategoryActive(category: EffectCategory, fields: Record<string, string>): boolean {
  const rules = buildPathRules([category])
  for (const rule of rules) {
    const value = fields[rule.path]
    if (value === undefined) {
      continue
    }
    if (rule.kind === 'flag') {
      return true
    }
    if (rule.defaultValue !== undefined && Number(value) !== rule.defaultValue) {
      return true
    }
  }
  return false
}
