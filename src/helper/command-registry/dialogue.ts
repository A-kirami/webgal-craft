import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { AUDIO_EXTENSIONS, VOLUME } from './common-params'

export const dialogueEntries: CommandEntry[] = [
  {
    type: commandType.say,
    label: t => t('edit.visualEditor.commands.say'),
    icon: 'i-lucide-message-circle',
    category: 'dialogue',
    fields: [
      commandRaw({ key: 'speaker', label: t => t('edit.visualEditor.params.speaker'), inlineLayout: 'standalone' }),
      content({
        key: 'text',
        label: t => t('edit.visualEditor.params.dialogue'),
        type: 'text',
        variant: { inline: 'textarea-auto', panel: 'textarea-fixed' },
        inlineLayout: 'standalone',
      }),
      arg({
        key: 'fontSize',
        label: t => t('edit.visualEditor.params.fontSize'),
        type: 'choice',
        defaultValue: 'default',
        options: [
          { label: t => t('edit.visualEditor.options.default'), value: 'default' },
          { label: t => t('edit.visualEditor.options.small'), value: 'small' },
          { label: t => t('edit.visualEditor.options.medium'), value: 'medium' },
          { label: t => t('edit.visualEditor.options.large'), value: 'large' },
        ],
      }),
      arg({ key: 'vocal', label: t => t('edit.visualEditor.params.vocal'), type: 'file', fileConfig: { assetType: 'vocal', extensions: AUDIO_EXTENSIONS, title: t => t('edit.visualEditor.filePicker.vocal') } }),
      arg({ ...VOLUME, visibleWhen: { key: 'vocal', notEmpty: true } }),
      arg({
        key: 'figurePosition',
        label: t => t('edit.visualEditor.params.associatedFigure'),
        type: 'choice',
        mode: 'flag',
        options: [
          { label: t => t('edit.visualEditor.options.unspecified'), value: UNSPECIFIED },
          { label: t => t('edit.visualEditor.options.figureLeft'), value: 'left' },
          { label: t => t('edit.visualEditor.options.figureCenter'), value: 'center' },
          { label: t => t('edit.visualEditor.options.figureRight'), value: 'right' },
          { label: t => t('edit.visualEditor.options.useFigureId'), value: 'id' },
        ],
      }),
      arg({ key: 'figureId', label: t => t('edit.visualEditor.params.associatedFigureId'), type: 'text', visibleWhen: { key: 'figurePosition', value: 'id' } }),
      arg({ key: 'concat', label: t => t('edit.visualEditor.params.concat'), type: 'switch', defaultValue: false }),
      arg({ key: 'notend', label: t => t('edit.visualEditor.params.notend'), type: 'switch', defaultValue: false }),
    ],
  },
  {
    type: commandType.comment,
    label: t => t('edit.visualEditor.commands.comment'),
    icon: 'i-lucide-hash',
    category: 'comment',
    fields: [content({ key: 'text', label: t => t('edit.visualEditor.params.commentContent'), type: 'text' })],
  },
]
