import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'
import { resolveExternalFileDropTargetDirectory } from '~/features/editor/external-file-import/external-file-import'

function createDropTarget(dataset: Record<string, string>): HTMLElement {
  const target = document.createElement('button')
  Object.assign(target.dataset, dataset)
  const child = document.createElement('span')
  target.append(child)
  document.body.append(target)
  return child
}

describe('resolveExternalFileDropTargetDirectory', () => {
  it('会解析场景树和资源浏览器中的目录节点', () => {
    const root = AbsPath.from('/project/game/scene')
    const sceneTarget = createDropTarget({
      fileTreeDropTargetPath: '/project/game/scene/chapter',
      fileTreeIsDir: 'true',
      fileTreePath: '/project/game/scene/chapter',
    })

    expect(resolveExternalFileDropTargetDirectory(sceneTarget, root))
      .toBe('/project/game/scene/chapter')

    const assetTarget = createDropTarget({
      fileViewerIsDir: 'true',
      fileViewerPath: '/project/game/scene/shared',
    })

    expect(resolveExternalFileDropTargetDirectory(assetTarget, root))
      .toBe('/project/game/scene/shared')
  })

  it('场景树文件节点会解析到树模型提供的父目录目标', () => {
    const root = AbsPath.from('/project/game/scene')
    const fileTarget = createDropTarget({
      fileTreeDropTargetPath: '/project/game/scene/chapter',
      fileTreeIsDir: 'false',
      fileTreePath: '/project/game/scene/chapter/opening.txt',
    })

    expect(resolveExternalFileDropTargetDirectory(fileTarget, root))
      .toBe('/project/game/scene/chapter')
  })

  it('文件节点或根目录外伪造路径会回退到当前浏览目录', () => {
    const root = AbsPath.from('/project/game/background')
    const fileTarget = createDropTarget({
      fileViewerIsDir: 'false',
      fileViewerPath: '/project/game/background/hero.png',
    })
    const outsideTarget = createDropTarget({
      fileViewerIsDir: 'true',
      fileViewerPath: '/outside',
    })
    const rootSurface = document.createElement('div')
    rootSurface.dataset.fileViewerRootSurface = 'true'
    const blankTarget = document.createElement('span')
    rootSurface.append(blankTarget)
    document.body.append(rootSurface)

    expect(resolveExternalFileDropTargetDirectory(fileTarget, root)).toBe(root)
    expect(resolveExternalFileDropTargetDirectory(outsideTarget, root)).toBe(root)
    expect(resolveExternalFileDropTargetDirectory(blankTarget, root)).toBe(root)
  })

  it('面板标题等非内容区域不会被识别为根目录目标', () => {
    const root = AbsPath.from('/project/game/background')
    const header = document.createElement('button')
    document.body.append(header)

    expect(resolveExternalFileDropTargetDirectory(header, root)).toBeUndefined()
  })
})
