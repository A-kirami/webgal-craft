export interface QueuedAssetViewLoad {
  directoryPath: string
  isSilent: boolean
}

export function mergeQueuedAssetViewLoad(
  current: QueuedAssetViewLoad | undefined,
  next: QueuedAssetViewLoad,
): QueuedAssetViewLoad {
  if (!current) {
    return next
  }

  return {
    directoryPath: next.directoryPath,
    // 同一批次内只要出现显式导航，就必须保留 loading。
    isSilent: current.isSilent && next.isSilent,
  }
}
