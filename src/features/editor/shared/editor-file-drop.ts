import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AbsPath } from '~/domain/path'
import { parseCommandNode, serializeCommandNode } from '~/domain/script/codec'
import { parseSentence } from '~/domain/script/parser'
import { serializeSentence } from '~/domain/script/serialize'
import { updateCommandNodeContent, updateCommandNodeParam } from '~/domain/script/update'
import { gameAssetDir, gameSceneDir } from '~/services/platform/app-paths'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { CommandParamDescriptor } from '~/domain/script/params'
import type { CommandNode } from '~/domain/script/types'
import type { FileSystemDragPayload } from '~/types/drag-drop'

export type EditorDropAssetType =
  | 'background'
  | 'figure'
  | 'bgm'
  | 'vocal'
  | 'video'
  | 'animation'
  | 'scene'

export interface EditorDropAsset {
  assetType: EditorDropAssetType
  scriptPath: string
}

interface AssetRootCandidate {
  assetType: EditorDropAssetType
  rootPath: AbsPath
}

interface DroppedFileItem {
  isDir: boolean
  path: string
}

const SAY_VOCAL_PARAM: CommandParamDescriptor = { key: 'vocal', type: 'file' }
const INTRO_BACKGROUND_PARAM: CommandParamDescriptor = { key: 'backgroundImage', type: 'file' }
const ANIMATION_TABLE_FILE_NAME = 'animationTable.json'
const JSON_FILE_SUFFIX = '.json'
const TXT_FILE_SUFFIX = '.txt'

const INSERTED_STATEMENT_COMMANDS: Record<EditorDropAssetType, {
  command: commandType
  commandRaw: string
}> = {
  animation: { command: commandType.setAnimation, commandRaw: 'setAnimation' },
  background: { command: commandType.changeBg, commandRaw: 'changeBg' },
  bgm: { command: commandType.bgm, commandRaw: 'bgm' },
  figure: { command: commandType.changeFigure, commandRaw: 'changeFigure' },
  scene: { command: commandType.changeScene, commandRaw: 'changeScene' },
  video: { command: commandType.video, commandRaw: 'playVideo' },
  vocal: { command: commandType.playEffect, commandRaw: 'playEffect' },
}

const CONTENT_UPDATE_COMMANDS: Record<EditorDropAssetType, readonly commandType[]> = {
  animation: [commandType.setAnimation],
  background: [commandType.changeBg, commandType.unlockCg],
  bgm: [commandType.bgm, commandType.unlockBgm],
  figure: [commandType.changeFigure, commandType.miniAvatar],
  scene: [commandType.changeScene, commandType.callScene],
  video: [commandType.video],
  vocal: [commandType.playEffect],
}

function createSentence(command: commandType, commandRaw: string, content: string): ISentence {
  return {
    command,
    commandRaw,
    content,
    args: [],
    inlineComment: '',
    sentenceAssets: [],
    subScene: [],
  }
}

function createAssetRootCandidates(gamePath: AbsPath): AssetRootCandidate[] {
  return [
    { assetType: 'background', rootPath: gameAssetDir(gamePath, 'background') },
    { assetType: 'figure', rootPath: gameAssetDir(gamePath, 'figure') },
    { assetType: 'bgm', rootPath: gameAssetDir(gamePath, 'bgm') },
    { assetType: 'vocal', rootPath: gameAssetDir(gamePath, 'vocal') },
    { assetType: 'video', rootPath: gameAssetDir(gamePath, 'video') },
    { assetType: 'animation', rootPath: gameAssetDir(gamePath, 'animation') },
    { assetType: 'scene', rootPath: gameSceneDir(gamePath) },
  ]
}

function resolveAnimationScriptPath(scriptPath: string): string | undefined {
  const normalizedScriptPath = scriptPath.toLowerCase()
  if (!normalizedScriptPath.endsWith(JSON_FILE_SUFFIX)) {
    return undefined
  }
  if (normalizedScriptPath === ANIMATION_TABLE_FILE_NAME.toLowerCase()) {
    return undefined
  }

  return scriptPath.slice(0, -JSON_FILE_SUFFIX.length)
}

