import { describe, expect, it } from 'vitest'

import {
  createPreviewBootstrapProvideMessage,
  createPreviewOutputSettingsMessage,
  createPreviewViewportSpaceKeyMessage,
  isPreviewBootstrapRequestMessage,
  isPreviewViewportPointerMessage,
  isPreviewViewportSpaceKeyMessage,
  isPreviewViewportWheelMessage,
} from '../embedded-preview-messages'

describe('isPreviewBootstrapRequestMessage', () => {
  it('识别预览引导请求并构造引导提供消息', () => {
    expect(isPreviewBootstrapRequestMessage({
      type: 'webgal.preview.bootstrap.request',
    })).toBe(true)
    expect(isPreviewBootstrapRequestMessage({
      type: 'webgal.preview.bootstrap.provide',
    })).toBe(false)

    expect(createPreviewBootstrapProvideMessage('embedded-launch-1')).toEqual({
      type: 'webgal.preview.bootstrap.provide',
      embeddedLaunchId: 'embedded-launch-1',
    })
  })
})

describe('createPreviewOutputSettingsMessage', () => {
  it('构造内嵌预览输出设置消息', () => {
    expect(createPreviewOutputSettingsMessage({
      muted: true,
      volume: 0.4,
    })).toEqual({
      type: 'webgal.preview.output-settings',
      muted: true,
      volume: 0.4,
    })
  })
})

describe('isPreviewViewportWheelMessage', () => {
  it('识别预览视口滚轮转发消息', () => {
    expect(isPreviewViewportWheelMessage({
      type: 'webgal.preview.viewport.wheel',
      clientX: 120,
      clientY: 64,
      ctrlKey: false,
      deltaY: -1,
      metaKey: true,
    })).toBe(true)
    expect(isPreviewViewportWheelMessage({
      type: 'webgal.preview.viewport.wheel',
      clientX: 120,
      clientY: 64,
      ctrlKey: false,
      deltaY: '-1',
      metaKey: true,
    })).toBe(false)
    expect(isPreviewViewportWheelMessage({
      type: 'webgal.preview.viewport.wheel',
      clientX: 120,
      clientY: 64,
      ctrlKey: false,
      deltaY: Number.POSITIVE_INFINITY,
      metaKey: true,
    })).toBe(false)
  })
})

describe('isPreviewViewportSpaceKeyMessage', () => {
  it('构造预览视口空格按键同步消息', () => {
    expect(createPreviewViewportSpaceKeyMessage(true)).toEqual({
      type: 'webgal.preview.viewport.space-key',
      pressed: true,
    })
  })

  it('识别预览视口空格按键转发消息', () => {
    expect(isPreviewViewportSpaceKeyMessage({
      type: 'webgal.preview.viewport.space-key',
      pressed: true,
    })).toBe(true)
    expect(isPreviewViewportSpaceKeyMessage({
      type: 'webgal.preview.viewport.space-key',
      pressed: 'true',
    })).toBe(false)
  })
})

describe('isPreviewViewportPointerMessage', () => {
  it('识别预览视口中键指针转发消息', () => {
    expect(isPreviewViewportPointerMessage({
      type: 'webgal.preview.viewport.pointer',
      eventType: 'pointerdown',
      button: 1,
      buttons: 4,
      clientX: 120,
      clientY: 64,
      pointerId: 9,
    })).toBe(true)
    expect(isPreviewViewportPointerMessage({
      type: 'webgal.preview.viewport.pointer',
      eventType: 'click',
      button: 1,
      buttons: 4,
      clientX: 120,
      clientY: 64,
      pointerId: 9,
    })).toBe(false)
    expect(isPreviewViewportPointerMessage({
      type: 'webgal.preview.viewport.pointer',
      eventType: 'pointerdown',
      button: 1,
      buttons: 4,
      clientX: 120,
      clientY: 64,
      pointerId: '9',
    })).toBe(false)
    expect(isPreviewViewportPointerMessage({
      type: 'webgal.preview.viewport.pointer',
      eventType: 'pointerdown',
      button: 1,
      buttons: 4,
      clientX: Number.NaN,
      clientY: 64,
      pointerId: 9,
    })).toBe(false)
  })
})
