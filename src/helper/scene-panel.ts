export interface ScenePanelFolderItem {
  id: string
  isDir: boolean
  name: string
  path: string
}

export interface ScenePanelTreeNode {
  id: string
  name: string
  path: string
  children?: ScenePanelTreeNode[]
}

export async function loadScenePanelTreeNodes(
  path: string,
  getFolderContents: (path: string) => Promise<ScenePanelFolderItem[]>,
): Promise<ScenePanelTreeNode[]> {
  const contents = await getFolderContents(path)

  return await Promise.all(
    contents.map(async item => ({
      id: item.id,
      name: item.name,
      path: item.path,
      children: item.isDir
        ? await loadScenePanelTreeNodes(item.path, getFolderContents)
        : undefined,
    })),
  )
}

export function findScenePanelNodeByPath(
  nodes: readonly ScenePanelTreeNode[],
  targetPath: string,
): ScenePanelTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return node
    }

    if (node.children) {
      const found = findScenePanelNodeByPath(node.children, targetPath)
      if (found) {
        return found
      }
    }
  }
}

export async function resolveScenePanelTargetPath(
  rootPath: string | undefined,
  selectedItem: ScenePanelTreeNode | undefined,
  dirnameFn: (path: string) => Promise<string>,
): Promise<string | undefined> {
  if (rootPath === undefined || rootPath === '') {
    return
  }

  if (selectedItem) {
    return selectedItem.children
      ? selectedItem.path
      : await dirnameFn(selectedItem.path)
  }

  return rootPath
}
