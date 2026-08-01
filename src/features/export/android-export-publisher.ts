import { exportCmds } from '~/commands/export'

import type { PublishedAndroidExport } from '~/commands/export'

export type { PublishedAndroidExport } from '~/commands/export'

export interface AndroidExportPublisher {
  publishZipToDownloads: (input: {
    exportSessionId: string
    suggestedFileName: string
  }) => Promise<PublishedAndroidExport>
  openPublished: (contentUri: string) => Promise<void>
  sharePublished: (contentUri: string) => Promise<void>
}

export const androidExportPublisher: AndroidExportPublisher = {
  publishZipToDownloads(input) {
    return exportCmds.publishAndroidWebExport(input.exportSessionId, input.suggestedFileName)
  },
  openPublished(contentUri) {
    return exportCmds.openPublishedAndroidWebExport(contentUri)
  },
  sharePublished(contentUri) {
    return exportCmds.sharePublishedAndroidWebExport(contentUri)
  },
}
