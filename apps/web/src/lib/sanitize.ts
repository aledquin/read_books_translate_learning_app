import DOMPurify from 'dompurify'

const CONFIG = {
  USE_PROFILES: { html: true },
  ALLOWED_TAGS: [
    'p', 'div', 'span', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'ul', 'ol', 'li', 'a', 'img', 'hr', 'small',
  ],
  ALLOWED_ATTR: [
    'href',
    'src',
    'alt',
    'title',
    'class',
    'id',
    'lang',
    'data-pr-gloss-en',
    'data-pr-role',
  ],
  ALLOW_DATA_ATTR: false,
}

export function sanitizeChapterHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG)
}
