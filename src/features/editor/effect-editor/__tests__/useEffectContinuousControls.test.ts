import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { effectParamForPath } from '~/features/editor/effect-editor/effect-editor-config'
import { useEffectContinuousControls } from '~/features/editor/effect-editor/useEffectContinuousControls'

import type { ImmediatePointerDragEvent } from '~/composables/useImmediatePointerDrag'
import type { DialField, NumberField } from '~/features/editor/command-registry/schema'
import type { EffectDialField, EffectNumberField } from '~/features/editor/effect-editor/effect-editor-config'
import type { EffectControlDeps } from '~/features/editor/effect-editor/types'

type ParamDragState = object & { param: unknown }

interface ParamDragRuntime {
  cancel: () => void
  end: (event?: ImmediatePointerDragEvent) => void
  move: (event: ImmediatePointerDragEvent) => void
  state: ParamDragState | undefined
}

const { paramDragRuntimes, setupPreferenceStoreMock, usePreferenceStoreMock } = vi.hoisted(() => {
  const usePreferenceStoreMock = vi.fn()
  const paramDragRuntimes: ParamDragRuntime[] = []

  function setupPreferenceStoreMock() {
    return {
      usePreferenceStore: usePreferenceStoreMock,
    }
  }

  return {
    paramDragRuntimes,
    setupPreferenceStoreMock,
    usePreferenceStoreMock,
  }
})

const preferenceStoreState = reactive({
  effectEditorLinkedSliderLocks: {} as Record<string, boolean>,
})
const animationFrameCallbacks = new Map<number, FrameRequestCallback>()
let nextAnimationFrameId = 0

vi.mock('~/stores/preference', setupPreferenceStoreMock)

vi.mock('~/features/editor/effect-editor/createParamDrag', () => ({
  createParamDrag<P, S extends object>(callbacks: {
    onCancel?: (state: S & { param: P }) => void
    onEnd: (event: ImmediatePointerDragEvent | undefined, state: S & { param: P }) => void
    onMove: (event: ImmediatePointerDragEvent, state: S & { param: P }) => void
    onStart: (event: ImmediatePointerDragEvent, param: P) => S | undefined
  }) {
    const runtime: ParamDragRuntime = {
      state: undefined,
      cancel() {
        if (!runtime.state) {
          return
        }
        const currentState = runtime.state as S & { param: P }
        runtime.state = undefined
        callbacks.onCancel?.(currentState)
      },
      move(event) {
        if (!runtime.state) {
          return
        }
        callbacks.onMove(event, runtime.state as S & { param: P })
      },
      end(event) {
        if (!runtime.state) {
          return
        }
        const currentState = runtime.state as S & { param: P }
        runtime.state = undefined
        callbacks.onEnd(event, currentState)
      },
    }

    paramDragRuntimes.push(runtime)

    return {
      drag: {
        get active() {
          return runtime.state !== undefined
        },
        get state() {
          return runtime.state as (S & { param: P }) | undefined
        },
        start() {
          return false
        },
        stop(event?: ImmediatePointerDragEvent) {
          runtime.end(event)
        },
        cancel() {
          runtime.cancel()
        },
      },
      start(event: ImmediatePointerDragEvent, param: P) {
        const state = callbacks.onStart(event, param)
        if (!state) {
          runtime.state = undefined
          return false
        }
        runtime.state = { ...state, param } as S & { param: P }
        return true
      },
    }
  },
}))

function createDeps(initialFields: Record<string, string> = {}) {
  const fields = reactive({ ...initialFields }) as Record<string, string>
  const emitTransform = vi.fn()

  const deps: EffectControlDeps = {
    getFields: () => fields,
    getFieldValue: path => fields[path] ?? '',
    getStoredFieldValue: path => fields[path],
    getNumberValue: (path, fallback) => {
      const value = Number(fields[path])
      return Number.isFinite(value) ? value : fallback
    },
    setNumericField: (targetFields, path, value) => {
      targetFields[path] = String(value)
    },
    emitTransform,
  }

  return { deps, emitTransform, fields }
}