function resolveScriptPath(assetType: EditorDropAssetType, scriptPath: string): string | undefined {
  if (assetType === 'animation') {
    return resolveAnimationScriptPath(scriptPath)
  }

  if (assetType === 'scene' && !scriptPath.toLowerCase().endsWith(TXT_FILE_SUFFIX)) {
    return undefined
  }

  return scriptPath
}

function resolveSingleDroppedFile(payload: FileSystemDragPayload): DroppedFileItem | undefined {
  if (payload.items && payload.items.length > 1) {
    return undefined
  }

  const item = payload.items?.[0] ?? payload
  return item.isDir ? undefined : item
}

export function resolveEditorDropAsset(options: {
  gamePath: AbsPath
  payload: FileSystemDragPayload
}): EditorDropAsset | undefined {
  const { gamePath, payload } = options
  const item = resolveSingleDroppedFile(payload)
  if (!item) {
    return undefined
  }

  let sourcePath: AbsPath
  try {
    sourcePath = AbsPath.from(item.path)
  } catch {
    return undefined
  }

  for (const { assetType, rootPath } of createAssetRootCandidates(gamePath)) {
    try {
      const scriptPath = AbsPath.relativize(sourcePath, rootPath)
      const normalizedScriptPath = resolveScriptPath(assetType, scriptPath)
      if (!normalizedScriptPath) {
        return undefined
      }
      return {
        assetType,
        scriptPath: normalizedScriptPath,
      }
    } catch {
      // 不是当前资源目录，继续尝试下一个候选目录。
      continue
    }
  }

  return undefined
}

export function buildInsertedStatementText(asset: EditorDropAsset): string {
  const { command, commandRaw } = INSERTED_STATEMENT_COMMANDS[asset.assetType]
  return serializeSentence(createSentence(command, commandRaw, asset.scriptPath))
}

function supportsContentUpdate(asset: EditorDropAsset, type: commandType): boolean {
  return CONTENT_UPDATE_COMMANDS[asset.assetType].includes(type)
}

function upsertChooseSceneChoice(node: Extract<CommandNode, { type: commandType.choose }>, file: string): CommandNode {
  const lastChoice = node.choices.at(-1)
  if (!lastChoice || lastChoice.file.trim().length > 0) {
    return {
      ...node,
      choices: [...node.choices, { name: '', file }],
    }
  }

  return {
    ...node,
    choices: [
      ...node.choices.slice(0, -1),
      { ...lastChoice, file },
    ],
  }
}

export function updateStatementTextForDroppedAsset(rawText: string, asset: EditorDropAsset): string | undefined {
  const sentence = parseSentence(rawText)
  if (!sentence) {
    return undefined
  }

  const node = parseCommandNode(sentence)

  if (asset.assetType === 'scene' && node.type === commandType.choose) {
    return serializeSentence(serializeCommandNode(upsertChooseSceneChoice(node, asset.scriptPath)))
  }

  if (asset.assetType === 'background' && node.type === commandType.intro) {
    const updated = updateCommandNodeParam(node, INTRO_BACKGROUND_PARAM, asset.scriptPath)
    return updated ? serializeSentence(serializeCommandNode(updated)) : undefined
  }

  if (asset.assetType === 'vocal' && node.type === commandType.say) {
    const updated = updateCommandNodeParam(node, SAY_VOCAL_PARAM, asset.scriptPath)
    if (!updated) {
      return undefined
    }

    const serialized = serializeCommandNode(updated)
    return serializeSentence(sentence.commandRaw === 'say'
      ? { ...serialized, commandRaw: 'say' }
      : serialized)
  }

  if (!supportsContentUpdate(asset, node.type)) {
    return undefined
  }

  return serializeSentence(serializeCommandNode(
    updateCommandNodeContent(node, asset.scriptPath),
  ))
}
