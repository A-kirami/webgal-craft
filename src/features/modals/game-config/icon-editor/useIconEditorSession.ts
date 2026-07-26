import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { readFile } from '@tauri-apps/plugin-fs'
import { computed, markRaw, ref, shallowRef, toValue, watch } from 'vue'

import { AbsPath } from '~/domain/path'
import { gameManager } from '~/services/game-manager'
import { fromExternalAbsPath } from '~/services/platform/path-boundary'
import { handleError } from '~/utils/error-handler'

import {
  createDefaultOffsetRatio,
  isIconEditorBackgroundType,
  isIconEditorShape,
  normalizeTransformNumber,
  OFFSET_PERCENT_CENTER,
  OFFSET_PERCENT_MAX,
  OFFSET_PERCENT_MIN,
  OFFSET_PERCENT_STEP,
  percentToRatio,
  percentToScale,
  ratioToPercent,
  resolveBackgroundColor,
  SCALE_PERCENT_CENTER,
  SCALE_PERCENT_MAX,
  SCALE_PERCENT_MIN,
  SCALE_PERCENT_STEP,
  scaleToPercent,
} from './icon-editor-controls'
import { buildIconExportOutputs, saveIconEditorOutputs } from './icon-editor-export'
import { loadIconEditorSourceData } from './icon-editor-source'
import { createDefaultIconEditorState, ICON_EDITOR_DEFAULT_SCALE } from './icon-editor-state'

import type {
  IconEditorTransformAxis,
  IconEditorTransformControl,
  IconEditorTransformControlValue,
  IconEditorTransformUpdateOptions,
} from './icon-editor-controls'
import type { IconEditorImageSource, IconEditorState } from './icon-editor-state'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { I18nT } from '~/utils/i18n-like'

interface UseIconEditorSessionOptions {
  gamePath: MaybeRefOrGetter<AbsPath>
  open: Ref<boolean>
  t: I18nT
}

function createIconEditorStateSnapshot(state: IconEditorState): IconEditorState {
  return {
    ...state,
    backgroundOffsetRatio: { ...state.backgroundOffsetRatio },
    foregroundOffsetRatio: { ...state.foregroundOffsetRatio },
  }
}

function isIconEditorStateEqual(left: IconEditorState, right: IconEditorState): boolean {
  return left.backgroundColor === right.backgroundColor
    && left.backgroundImage === right.backgroundImage
    && left.backgroundOffsetRatio.x === right.backgroundOffsetRatio.x
    && left.backgroundOffsetRatio.y === right.backgroundOffsetRatio.y
    && left.backgroundScale === right.backgroundScale
    && left.backgroundType === right.backgroundType
    && left.foregroundImage === right.foregroundImage
    && left.foregroundOffsetRatio.x === right.foregroundOffsetRatio.x
    && left.foregroundOffsetRatio.y === right.foregroundOffsetRatio.y
    && left.foregroundScale === right.foregroundScale
    && left.iconShape === right.iconShape
}

