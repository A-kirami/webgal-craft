import type {
  I18nLike,
  I18nT,
  NumberField,
} from '~/features/editor/command-registry/schema'

type LinkedSliderParam = NumberField & {
  linkedPairKey?: string
}

export type EffectDraftFormLabelResolver = (value?: I18nLike) => string

function getVolumeLabelSource(param: LinkedSliderParam): I18nLike {
  return param.linkedGroupLabel ?? param.label
}

export function getAxisCompactLabel(key: string): 'X' | 'Y' {
  return key.toLowerCase().endsWith('.x') ? 'X' : 'Y'
}

export function getLinkedSliderLabel(
  param: LinkedSliderParam,
  resolveLabel: EffectDraftFormLabelResolver,
): string {
  return resolveLabel(getVolumeLabelSource(param))
}

export function getLinkedSliderInputAriaLabel(
  param: LinkedSliderParam,
  index: 0 | 1,
  resolveLabel: EffectDraftFormLabelResolver,
): string {
  const axisKey = index === 0 ? param.key : param.linkedPairKey ?? param.key
  return `${getLinkedSliderLabel(param, resolveLabel)} ${getAxisCompactLabel(axisKey)}`
}

export function getClearPropertyLabel(
  label: I18nLike | undefined,
  resolveLabel: EffectDraftFormLabelResolver,
  t: I18nT,
): string {
  return t('modals.effectEditor.clearProperty', {
    name: resolveLabel(label),
  })
}
