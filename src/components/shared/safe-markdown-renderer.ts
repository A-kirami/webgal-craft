import purifier from 'dompurify'
import MarkdownIt from 'markdown-it'

import type Token from 'markdown-it/lib/token.mjs'

const safeUrlProtocols = new Set(['http:', 'https:'])
const taskListMarkerPattern = /^\[([ xX])\]\s+/

const markdown = new MarkdownIt({
  html: true,
  linkify: false,
})

const linkOpenRule = 'link_open'
const linkCloseRule = 'link_close'
const taskCheckboxRule = 'task_checkbox'

interface MarkdownRenderEnv {
  linkSafetyStack: boolean[]
}

function getRenderEnv(env: unknown): MarkdownRenderEnv {
  const renderEnv = env as Partial<MarkdownRenderEnv>
  renderEnv.linkSafetyStack ??= []
  return renderEnv as MarkdownRenderEnv
}

function findParentListItem(
  tokens: Token[],
  inlineTokenIndex: number,
  inlineTokenLevel: number,
): Token | undefined {
  for (let index = inlineTokenIndex - 1; index >= 0; index--) {
    const token = tokens[index]
    if (token.type === 'list_item_open' && token.level < inlineTokenLevel) {
      return token
    }
  }
}

export function isSafeWebUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false
  }

  try {
    const url = new URL(value)
    return safeUrlProtocols.has(url.protocol)
  } catch {
    return false
  }
}

markdown.renderer.rules[linkOpenRule] = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const href = token.attrGet('href')
  const safe = isSafeWebUrl(href)
  getRenderEnv(env).linkSafetyStack.push(safe)
  if (!safe) {
    return ''
  }

  token.attrSet('rel', 'noreferrer noopener')
  return self.renderToken(tokens, index, options)
}

markdown.renderer.rules[linkCloseRule] = (tokens, index, options, env, self) => {
  if (!getRenderEnv(env).linkSafetyStack.pop()) {
    return ''
  }

  return self.renderToken(tokens, index, options)
}

markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index]
  const href = token.attrGet('src')
  const label = self.renderInlineAsText(token.children ?? [], options, env) || href
  if (!isSafeWebUrl(href)) {
    return markdown.utils.escapeHtml(label ?? '')
  }

  return `<a href="${markdown.utils.escapeHtml(href)}" rel="noreferrer noopener">${markdown.utils.escapeHtml(label ?? href)}</a>`
}

markdown.renderer.rules[taskCheckboxRule] = (tokens, index, options, _env, self) => {
  return self.renderToken(tokens, index, options)
}

markdown.core.ruler.after('inline', 'task_list', (state) => {
  for (const [index, token] of state.tokens.entries()) {
    const children = token.children
    if (token.type !== 'inline' || !children || children.length === 0) {
      continue
    }

    const firstChild = children[0]
    const marker = firstChild.content.match(taskListMarkerPattern)
    const hasParentListItem = Boolean(findParentListItem(state.tokens, index, token.level))

    if (firstChild.type !== 'text' || !marker || !hasParentListItem) {
      continue
    }

    const checkbox = new state.Token(taskCheckboxRule, 'input', 0)
    checkbox.attrSet('type', 'checkbox')
    checkbox.attrSet('disabled', '')
    checkbox.attrSet('aria-hidden', 'true')

    if (marker[1].toLowerCase() === 'x') {
      checkbox.attrSet('checked', '')
    }

    firstChild.content = firstChild.content.slice(marker[0].length)
    token.content = token.content.slice(marker[0].length)
    children.unshift(checkbox)
  }
})

function normalizeRenderedHtml(html: string): string {
  const template = document.createElement('template')
  template.innerHTML = html

  for (const anchor of template.content.querySelectorAll('a')) {
    const href = anchor.getAttribute('href')
    if (!isSafeWebUrl(href)) {
      anchor.replaceWith(...anchor.childNodes)
      continue
    }

    anchor.setAttribute('rel', 'noreferrer noopener')
  }

  for (const image of template.content.querySelectorAll('img')) {
    if (!isSafeWebUrl(image.getAttribute('src'))) {
      image.remove()
    }
  }

  for (const input of template.content.querySelectorAll('input')) {
    if (input.getAttribute('type') !== 'checkbox') {
      input.remove()
      continue
    }

    input.setAttribute('disabled', '')
    input.setAttribute('aria-hidden', 'true')
  }

  return template.innerHTML
}

export function renderSafeMarkdown(source?: string): string {
  const html = markdown.render(source ?? '', { linkSafetyStack: [] } satisfies MarkdownRenderEnv)
  const sanitizedHtml = purifier.sanitize(html, {
    ALLOWED_ATTR: [
      'align',
      'alt',
      'aria-hidden',
      'checked',
      'disabled',
      'height',
      'href',
      'rel',
      'src',
      'title',
      'type',
      'width',
    ],
    ALLOWED_TAGS: [
      'a',
      'blockquote',
      'br',
      'code',
      'del',
      'div',
      'em',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'hr',
      'img',
      'input',
      'kbd',
      'li',
      'ol',
      'p',
      'pre',
      's',
      'strong',
      'table',
      'tbody',
      'td',
      'th',
      'thead',
      'tr',
      'u',
      'ul',
    ],
  })

  return normalizeRenderedHtml(sanitizedHtml)
}