export function useIconEditorSession(options: UseIconEditorSessionOptions) {
  const state = ref(createDefaultIconEditorState())
  const previewVersion = ref(0)
  const isSaving = ref(false)
  const initialStateSnapshot = shallowRef(createIconEditorStateSnapshot(state.value))
  let restoreVersion = 0

  const foregroundName = computed(() => state.value.foregroundImage
    ? options.t('modals.gameConfig.iconEditor.imageSelected')
    : options.t('modals.gameConfig.iconEditor.noImage'))
  const backgroundName = computed(() => state.value.backgroundImage
    ? options.t('modals.gameConfig.iconEditor.imageSelected')
    : options.t('modals.gameConfig.iconEditor.noImage'))
  const foregroundSelectLabel = computed(() => state.value.foregroundImage
    ? options.t('modals.gameConfig.iconEditor.replaceImage')
    : options.t('modals.gameConfig.iconEditor.selectImage'))
  const backgroundSelectLabel = computed(() => state.value.backgroundImage
    ? options.t('modals.gameConfig.iconEditor.replaceImage')
    : options.t('modals.gameConfig.iconEditor.selectImage'))
  const canGenerate = computed(() => Boolean(toValue(options.gamePath) && state.value.foregroundImage && !isSaving.value))
  const isDirty = computed(() => !isIconEditorStateEqual(state.value, initialStateSnapshot.value))

  const foregroundTransformControls = computed((): IconEditorTransformControl[] => [
    createScaleControl('foreground', state.value.foregroundScale, setForegroundScale),
    createOffsetControl('foreground', 'x', state.value.foregroundOffsetRatio.x, setForegroundOffset),
    createOffsetControl('foreground', 'y', state.value.foregroundOffsetRatio.y, setForegroundOffset),
  ])

  const backgroundTransformControls = computed((): IconEditorTransformControl[] => [
    createScaleControl('background', state.value.backgroundScale, setBackgroundScale),
    createOffsetControl('background', 'x', state.value.backgroundOffsetRatio.x, setBackgroundOffset),
    createOffsetControl('background', 'y', state.value.backgroundOffsetRatio.y, setBackgroundOffset),
  ])

  function createScaleControl(
    layer: 'background' | 'foreground',
    value: number,
    update: (value: IconEditorTransformControlValue, updateOptions?: IconEditorTransformUpdateOptions) => void,
  ): IconEditorTransformControl {
    return {
      id: `icon-editor-${layer}-scale`,
      label: options.t('modals.gameConfig.iconEditor.controls.scale'),
      max: SCALE_PERCENT_MAX,
      min: SCALE_PERCENT_MIN,
      step: SCALE_PERCENT_STEP,
      update,
      value: scaleToPercent(value),
    }
  }

  function createOffsetControl(
    layer: 'background' | 'foreground',
    axis: IconEditorTransformAxis,
    value: number,
    update: (
      axis: IconEditorTransformAxis,
      value: IconEditorTransformControlValue,
      updateOptions?: IconEditorTransformUpdateOptions,
    ) => void,
  ): IconEditorTransformControl {
    return {
      id: `icon-editor-${layer}-offset-${axis}`,
      label: getOffsetControlLabel(axis),
      max: OFFSET_PERCENT_MAX,
      min: OFFSET_PERCENT_MIN,
      step: OFFSET_PERCENT_STEP,
      update: (nextValue, updateOptions) => update(axis, nextValue, updateOptions),
      value: ratioToPercent(value),
    }
  }

  function normalizeScaleValue(
    value: IconEditorTransformControlValue,
    currentScale: number,
    updateOptions: IconEditorTransformUpdateOptions,
  ): number {
    return percentToScale(normalizeTransformNumber(value, {
      center: SCALE_PERCENT_CENTER,
      fallback: scaleToPercent(currentScale),
      max: SCALE_PERCENT_MAX,
      min: SCALE_PERCENT_MIN,
      snapToCenter: updateOptions.fromSlider,
      step: SCALE_PERCENT_STEP,
    }))
  }

  function normalizeOffsetValue(
    value: IconEditorTransformControlValue,
    currentRatio: number,
    updateOptions: IconEditorTransformUpdateOptions,
  ): number {
    return percentToRatio(normalizeTransformNumber(value, {
      center: OFFSET_PERCENT_CENTER,
      fallback: ratioToPercent(currentRatio),
      max: OFFSET_PERCENT_MAX,
      min: OFFSET_PERCENT_MIN,
      snapToCenter: updateOptions.fromSlider,
      step: OFFSET_PERCENT_STEP,
    }))
  }

  function getOffsetControlLabel(axis: IconEditorTransformAxis): string {
    if (axis === 'x') {
      return options.t('modals.gameConfig.iconEditor.controls.offsetX')
    }

    return options.t('modals.gameConfig.iconEditor.controls.offsetY')
  }

  function bumpPreviewVersion() {
    previewVersion.value += 1
  }

  function resetEditorState() {
    state.value = createDefaultIconEditorState()
    initialStateSnapshot.value = createIconEditorStateSnapshot(state.value)
    bumpPreviewVersion()
  }

  function invalidateRestore() {
    restoreVersion += 1
    return restoreVersion
  }

  function isCurrentRestore(version: number, gamePath: AbsPath) {
    return restoreVersion === version
      && options.open.value
      && AbsPath.equals(toValue(options.gamePath), gamePath)
  }

  async function loadImageFromBytes(bytes: Uint8Array): Promise<IconEditorImageSource> {
    const blob = new Blob([new Uint8Array(bytes)])
    const objectUrl = URL.createObjectURL(blob)

    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image()
        element.addEventListener('load', () => resolve(element), { once: true })
        element.addEventListener('error', () => reject(new Error('图片加载失败')), { once: true })
        element.src = objectUrl
      })

      return {
        bytes,
        image: markRaw(image),
      }
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  async function loadImageFromPath(path: AbsPath): Promise<IconEditorImageSource> {
    return await loadImageFromBytes(await readFile(path))
  }

  async function restoreEditorStateFromSource(gamePath: AbsPath, version: number) {
    const source = await loadIconEditorSourceData(gamePath)
    if (!source || !isCurrentRestore(version, gamePath)) {
      return
    }

    const {
      backgroundColor,
      backgroundOffsetRatio,
      backgroundScale,
      backgroundType,
      foregroundOffsetRatio,
      foregroundScale,
      iconShape,
    } = source.state
    const backgroundImage = source.backgroundBytes ? await loadImageFromBytes(source.backgroundBytes) : undefined
    const foregroundImage = await loadImageFromBytes(source.foregroundBytes)

    if (!isCurrentRestore(version, gamePath)) {
      return
    }

    state.value = {
      backgroundColor,
      backgroundImage,
      backgroundOffsetRatio,
      backgroundScale,
      backgroundType,
      foregroundImage,
      foregroundOffsetRatio,
      foregroundScale,
      iconShape,
    }
    initialStateSnapshot.value = createIconEditorStateSnapshot(state.value)
    bumpPreviewVersion()
  }

  watch(
    [options.open, () => toValue(options.gamePath)],
    async ([isOpen, gamePath]) => {
      const version = invalidateRestore()
      if (!isOpen) {
        resetEditorState()
        isSaving.value = false
        return
      }

      resetEditorState()
      try {
        await restoreEditorStateFromSource(gamePath, version)
      } catch (error) {
        if (!isCurrentRestore(version, gamePath)) {
          return
        }

        handleError(error)
        resetEditorState()
        isSaving.value = false
      }
    },
    { immediate: true },
  )

  async function selectImage(): Promise<IconEditorImageSource | undefined> {
    const selected = await openDialog({
      directory: false,
      filters: [{
        name: options.t('modals.gameConfig.iconEditor.imageFilter'),
        extensions: ['png', 'jpg', 'jpeg', 'webp'],
      }],
      multiple: false,
    })

    if (!selected || Array.isArray(selected)) {
      return
    }

    return await loadImageFromPath(fromExternalAbsPath(selected))
  }

  async function selectForeground() {
    try {
      const image = await selectImage()
      if (!image) {
        return
      }

      state.value = {
        ...state.value,
        foregroundImage: image,
        foregroundOffsetRatio: createDefaultOffsetRatio(),
        foregroundScale: ICON_EDITOR_DEFAULT_SCALE,
      }
      bumpPreviewVersion()
    } catch (error) {
      handleError(error, { context: options.t('modals.gameConfig.iconEditor.loadImageFailed') })
    }
  }

  async function selectBackgroundImage() {
    try {
      const image = await selectImage()
      if (!image) {
        return
      }

      state.value = {
        ...state.value,
        backgroundImage: image,
        backgroundOffsetRatio: createDefaultOffsetRatio(),
        backgroundScale: ICON_EDITOR_DEFAULT_SCALE,
        backgroundType: 'image',
      }
      bumpPreviewVersion()
    } catch (error) {
      handleError(error, { context: options.t('modals.gameConfig.iconEditor.loadImageFailed') })
    }
  }

  function setForegroundScale(value: IconEditorTransformControlValue, updateOptions: IconEditorTransformUpdateOptions = {}) {
    state.value.foregroundScale = normalizeScaleValue(value, state.value.foregroundScale, updateOptions)
    bumpPreviewVersion()
  }

  function setForegroundOffset(axis: IconEditorTransformAxis, value: IconEditorTransformControlValue, updateOptions: IconEditorTransformUpdateOptions = {}) {
    state.value.foregroundOffsetRatio = {
      ...state.value.foregroundOffsetRatio,
      [axis]: normalizeOffsetValue(value, state.value.foregroundOffsetRatio[axis], updateOptions),
    }
    bumpPreviewVersion()
  }

  function setBackgroundScale(value: IconEditorTransformControlValue, updateOptions: IconEditorTransformUpdateOptions = {}) {
    state.value.backgroundScale = normalizeScaleValue(value, state.value.backgroundScale, updateOptions)
    bumpPreviewVersion()
  }

  function setBackgroundOffset(axis: IconEditorTransformAxis, value: IconEditorTransformControlValue, updateOptions: IconEditorTransformUpdateOptions = {}) {
    state.value.backgroundOffsetRatio = {
      ...state.value.backgroundOffsetRatio,
      [axis]: normalizeOffsetValue(value, state.value.backgroundOffsetRatio[axis], updateOptions),
    }
    bumpPreviewVersion()
  }

  function setBackgroundType(value: unknown) {
    if (!isIconEditorBackgroundType(value)) {
      return
    }

    state.value.backgroundType = value
    bumpPreviewVersion()
  }

  function setBackgroundColor(value: unknown) {
    const backgroundColor = resolveBackgroundColor(value)
    if (!backgroundColor) {
      return
    }

    state.value.backgroundColor = backgroundColor
    state.value.backgroundType = 'color'
    bumpPreviewVersion()
  }

  function setIconShape(value: unknown) {
    if (!isIconEditorShape(value)) {
      return
    }

    state.value.iconShape = value
    bumpPreviewVersion()
  }

  async function generate() {
    const gamePath = toValue(options.gamePath)
    if (!gamePath || isSaving.value || !state.value.foregroundImage) {
      return
    }

    isSaving.value = true
    try {
      const outputs = await buildIconExportOutputs(state.value)
      await saveIconEditorOutputs(gamePath, outputs)
      await gameManager.refreshRegisteredGameSnapshot(gamePath, { invalidate: 'icon' })
      options.open.value = false
    } catch (error) {
      handleError(error, { context: options.t('modals.gameConfig.iconEditor.generateFailed') })
    } finally {
      isSaving.value = false
    }
  }

  return {
    backgroundName,
    backgroundSelectLabel,
    backgroundTransformControls,
    canGenerate,
    foregroundName,
    foregroundSelectLabel,
    foregroundTransformControls,
    generate,
    isDirty,
    isSaving,
    previewVersion,
    selectBackgroundImage,
    selectForeground,
    setBackgroundColor,
    setBackgroundType,
    setIconShape,
    state,
  }
}
