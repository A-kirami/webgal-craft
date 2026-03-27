import { describe, expect, it } from 'vitest'

import { renderInBrowser } from '~/__tests__/browser-render'

import StatementAssetPreview from './StatementAssetPreview.vue'

describe('StatementAssetPreview', () => {
  it('视频预览会通过外层裁剪容器保持圆角', async () => {
    await renderInBrowser(StatementAssetPreview, {
      props: {
        mimeType: 'video/mp4',
        src: '/video/opening.mp4',
      },
      global: {
        stubs: {
          StatementAudioPreview: true,
        },
      },
    })

    const frame = document.querySelector('[data-testid="statement-video-preview-frame"]')
    const video = frame?.querySelector('video')

    expect(frame).not.toBeNull()
    expect(video).not.toBeNull()
    expect(frame?.className).toContain('rounded-md')
    expect(frame?.className).toContain('overflow-hidden')
    expect(frame?.className).toContain('w-fit')
  })

  it('视频预览会收缩原生控件能力', async () => {
    await renderInBrowser(StatementAssetPreview, {
      props: {
        mimeType: 'video/mp4',
        src: '/video/opening.mp4',
      },
      global: {
        stubs: {
          StatementAudioPreview: true,
        },
      },
    })

    const video = document.querySelector('video')

    expect(video).not.toBeNull()
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('controlslist', 'nodownload nofullscreen noremoteplayback')
    expect(video).toHaveAttribute('disablepictureinpicture')
    expect(video).toHaveAttribute('playsinline')
  })
})
