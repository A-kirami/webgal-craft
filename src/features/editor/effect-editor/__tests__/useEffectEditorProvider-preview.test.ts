import '~/__tests__/mocks/modal-store'

import { describe, expect, it } from 'vitest'

import { createEffectPreviewEmitter } from '~/features/editor/effect-editor/useEffectEditorProvider'

import type {
  EffectEditorPreviewPayload,
  EffectEditorTransformUpdatePayload,
} from '~/features/editor/effect-editor/useEffectEditorProvider'

describe('效果预览事件发射器', () => {
  it('emitTransform 会同时触发 transform 与 preview 事件', () => {
    const previewPayloads: EffectEditorPreviewPayload[] = []
    const transformPayloads: EffectEditorTransformUpdatePayload[] = []
    const emitter = createEffectPreviewEmitter({
      emitPreview(payload) {
        previewPayloads.push(payload)
      },
      emitTransform(payload) {
        transformPayloads.push(payload)
      },
    })

    emitter.emitTransform(
      {
        alpha: '0.5',
        blur: '8',
      },
      {
        schedule: 'continuous',
        deferAutoApply: true,
      },
    )

    expect(transformPayloads).toEqual([
      {
        value: { alpha: 0.5, blur: 8 },
        deferAutoApply: true,
      },
    ])
    expect(previewPayloads).toEqual([
      {
        schedule: 'continuous',
        flush: false,
      },
    ])
  })

  it('emitTransform 支持 flush 预览并透传 deferAutoApply', () => {
    const previewPayloads: EffectEditorPreviewPayload[] = []
    const transformPayloads: EffectEditorTransformUpdatePayload[] = []
    const emitter = createEffectPreviewEmitter({
      emitPreview(payload) {
        previewPayloads.push(payload)
      },
      emitTransform(payload) {
        transformPayloads.push(payload)
      },
    })

    emitter.emitTransform(
      { alpha: '1' },
      {
        schedule: 'immediate',
        flush: true,
        deferAutoApply: false,
      },
    )

    expect(transformPayloads.at(-1)).toEqual({
      value: { alpha: 1 },
      deferAutoApply: false,
      flush: true,
    })
    expect(previewPayloads.at(-1)).toEqual({
      schedule: 'immediate',
      flush: true,
    })
  })
})
