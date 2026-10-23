import { decodeTextFile } from '~/domain/document/file-codec'
import { FLOWCHART_FILE_REL_PATH } from '~/domain/flowchart/codec'
import { AbsPath } from '~/domain/path'
import { gameFs } from '~/services/game-fs'
import { useFileStore } from '~/stores/file'
import { AppError } from '~/types/errors'

/** 流程图文件路径：{gamePath}/game/flowchart.json */
export function flowchartFilePath(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, FLOWCHART_FILE_REL_PATH)
}

/**
 * 读取流程图文件。
 *
 * 文件缺失返回 undefined，由调用方创建默认结构；编码或读取失败照常抛出，
 * 避免把"读不出来"当成"没有内容"从而覆盖用户文件。
 */
export async function readFlowchartFile(gamePath: AbsPath): Promise<string | undefined> {
  await useFileStore().initialized

  try {
    const bytes = await gameFs.readDocumentFile(flowchartFilePath(gamePath))
    const decoded = decodeTextFile(bytes)
    if (!decoded.ok) {
      throw new AppError('INVALID_CONFIG', '流程图文件编码不受支持')
    }
    return decoded.content
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_FOUND') {
      return undefined
    }
    throw error
  }
}

export async function writeFlowchartFile(gamePath: AbsPath, content: string): Promise<void> {
  await gameFs.writeFile(flowchartFilePath(gamePath), content)
}
