import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs'

import { fsCmds } from '~/commands/fs'
import { AbsPath, RelPath } from '~/domain/path'
import {
  GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH,
  GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH,
  GAME_ICON_DATA_STATE_RELATIVE_PATH,
} from '~/services/project-icon-assets'

import { canvasToPngBytes, renderIconCanvas, renderIconSourceSnapshotCanvas } from './icon-editor-render'
import { createPersistedIconEditorState } from './icon-editor-state'

import type { IconPreviewKind } from './icon-editor-render'
import type { IconEditorState } from './icon-editor-state'

export interface IconExportOutput {
  bytes: Uint8Array
  relativePath: RelPath
}

interface IconPngTarget {
  kind: IconPreviewKind
  relativePath: string
  size: number
}

const ICON_PNG_TARGETS: IconPngTarget[] = [
  { kind: 'web', relativePath: 'icons/apple-touch-icon.png', size: 180 },
  { kind: 'web', relativePath: 'icons/icon-192.png', size: 192 },
  { kind: 'web', relativePath: 'icons/icon-512.png', size: 512 },
  { kind: 'web-maskable', relativePath: 'icons/icon-192-maskable.png', size: 192 },
  { kind: 'web-maskable', relativePath: 'icons/icon-512-maskable.png', size: 512 },
]

const ICO_HEADER_SIZE = 6
const ICO_DIRECTORY_ENTRY_SIZE = 16

function writeUint16(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xFF
  bytes[offset + 1] = (value >> 8) & 0xFF
}

function writeUint32(bytes: Uint8Array, offset: number, value: number) {
  bytes[offset] = value & 0xFF
  bytes[offset + 1] = (value >> 8) & 0xFF
  bytes[offset + 2] = (value >> 16) & 0xFF
  bytes[offset + 3] = (value >> 24) & 0xFF
}

export function convertPngToIco(pngBytes: Uint8Array, size: number): Uint8Array {
  const imageOffset = ICO_HEADER_SIZE + ICO_DIRECTORY_ENTRY_SIZE
  const output = new Uint8Array(imageOffset + pngBytes.length)

  writeUint16(output, 0, 0)
  writeUint16(output, 2, 1)
  writeUint16(output, 4, 1)

  output[6] = size >= 256 ? 0 : size
  output[7] = size >= 256 ? 0 : size
  output[8] = 0
  output[9] = 0
  writeUint16(output, 10, 1)
  writeUint16(output, 12, 32)
  writeUint32(output, 14, pngBytes.length)
  writeUint32(output, 18, imageOffset)
  output.set(pngBytes, imageOffset)

  return output
}

function encodeJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value, undefined, 2))
}

export async function buildIconExportOutputs(state: IconEditorState): Promise<IconExportOutput[]> {
  if (!state.foregroundImage) {
    throw new Error('请选择前景图后再生成图标')
  }

  const faviconPngBytes = await canvasToPngBytes(renderIconCanvas(state, {
    kind: 'web',
    size: 256,
  }))
  const runtimeOutputs = await Promise.all(ICON_PNG_TARGETS.map(async target => ({
    bytes: await canvasToPngBytes(renderIconCanvas(state, {
      kind: target.kind,
      size: target.size,
    })),
    relativePath: RelPath.from(target.relativePath),
  })))
  const iconDataOutputs: IconExportOutput[] = [
    {
      bytes: encodeJsonBytes(createPersistedIconEditorState(state)),
      relativePath: GAME_ICON_DATA_STATE_RELATIVE_PATH,
    },
    {
      bytes: await canvasToPngBytes(renderIconSourceSnapshotCanvas(state.foregroundImage)),
      relativePath: GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH,
    },
  ]

  if (state.backgroundType === 'image' && state.backgroundImage) {
    iconDataOutputs.push({
      bytes: await canvasToPngBytes(renderIconSourceSnapshotCanvas(state.backgroundImage)),
      relativePath: GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH,
    })
  }

  return [
    {
      bytes: convertPngToIco(faviconPngBytes, 256),
      relativePath: RelPath.from('icons/favicon.ico'),
    },
    ...runtimeOutputs,
    ...iconDataOutputs,
  ]
}

export async function saveIconEditorOutputs(gamePath: AbsPath, outputs: IconExportOutput[]): Promise<void> {
  const parentPaths = new Set(outputs.map(output => AbsPath.join(gamePath, RelPath.parent(output.relativePath))))
  const relativePaths = new Set(outputs.map(output => output.relativePath))
  const shouldRemoveBackgroundSource = relativePaths.has(GAME_ICON_DATA_STATE_RELATIVE_PATH)
    && relativePaths.has(GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH)
    && !relativePaths.has(GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH)

  await Promise.all([...parentPaths].map(path => mkdir(path, { recursive: true })))
  await Promise.all(outputs.map(output =>
    writeFile(AbsPath.join(gamePath, output.relativePath), output.bytes),
  ))

  if (shouldRemoveBackgroundSource) {
    const backgroundSourcePath = AbsPath.join(gamePath, GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH)

    if (await exists(backgroundSourcePath)) {
      await fsCmds.deleteFile(backgroundSourcePath, true)
    }
  }
}
