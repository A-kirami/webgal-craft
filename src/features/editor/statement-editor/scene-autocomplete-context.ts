import type { InjectionKey, Ref } from 'vue'
import type { SceneAutocompleteOptions } from '~/features/editor/statement-editor/scene-autocomplete'

export const sceneAutocompleteOptionsKey: InjectionKey<Readonly<Ref<SceneAutocompleteOptions>>> =
  Symbol('scene-autocomplete-options')
