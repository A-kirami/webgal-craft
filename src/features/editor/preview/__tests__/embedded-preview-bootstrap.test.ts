import { describe, expect, it } from 'vitest'

import {
  createPreviewBootstrapProvideMessage,
  isPreviewBootstrapRequestMessage,
} from '../embedded-preview-bootstrap'

describe('内嵌预览引导辅助函数', () => {
  it('识别引导请求消息并生成提供消息', () => {
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
