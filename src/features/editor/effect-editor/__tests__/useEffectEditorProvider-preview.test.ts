import '~/__tests__/mocks/modal-store'

import { describe, expect, it } from 'vitest'

import { createEffectPreviewEmitter } from '~/features/editor/effect-editor/useEffectEditorProvider'

import type {
  EffectEditorPreviewPayload,
  EffectEditorTransformUpdatePayload,
} from '~/features/editor/effect-editor/useEffectEditorProvider'

describe('createEffectPreviewEmitter', () => {
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
        deferAutoApply: true,
        frameReady: true,
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
        flush: false,
        frameReady: true,
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
      flush: true,
    })
  })
})
