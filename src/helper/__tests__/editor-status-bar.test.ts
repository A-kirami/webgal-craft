import { describe, expect, it, vi } from 'vitest'

import { buildSingleStatement } from '~/helper/webgal-script/sentence'

import {
  calculateEditorStatusBarTextStats,
  isEditorStatusBarImagePreview,
  isEditorStatusBarSaved,
  resolveEditorStatusBarFileLanguage,
  resolveEditorStatusBarMetrics,
  shouldShowEditorStatusBarRelativeTime,
} from '../editor-status-bar'

import type {
  AnimationVisualProjectionState,
  AssetPreviewState,
  SceneVisualProjectionState,
  TextProjectionState,
} from '~/stores/editor'

function createTextState(overrides: Partial<TextProjectionState> = {}): TextProjectionState {
  return {
    isDirty: false,
    kind: 'scene',
    path: '/project/scene.txt',
    projection: 'text',
    textContent: '',
    textSource: 'projection',
    ...overrides,
  }
}

function createSceneVisualState(overrides: Partial<SceneVisualProjectionState> = {}): SceneVisualProjectionState {
  return {
    isDirty: false,
    kind: 'scene',
    path: '/project/scene.txt',
    projection: 'visual',
    statements: [],
    ...overrides,
  }
}

function createAnimationVisualState(
  overrides: Partial<AnimationVisualProjectionState> = {},
): AnimationVisualProjectionState {
  return {
    frames: [],
    isDirty: false,
    kind: 'animation',
    path: '/project/effect.json',
    projection: 'visual',
    ...overrides,
  }
}

function createPreviewState(overrides: Partial<AssetPreviewState> = {}): AssetPreviewState {
  return {
    assetUrl: 'asset://preview/background.png',
    mimeType: 'image/png',
    path: '/project/background.png',
    view: 'preview',
    ...overrides,
  }
}

describe('editor status bar helper', () => {
  it('文本模式会计算保存态、相对时间显示和行词统计', () => {
    const editableState = createTextState({
      lastSavedTime: new Date('2026-03-20T10:00:00.000Z'),
      textContent: 'hello world\nnext line',
    })

    expect(isEditorStatusBarSaved(editableState)).toBe(true)
    expect(shouldShowEditorStatusBarRelativeTime(true, editableState.lastSavedTime)).toBe(true)
    expect(calculateEditorStatusBarTextStats(editableState.textContent)).toEqual({
      lineCount: 2,
      wordCount: 4,
    })
    expect(resolveEditorStatusBarMetrics(editableState, {
      lineCount: 2,
      wordCount: 4,
    })).toEqual({
      kind: 'text',
      lineCount: 2,
      wordCount: 4,
    })
  })

  it('会为场景和动画文件返回内置语言名，为其他文件回退到编辑器语言名', () => {
    const t = vi.fn((key: string) => ({
      'edit.textEditor.languages.webgalscript': 'WebGAL Script',
      'edit.textEditor.languages.webgalanimation': 'WebGAL Animation',
    })[key] ?? key)
    const getLanguageDisplayName = vi.fn(() => 'SCSS')

    expect(resolveEditorStatusBarFileLanguage(createTextState(), { getLanguageDisplayName, t })).toBe('WebGAL Script')

    expect(resolveEditorStatusBarFileLanguage(createAnimationVisualState({
      frames: [{ duration: 200 }],
    }), { getLanguageDisplayName, t })).toBe('WebGAL Animation')

    expect(resolveEditorStatusBarFileLanguage(createTextState({
      kind: 'template',
      path: '/project/template/example.scss',
    }), { getLanguageDisplayName, t })).toBe('SCSS')
  })

  it('会根据编辑模式选择语句数、帧数或文本统计', () => {
    expect(resolveEditorStatusBarMetrics(createSceneVisualState({
      isDirty: true,
      statements: [
        buildSingleStatement('say:hello', 1),
        buildSingleStatement('say:world', 2),
        buildSingleStatement('changeBg:bg.jpg', 3),
      ],
    }), {
      lineCount: 0,
      wordCount: 0,
    })).toEqual({
      count: 3,
      kind: 'scene',
    })

    expect(resolveEditorStatusBarMetrics(createAnimationVisualState({
      frames: [
        { duration: 0 },
        { duration: 200 },
        { duration: 300 },
      ],
    }), {
      lineCount: 1,
      wordCount: 1,
    })).toEqual({
      count: 3,
      kind: 'animation',
    })
  })

  it('会识别图片预览并忽略非图片资源', () => {
    expect(isEditorStatusBarImagePreview(createPreviewState())).toBe(true)

    expect(isEditorStatusBarImagePreview(createPreviewState({
      assetUrl: 'asset://preview/theme.mp3',
      mimeType: 'audio/mpeg',
      path: '/project/theme.mp3',
    }))).toBe(false)
  })
})