function createSnapshotDeps(initialFields: Record<string, string> = {}) {
  const sourceFields = reactive({ ...initialFields }) as Record<string, string>
  const emitTransform = vi.fn()

  const deps: EffectControlDeps = {
    getFields: () => ({ ...sourceFields }),
    getFieldValue: path => sourceFields[path] ?? '',
    getStoredFieldValue: path => sourceFields[path],
    getNumberValue: (path, fallback) => {
      const value = Number(sourceFields[path])
      return Number.isFinite(value) ? value : fallback
    },
    setNumericField: (targetFields, path, value) => {
      targetFields[path] = String(value)
    },
    emitTransform,
  }

  return { deps, emitTransform, sourceFields }
}

function createNumberField(overrides: Partial<NumberField> = {}): NumberField {
  return {
    key: 'x',
    type: 'number',
    label: '',
    ...overrides,
  }
}

function createLinkedNumberField(
  overrides: Partial<NumberField & { linkedPairKey: string }> = {},
): NumberField & { linkedPairKey: string } {
  return {
    key: 'scaleX',
    type: 'number',
    label: '',
    linkedPairKey: 'scaleY',
    ...overrides,
  }
}

function createDialField(overrides: Partial<DialField> = {}): DialField {
  return {
    key: 'rotate',
    type: 'dial',
    label: '',
    dialUnit: 'rad',
    ...overrides,
  }
}

function getEffectNumberParam(path: string): EffectNumberField {
  const param = effectParamForPath(path)
  if (param?.type !== 'number') {
    throw new Error(`Expected numeric effect parameter: ${path}`)
  }
  return param
}

function getEffectDialParam(path: string): EffectDialField {
  const param = effectParamForPath(path)
  if (param?.type !== 'dial') {
    throw new Error(`Expected dial effect parameter: ${path}`)
  }
  return param
}

function createPointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    altKey: false,
    button: 0,
    buttons: 1,
    clientX: 100,
    clientY: 100,
    pointerId: 1,
    pointerType: 'mouse',
    preventDefault: vi.fn(),
    shiftKey: false,
    ...overrides,
  } as PointerEvent
}

function getParamDragRuntime(index: number): ParamDragRuntime {
  const runtime = paramDragRuntimes[index]
  expect(runtime).toBeDefined()
  return runtime!
}

function flushNextAnimationFrame() {
  const nextFrame = animationFrameCallbacks.entries().next().value
  expect(nextFrame).toBeDefined()
  const [frameId, callback] = nextFrame!
  animationFrameCallbacks.delete(frameId)
  callback(performance.now())
}

function flushAllAnimationFrames() {
  while (animationFrameCallbacks.size > 0) {
    flushNextAnimationFrame()
  }
}

