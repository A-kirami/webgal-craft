import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AUDIO_EXTENSIONS, BACKGROUND_EXTENSIONS, SERIES } from './common-params'
import { arg, content } from './schema'

import type { CommandEntry } from './schema'

export const galleryEntries: CommandEntry[] = [
  {
    type: commandType.unlockCg,
    label: t => t('edit.visualEditor.commands.unlockCg'),
    icon: 'i-lucide-image-plus',
    category: 'gallery',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'background', extensions: BACKGROUND_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.unlockCg') } }),
      arg({ key: 'name', label: t => t('edit.visualEditor.params.unlockDisplayName'), type: 'text' }),
      arg({ ...SERIES, visibleWhen: { key: 'name', notEmpty: true } }),
    ],
  },
  {
    type: commandType.unlockBgm,
    label: t => t('edit.visualEditor.commands.unlockBgm'),
    icon: 'i-lucide-music-2',
    category: 'gallery',
    fields: [
      content({ key: 'file', label: t => t('edit.visualEditor.params.fileName'), type: 'file', fileConfig: { assetType: 'bgm', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.unlockBgm') } }),
      arg({ key: 'name', label: t => t('edit.visualEditor.params.unlockDisplayName'), type: 'text' }),
      arg({ ...SERIES, visibleWhen: { key: 'name', notEmpty: true } }),
    ],
  },
]
