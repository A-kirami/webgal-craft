import { describe, expect, it } from 'vitest'

import {
  isTextEditorModelPath,
  resolveTextEditorWorkspacePath,
  toTextEditorWorkspacePath,
} from '~/helper/text-editor-model-uri'

const windowsScenePath = String.raw`X:\Project\WebGALCraft\game\scene.txt`
const windowsSceneUri = 'X:%5CProject%5CWebGALCraft%5Cgame%5Cscene.txt'
const unixScenePath = '/project/WebGALCraft/game/scene.txt'
const unixSceneUri = '/project/WebGALCraft/game/scene.txt'

describe('text editor model uri helpers', () => {
  it('会把 Windows/Unix Monaco model uri 还原为工作区文件路径，并处理边界输入', () => {
    expect(toTextEditorWorkspacePath(windowsSceneUri)).toBe(windowsScenePath)
    expect(toTextEditorWorkspacePath(unixSceneUri)).toBe(unixScenePath)
    expect(toTextEditorWorkspacePath('/project/a%23b.txt')).toBe('/project/a#b.txt')
    expect(toTextEditorWorkspacePath(undefined)).toBeUndefined()
    expect(toTextEditorWorkspacePath('')).toBeUndefined()
    expect(toTextEditorWorkspacePath('%')).toBe('%')
  })

  it('会按 Windows/Unix 工作区文件路径判断当前 model 是否匹配', () => {
    expect(isTextEditorModelPath(windowsSceneUri, windowsScenePath)).toBe(true)
    expect(isTextEditorModelPath(windowsSceneUri, String.raw`X:\Project\WebGALCraft\game\other.txt`)).toBe(false)
    expect(isTextEditorModelPath(unixSceneUri, unixScenePath)).toBe(true)
    expect(isTextEditorModelPath(unixSceneUri, '/project/WebGALCraft/game/other.txt')).toBe(false)
  })

  it('优先返回与当前 model uri 对应的活动标签路径', () => {
    expect(resolveTextEditorWorkspacePath({
      activeTabPath: windowsScenePath,
      modelUri: windowsSceneUri,
      openTabPaths: [String.raw`X:\Project\WebGALCraft\game\other.txt`],
      trackedPaths: [String.raw`X:\Project\WebGALCraft\game\stale.txt`],
    })).toBe(windowsScenePath)
  })

  it('活动标签不匹配时，会回退到已跟踪文件', () => {
    expect(resolveTextEditorWorkspacePath({
      activeTabPath: String.raw`X:\Project\WebGALCraft\game\active.txt`,
      modelUri: windowsSceneUri,
      openTabPaths: [String.raw`X:\Project\WebGALCraft\game\other.txt`],
      trackedPaths: [windowsScenePath],
    })).toBe(windowsScenePath)
  })

  it('活动标签和已跟踪文件都不匹配时，会回退到打开标签', () => {
    expect(resolveTextEditorWorkspacePath({
      activeTabPath: String.raw`X:\Project\WebGALCraft\game\active.txt`,
      modelUri: windowsSceneUri,
      openTabPaths: [windowsScenePath],
      trackedPaths: [String.raw`X:\Project\WebGALCraft\game\stale.txt`],
    })).toBe(windowsScenePath)
  })

  it('没有任何路径能命中当前 model uri 时返回 undefined', () => {
    expect(resolveTextEditorWorkspacePath({
      activeTabPath: String.raw`X:\Project\WebGALCraft\game\active.txt`,
      modelUri: windowsSceneUri,
      openTabPaths: [String.raw`X:\Project\WebGALCraft\game\other.txt`],
      trackedPaths: [String.raw`X:\Project\WebGALCraft\game\stale.txt`],
    })).toBeUndefined()
  })
})
