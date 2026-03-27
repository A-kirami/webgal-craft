import type { ShortcutPlatform } from './types'

const BINDING_TOKEN_NORMALIZERS: Record<string, string> = {
  alt: 'Alt',
  cmd: 'Meta',
  command: 'Meta',
  control: 'Ctrl',
  ctrl: 'Ctrl',
  delete: 'Delete',
  del: 'Delete',
  down: 'ArrowDown',
  enter: 'Enter',
  esc: 'Escape',
  escape: 'Escape',
  left: 'ArrowLeft',
  meta: 'Meta',
  mod: 'Mod',
  option: 'Alt',
  return: 'Enter',
  right: 'ArrowRight',
  shift: 'Shift',
  space: 'Space',
  up: 'ArrowUp',
}

const EVENT_KEY_NORMALIZERS: Record<string, string> = {
  ' ': 'Space',
  'arrowdown': 'ArrowDown',
  'arrowleft': 'ArrowLeft',
  'arrowright': 'ArrowRight',
  'arrowup': 'ArrowUp',
  'control': 'Ctrl',
  'ctrl': 'Ctrl',
  'delete': 'Delete',
  'del': 'Delete',
  'enter': 'Enter',
  'esc': 'Escape',
  'escape': 'Escape',
  'spacebar': 'Space',
}

interface ShortcutModifierFlags {
  alt: boolean
  ctrl: boolean
  meta: boolean
  shift: boolean
}

function isMacPlatform(platform: ShortcutPlatform): boolean {
  return platform === 'mac'
}

function normalizeBindingToken(token: string, platform: ShortcutPlatform): string {
  const normalized = BINDING_TOKEN_NORMALIZERS[token.toLowerCase()] ?? token
  if (normalized === 'Mod') {
    return isMacPlatform(platform) ? 'Meta' : 'Ctrl'
  }

  if (/^f\d{1,2}$/i.test(normalized)) {
    return normalized.toUpperCase()
  }

  if (/^[a-z]$/i.test(normalized)) {
    return normalized.toUpperCase()
  }

  if (/^\d$/.test(normalized)) {
    return normalized
  }

  return normalized
}

function normalizeEventKey(key: string): string {
  if (!key) {
    return ''
  }

  const normalized = EVENT_KEY_NORMALIZERS[key.toLowerCase()] ?? key
  if (/^f\d{1,2}$/i.test(normalized)) {
    return normalized.toUpperCase()
  }

  if (/^[a-z]$/i.test(normalized)) {
    return normalized.toUpperCase()
  }

  if (/^\d$/.test(normalized)) {
    return normalized
  }

  return normalized
}

function buildShortcutKey(
  key: string,
  modifiers: ShortcutModifierFlags,
): string {
  if (!key || ['Alt', 'Ctrl', 'Meta', 'Shift'].includes(key)) {
    return ''
  }

  const parts: string[] = []

  if (modifiers.ctrl) {
    parts.push('Ctrl')
  }
  if (modifiers.meta) {
    parts.push('Meta')
  }
  if (modifiers.alt) {
    parts.push('Alt')
  }
  if (modifiers.shift) {
    parts.push('Shift')
  }

  parts.push(key)
  return parts.join('+')
}

export function normalizeShortcutBindingKey(
  key: string,
  platform: ShortcutPlatform,
): string {
  const tokens = key
    .split('+')
    .map(token => token.trim())
    .filter(Boolean)

  const modifiers: ShortcutModifierFlags = {
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
  }

  let resolvedKey = ''

  for (const token of tokens) {
    const normalizedToken = normalizeBindingToken(token, platform)

    switch (normalizedToken) {
      case 'Alt': {
        modifiers.alt = true
        break
      }
      case 'Ctrl': {
        modifiers.ctrl = true
        break
      }
      case 'Meta': {
        modifiers.meta = true
        break
      }
      case 'Shift': {
        modifiers.shift = true
        break
      }
      default: {
        if (resolvedKey) {
          return ''
        }

        resolvedKey = normalizedToken
      }
    }
  }

  return buildShortcutKey(resolvedKey, modifiers)
}

export function normalizeShortcutBindingKeys(
  keys: string | string[],
  platform: ShortcutPlatform,
): string[] {
  return (Array.isArray(keys) ? keys : [keys])
    .map(key => normalizeShortcutBindingKey(key, platform))
    .filter(Boolean)
}

export interface ShortcutKeyboardEventLike {
  altKey: boolean
  ctrlKey: boolean
  key: string
  metaKey: boolean
  shiftKey: boolean
}

export function normalizeShortcutEventKeys(
  event: ShortcutKeyboardEventLike,
): string {
  return buildShortcutKey(normalizeEventKey(event.key), {
    alt: event.altKey,
    ctrl: event.ctrlKey,
    meta: event.metaKey,
    shift: event.shiftKey,
  })
}
