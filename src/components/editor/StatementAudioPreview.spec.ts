import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

const {
  getCurrentTimeMock,
  getDurationMock,
  isPlayingMock,
  loggerWarnMock,
  waveSurferCreateMock,
  waveSurferDestroyMock,
  waveSurferLoadMock,
  waveSurferPauseMock,
  waveSurferPlayMock,
  waveSurferState,
  waveSurferSubscriptions,
} = vi.hoisted(() => ({
  getCurrentTimeMock: vi.fn(),
  getDurationMock: vi.fn(),
  isPlayingMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  waveSurferCreateMock: vi.fn(),
  waveSurferDestroyMock: vi.fn(),
  waveSurferLoadMock: vi.fn(),
  waveSurferPauseMock: vi.fn(),
  waveSurferPlayMock: vi.fn(),
  waveSurferState: {
    currentTime: 0,
    duration: 0,
    isPlaying: false,
  },
  waveSurferSubscriptions: new Map<string, Set<(...args: unknown[]) => void>>(),
}))

function emitWaveSurferEvent(eventName: string, ...args: unknown[]) {
  for (const handler of waveSurferSubscriptions.get(eventName) ?? []) {
    handler(...args)
  }
}

function resetWaveSurferState() {
  waveSurferState.currentTime = 0
  waveSurferState.duration = 0
  waveSurferState.isPlaying = false
  waveSurferSubscriptions.clear()
  getCurrentTimeMock.mockImplementation(() => waveSurferState.currentTime)
  getDurationMock.mockImplementation(() => waveSurferState.duration)
  isPlayingMock.mockImplementation(() => waveSurferState.isPlaying)
  waveSurferPlayMock.mockImplementation(async () => {
    waveSurferState.isPlaying = true
  })
  waveSurferPauseMock.mockImplementation(() => {
    waveSurferState.isPlaying = false
  })
}

vi.mock('wavesurfer.js', () => ({
  default: {
    create: waveSurferCreateMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  trace: vi.fn(),
  warn: loggerWarnMock,
}))

import StatementAudioPreview from './StatementAudioPreview.vue'

function translate(key: string): string {
  switch (key) {
    case 'edit.visualEditor.audioPreview.pause': {
      return '暂停音频'
    }
    case 'edit.visualEditor.audioPreview.play': {
      return '播放音频'
    }
    case 'edit.visualEditor.audioPreview.unavailable': {
      return '音频预览当前不可用'
    }
    default: {
      return key
    }
  }
}

const audioPreviewStubs = {
  Button: createBrowserClickStub('StubButton'),
  Pause: createBrowserTextStub('StubPauseIcon', 'pause'),
  Play: createBrowserTextStub('StubPlayIcon', 'play'),
}

function renderStatementAudioPreview(src: string = '/audio/theme.ogg') {
  return renderInBrowser(StatementAudioPreview, {
    props: { src },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: audioPreviewStubs,
    },
  })
}

