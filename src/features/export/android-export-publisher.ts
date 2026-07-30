import { safeInvoke } from '~/utils/invoke'

export interface PublishedAndroidExport {
  kind: 'published'
  contentUri: string
  displayPath: string
}

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
    return safeInvoke<PublishedAndroidExport>('android_export_publish', input)
  },
  openPublished(contentUri) {
    return safeInvoke<void>('android_export_open', { contentUri })
  },
  sharePublished(contentUri) {
    return safeInvoke<void>('android_export_share', { contentUri })
  },
}