describe('useEffectContinuousControls', () => {
  beforeEach(() => {
    usePreferenceStoreMock.mockReset()
    preferenceStoreState.effectEditorLinkedSliderLocks = {}
    usePreferenceStoreMock.mockReturnValue(preferenceStoreState)
    paramDragRuntimes.length = 0
    animationFrameCallbacks.clear()
    nextAnimationFrameId = 0

    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      animationFrameCallbacks.delete(frameId)
    }))
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      nextAnimationFrameId += 1
      animationFrameCallbacks.set(nextAnimationFrameId, callback)
      return nextAnimationFrameId
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updateNumberField 支持裁剪并 flush 最终值', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)

    controls.updateNumberField(createNumberField({
      min: 0,
      max: 10,
    }), '12', { flush: true, clampValue: true })

    expect(fields.x).toBe('10')
    expect(emitTransform).toHaveBeenCalledWith(fields, {
      flush: true,
      deferAutoApply: false,
    })
  })

  it('position scrub 在同一帧内合并连续 transform 发射', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)
    const field = createNumberField({
      defaultValue: 0,
      effectGroup: 'position',
      key: 'position.x',
      scrubStep: 1,
    })

    controls.handleNumberLabelPointerDown(createPointerEvent(), field)
    const numberScrub = getParamDragRuntime(0)

    numberScrub.move(createPointerEvent({ clientX: 101 }))
    numberScrub.move(createPointerEvent({ clientX: 105 }))

    expect(fields['position.x']).toBe('5')
    expect(emitTransform).not.toHaveBeenCalled()

    flushNextAnimationFrame()

    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: false,
      deferAutoApply: true,
      frameReady: true,
    })

    numberScrub.end(createPointerEvent({ clientX: 105 }))

    expect(emitTransform).toHaveBeenCalledTimes(2)
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: true,
      deferAutoApply: false,
    })
  })

  it('number scrub 取消时会取消当前预览交互而不是 flush 最终值', () => {
    const { deps, emitTransform } = createDeps()
    const cancelPreview = vi.fn()
    const depsWithCancel = deps as EffectControlDeps & { cancelPreview: () => void }
    depsWithCancel.cancelPreview = cancelPreview
    const controls = useEffectContinuousControls(depsWithCancel)
    const field = createNumberField({
      defaultValue: 0,
      key: 'position.x',
      scrubStep: 1,
    })

    controls.handleNumberLabelPointerDown(createPointerEvent(), field)
    const numberScrub = getParamDragRuntime(0)

    numberScrub.move(createPointerEvent({ clientX: 104 }))
    flushNextAnimationFrame()
    numberScrub.cancel()

    expect(cancelPreview).toHaveBeenCalledOnce()
    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.any(Object), {
      flush: false,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('滑条拖拽在同一帧内只发射最后一次 transform', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)
    const field = createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
    })

    controls.updateSliderField(field, 0.8, { fromSlider: true })
    controls.updateSliderField(field, 0.6, { fromSlider: true })

    expect(fields.alpha).toBe('0.6')
    expect(emitTransform).not.toHaveBeenCalled()

    flushNextAnimationFrame()

    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: undefined,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('按展示元数据将百分比输入写回原始倍率且不限制泛光强度', () => {
    const { deps, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)
    const alpha = getEffectNumberParam('alpha')
    const bloom = getEffectNumberParam('bloom')

    controls.updateSliderField(alpha, 80)
    controls.updateSliderField(bloom, 250)

    expect(fields.alpha).toBe('0.8')
    expect(fields.bloom).toBe('2.5')
    expect(controls.getSliderMax(bloom)).toBe(500)

    controls.updateSliderField(bloom, 500, { fromSlider: true })
    expect(fields.bloom).toBe('5')
  })

  it('百分比滑条拖拽后重新读取轨道值不会出现浮点长尾', () => {
    const { deps, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)
    const scaleX = getEffectNumberParam('scale.x')

    controls.updateSliderField(scaleX, 113, { fromSlider: true })

    expect(fields['scale.x']).toBe('1.13')
    expect(controls.getSliderTrackValue(scaleX)).toEqual([113])
  })

  it('滑条提交会取消尚未发射的拖拽 transform', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)
    const field = createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
      step: 0.01,
    })

    controls.updateSliderField(field, 0.8, { fromSlider: true })
    controls.updateSliderField(field, 0.6, { fromSlider: true, flush: true })

    expect(fields.alpha).toBe('0.6')
    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(fields, {
      flush: true,
      deferAutoApply: false,
    })

    expect(animationFrameCallbacks.size).toBe(0)
    expect(emitTransform).toHaveBeenCalledTimes(1)
  })

  it('普通滑条与联动滑条会应用中心吸附与锁定比例', () => {
    const { deps, fields } = createDeps({
      scaleX: '2',
      scaleY: '4',
      offset: '0.01',
    })
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      min: 0,
      max: 100,
    })

    controls.updateSliderField(createNumberField({
      key: 'offset',
      min: -1,
      max: 1,
      center: 0,
    }), 0.01, { fromSlider: true })
    expect(fields.offset).toBe('0')

    controls.toggleLinkedSliderLock(linkedField)
    controls.toggleLinkedSliderLock(linkedField)
    controls.updateLinkedSliderField(linkedField, 0, 6)
    expect(fields.scaleX).toBe('6')
    expect(fields.scaleY).toBe('12')
  })

  it('滑条仅回传当前默认值时不会写入缺失字段', () => {
    const { deps, emitTransform, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)

    controls.updateSliderField(createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
    }), 1, { fromSlider: true, flush: true })

    expect(fields.alpha).toBeUndefined()
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('滑条回到缺失字段默认值时不会发射同帧内排队的旧值', () => {
    const { deps, emitTransform, sourceFields } = createSnapshotDeps()
    const controls = useEffectContinuousControls(deps)
    const field = createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
    })

    controls.updateSliderField(field, 0.8, { fromSlider: true })
    controls.updateSliderField(field, 1, { fromSlider: true })
    flushAllAnimationFrames()

    expect(sourceFields.alpha).toBeUndefined()
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('滑条回到默认值时不会取消只触碰其他字段的待发射变更', () => {
    const { deps, emitTransform, sourceFields } = createSnapshotDeps({
      alpha: '1',
    })
    const controls = useEffectContinuousControls(deps)
    const alphaField = createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
    })
    const blurField = createNumberField({
      key: 'blur',
      defaultValue: 0,
      min: 0,
      max: 50,
    })

    controls.updateSliderField(blurField, 8, { fromSlider: true })
    delete sourceFields.alpha
    controls.updateSliderField(alphaField, 1, { fromSlider: true })
    flushAllAnimationFrames()

    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.objectContaining({
      blur: '8',
    }), {
      flush: undefined,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('滑条清理后一帧内部分待发射字段时会保留其他已触碰字段', () => {
    const { deps, emitTransform } = createSnapshotDeps()
    const controls = useEffectContinuousControls(deps)
    const alphaField = createNumberField({
      key: 'alpha',
      defaultValue: 1,
      min: 0,
      max: 1,
    })
    const blurField = createNumberField({
      key: 'blur',
      defaultValue: 0,
      min: 0,
      max: 50,
    })

    controls.updateSliderField(alphaField, 0.8, { fromSlider: true })
    controls.updateSliderField(blurField, 8, { fromSlider: true })
    controls.updateSliderField(blurField, 0, { fromSlider: true })
    flushAllAnimationFrames()

    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.objectContaining({
      alpha: '0.8',
    }), {
      flush: undefined,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('联动滑条回到缺失字段默认值时不会发射同帧内排队的旧值', () => {
    const { deps, emitTransform, sourceFields } = createSnapshotDeps()
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      defaultValue: 1,
      min: 0,
      max: 2,
    })

    controls.updateLinkedSliderField(linkedField, 0, 0.8, { fromSlider: true })
    controls.updateLinkedSliderField(linkedField, 0, 1, { fromSlider: true })
    flushAllAnimationFrames()

    expect(sourceFields.scaleX).toBeUndefined()
    expect(sourceFields.scaleY).toBeUndefined()
    expect(emitTransform).not.toHaveBeenCalled()
  })

  it('联动滑条回到默认值时不会取消只触碰其他字段的待发射变更', () => {
    const { deps, emitTransform, sourceFields } = createSnapshotDeps({
      scaleX: '1',
      scaleY: '1',
    })
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      defaultValue: 1,
      min: 0,
      max: 2,
    })
    const blurField = createNumberField({
      key: 'blur',
      defaultValue: 0,
      min: 0,
      max: 50,
    })

    controls.updateSliderField(blurField, 8, { fromSlider: true })
    delete sourceFields.scaleX
    delete sourceFields.scaleY
    controls.updateLinkedSliderField(linkedField, 0, 1, { fromSlider: true })
    flushAllAnimationFrames()

    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.objectContaining({
      blur: '8',
    }), {
      flush: undefined,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('锁定快照主轴为 0 时联动滑条会回退为双轴同步', () => {
    const { deps, fields } = createDeps({
      scaleX: '0',
      scaleY: '5',
    })
    const controls = useEffectContinuousControls(deps)
    const linkedField = createLinkedNumberField({
      min: 0,
      max: 100,
    })

    controls.toggleLinkedSliderLock(linkedField)
    controls.toggleLinkedSliderLock(linkedField)
    controls.updateLinkedSliderField(linkedField, 0, 3)

    expect(fields.scaleX).toBe('3')
    expect(fields.scaleY).toBe('3')
  })

  it('dial 拖拽取消时会取消当前预览交互而不是 flush 最终值', () => {
    const { deps, emitTransform } = createDeps()
    const cancelPreview = vi.fn()
    const depsWithCancel = deps as EffectControlDeps & { cancelPreview: () => void }
    depsWithCancel.cancelPreview = cancelPreview
    const controls = useEffectContinuousControls(depsWithCancel)
    const field = createDialField({
      dialUnit: 'deg',
    })

    controls.handleDialPointerDown(createPointerEvent({
      currentTarget: {
        getBoundingClientRect: () => ({
          height: 20,
          left: 90,
          top: 90,
          width: 20,
        }),
      } as unknown as EventTarget,
    }), field)
    const dialDrag = getParamDragRuntime(1)

    dialDrag.move(createPointerEvent({ clientX: 100, clientY: 120 }))
    flushNextAnimationFrame()
    dialDrag.cancel()

    expect(cancelPreview).toHaveBeenCalledOnce()
    expect(emitTransform).toHaveBeenCalledTimes(1)
    expect(emitTransform).toHaveBeenLastCalledWith(expect.any(Object), {
      flush: false,
      deferAutoApply: true,
      frameReady: true,
    })
  })

  it('dial 会在 deg/rad 之间双向转换，并保留四位弧度精度', () => {
    const { deps, fields } = createDeps({
      rotate: String(Math.PI),
    })
    const controls = useEffectContinuousControls(deps)

    const dialField = createDialField()

    expect(controls.getDialDegree(dialField)).toBeCloseTo(180)
    controls.updateDialField(dialField, 90)
    expect(Number(fields.rotate)).toBeCloseTo(1.5708)
    expect(controls.getDialInputValue(dialField)).toBe('90')
  })

  it('容器和斜面旋转使用相同角度展示但保留各自存储单位', () => {
    const { deps, fields } = createDeps({
      bevelRotation: '45',
      rotation: String(Math.PI / 2),
    })
    const controls = useEffectContinuousControls(deps)
    const rotation = getEffectDialParam('rotation')
    const bevelRotation = getEffectDialParam('bevelRotation')

    expect(controls.getDialInputValue(rotation)).toBe('90')
    expect(controls.getDialInputValue(bevelRotation)).toBe('45')

    controls.updateDialField(rotation, 180)
    controls.updateDialField(bevelRotation, 90)

    expect(fields.rotation).toBe('3.1416')
    expect(fields.bevelRotation).toBe('90')
  })

  it('dial 提交已有值时不会把弧度存储值当成角度重复转换', () => {
    const { deps, fields } = createDeps({
      rotate: String(Math.PI / 2),
    })
    const controls = useEffectContinuousControls(deps)

    controls.updateDialField(createDialField(), '90', { flush: true })

    expect(Number(fields.rotate)).toBeCloseTo(Math.PI / 2)
  })

  it('角度旋钮会按展示精度写入，避免显示值和生效值不一致', () => {
    const { deps, fields } = createDeps()
    const controls = useEffectContinuousControls(deps)

    controls.updateDialField(createDialField({
      dialUnit: 'deg',
    }), 12.3456)

    expect(fields.rotate).toBe('12.35')
    expect(controls.getDialInputValue(createDialField({
      dialUnit: 'deg',
    }))).toBe('12.35')
  })
})