describe('StatementAudioPreview', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--muted-foreground')
  })

  beforeEach(() => {
    resetWaveSurferState()
    waveSurferLoadMock.mockResolvedValue(undefined)
    waveSurferCreateMock.mockImplementation(() => ({
      destroy: waveSurferDestroyMock,
      getCurrentTime: getCurrentTimeMock,
      getDuration: getDurationMock,
      isPlaying: isPlayingMock,
      load: waveSurferLoadMock,
      on: (eventName: string, callback: (...args: unknown[]) => void) => {
        const currentHandlers = waveSurferSubscriptions.get(eventName) ?? new Set()
        currentHandlers.add(callback)
        waveSurferSubscriptions.set(eventName, currentHandlers)
        return () => {
          currentHandlers.delete(callback)
        }
      },
      pause: waveSurferPauseMock,
      play: waveSurferPlayMock,
    }))
  })

  it('首次点击时才会加载音频，并在播放时显示剩余时间', async () => {
    waveSurferState.duration = 94
    document.documentElement.style.setProperty('--primary', 'oklch(0.62 0.19 259)')
    document.documentElement.style.setProperty('--muted-foreground', 'oklch(0.48 0.02 264)')

    await renderStatementAudioPreview()

    expect(waveSurferCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      backend: 'MediaElement',
      progressColor: 'oklch(0.62 0.19 259)',
      waveColor: 'oklch(0.662 0.011 264)',
    }))
    expect(waveSurferCreateMock).not.toHaveBeenCalledWith(expect.objectContaining({
      url: '/audio/theme.ogg',
    }))
    expect(waveSurferLoadMock).not.toHaveBeenCalled()

    await page.getByTestId('statement-audio-preview-toggle').click()
    expect(waveSurferLoadMock).toHaveBeenCalledWith('/audio/theme.ogg')

    emitWaveSurferEvent('ready')
    await vi.waitFor(() => {
      expect(waveSurferPlayMock).toHaveBeenCalledOnce()
    })
    await expect.element(page.getByTestId('statement-audio-preview-time')).toHaveTextContent('1:34')

    waveSurferState.isPlaying = true
    waveSurferState.currentTime = 12
    emitWaveSurferEvent('play')
    emitWaveSurferEvent('timeupdate', 12)

    await expect.element(page.getByTestId('statement-audio-preview-time')).toHaveTextContent('1:22')

    await page.getByTestId('statement-audio-preview-toggle').click()
    expect(waveSurferPauseMock).toHaveBeenCalledOnce()

    waveSurferState.isPlaying = false
    emitWaveSurferEvent('pause')

    await expect.element(page.getByTestId('statement-audio-preview-time')).toHaveTextContent('1:22')
  })

  it('会使用连续波形渲染而不是柱状波形', async () => {
    await renderStatementAudioPreview()

    const [{ barGap, barRadius, barWidth, renderFunction }] = waveSurferCreateMock.mock.calls.at(-1) ?? []

    expect(barGap).toBeUndefined()
    expect(barRadius).toBeUndefined()
    expect(barWidth).toBeUndefined()
    expect(renderFunction).toBeTypeOf('function')

    const context = {
      arc: vi.fn(),
      beginPath: vi.fn(),
      canvas: { height: 30, width: 120 },
      closePath: vi.fn(),
      fill: vi.fn(),
      fillStyle: '#000000',
      lineWidth: 0,
      lineTo: vi.fn(),
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
      stroke: vi.fn(),
      strokeStyle: '',
      translate: vi.fn(),
    }

    renderFunction([new Float32Array([0.2, 0.5, 0.3, 0.7, 0.4, 0.6])], context)

    expect(context.save).toHaveBeenCalled()
    expect(context.translate).toHaveBeenCalledWith(0, 15)
    expect(context.arc).toHaveBeenCalled()
    expect(context.lineWidth).toBe(1.5)
    expect(context.stroke).toHaveBeenCalled()
    expect(context.restore).toHaveBeenCalled()
    expect(context.fill).not.toHaveBeenCalled()
  })

  it('会保留合法的 CSS 颜色关键字，不错误包裹 oklch', async () => {
    document.documentElement.style.setProperty('--primary', 'red')
    document.documentElement.style.setProperty('--muted-foreground', 'blue')

    await renderStatementAudioPreview()

    expect(waveSurferCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      progressColor: 'red',
      waveColor: 'blue',
    }))
  })

  it('会将裸 OKLCH 主题通道值解析为合法颜色', async () => {
    document.documentElement.style.setProperty('--primary', '0.62 0.19 259')
    document.documentElement.style.setProperty('--muted-foreground', '0.48 0.02 264')

    await renderStatementAudioPreview()

    expect(waveSurferCreateMock).toHaveBeenCalledWith(expect.objectContaining({
      progressColor: 'oklch(0.62 0.19 259)',
      waveColor: 'oklch(0.662 0.011 264)',
    }))
  })

  it('未交互前保持占位直线且允许触发加载，ready 后切换到真实波形', async () => {
    await renderStatementAudioPreview()

    await expect.element(page.getByTestId('statement-audio-preview-toggle')).not.toHaveAttribute('disabled')
    await expect.element(page.getByTestId('statement-audio-preview-placeholder')).toHaveAttribute('data-state', 'visible')
    await expect.element(page.getByTestId('statement-audio-preview-placeholder-line')).toHaveClass('h-[1.5px]')
    await expect.element(page.getByTestId('statement-audio-preview-waveform')).toHaveAttribute('data-state', 'loading')

    emitWaveSurferEvent('ready')

    await expect.element(page.getByTestId('statement-audio-preview-toggle')).not.toHaveAttribute('disabled')
    await expect.element(page.getByTestId('statement-audio-preview-placeholder')).toHaveAttribute('data-state', 'hidden')
    await expect.element(page.getByTestId('statement-audio-preview-waveform')).toHaveAttribute('data-state', 'ready')
  })

  it('会为播放按钮提供可访问名称，并在播放状态下切换为暂停说明', async () => {
    await renderStatementAudioPreview()

    await expect.element(page.getByTestId('statement-audio-preview-toggle')).toHaveAttribute('aria-label', '播放音频')

    await page.getByTestId('statement-audio-preview-toggle').click()
    emitWaveSurferEvent('ready')
    await vi.waitFor(() => {
      expect(waveSurferPlayMock).toHaveBeenCalledOnce()
    })

    waveSurferState.isPlaying = true
    emitWaveSurferEvent('play')

    await expect.element(page.getByTestId('statement-audio-preview-toggle')).toHaveAttribute('aria-label', '暂停音频')
  })

  it('按钮禁用时仍会提供不可用的可访问名称', async () => {
    await renderStatementAudioPreview('')

    await expect.element(page.getByTestId('statement-audio-preview-toggle')).toHaveAttribute('aria-label', '音频预览当前不可用')
    await expect.element(page.getByTestId('statement-audio-preview-toggle')).toHaveAttribute('disabled')
  })

  it('src 变化时会重置为待加载状态，并在再次交互后加载新音频', async () => {
    const result = await renderStatementAudioPreview('/audio/alpha.mp3')

    await page.getByTestId('statement-audio-preview-toggle').click()
    expect(waveSurferLoadMock).toHaveBeenCalledWith('/audio/alpha.mp3')

    emitWaveSurferEvent('ready')

    await result.rerender({
      src: '/audio/beta.mp3',
    })

    expect(waveSurferLoadMock).not.toHaveBeenCalledWith('/audio/beta.mp3')

    await page.getByTestId('statement-audio-preview-toggle').click()
    expect(waveSurferLoadMock).toHaveBeenCalledWith('/audio/beta.mp3')

    await result.unmount()

    expect(waveSurferDestroyMock).toHaveBeenCalled()
  })

  it('初始加载失败时只会记录一次 warning', async () => {
    waveSurferLoadMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))

    await renderStatementAudioPreview()
    await page.getByTestId('statement-audio-preview-toggle').click()

    await vi.waitFor(() => {
      expect(loggerWarnMock).toHaveBeenCalledTimes(1)
    })

    expect(loggerWarnMock).toHaveBeenCalledWith('辅助面板音频预览加载失败 (/audio/theme.ogg): TypeError: Failed to fetch')
  })
})
