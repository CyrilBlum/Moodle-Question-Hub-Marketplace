import DOMPurify from 'dompurify';

const CLIENT_SANITIZE_CONFIG = {
  USE_PROFILES: {
    html: true,
    mathMl: true,
    svg: true,
  },
  ADD_DATA_URI_TAGS: ['img'],
  ADD_TAGS: ['annotation', 'semantics', 'annotation-xml'],
  ADD_ATTR: [
    'target',
    'encoding',
    'display',
    'mathvariant',
    'mathsize',
    'mathcolor',
    'mathbackground',
    'columnalign',
    'rowalign',
    'linethickness',
    'accent',
    'accentunder',
    'fence',
    'separator',
    'stretchy',
    'symmetric',
    'largeop',
    'movablelimits',
    'dir',
    'aria-hidden',
    'aria-label',
    'role',
    'colspan',
    'rowspan',
    'border',
    'cellpadding',
    'cellspacing',
    'scope',
  ],
  FORBID_TAGS: [
    'script',
    'iframe',
    'frame',
    'object',
    'embed',
    'applet',
    'form',
    'input',
    'button',
    'select',
    'textarea',
    'base',
    'link',
    'meta',
    'style',
  ],
  FORBID_ATTR: [
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'onmouseout',
    'onmouseenter',
    'onmouseleave',
    'onfocus',
    'onblur',
    'onchange',
    'onsubmit',
    'onreset',
    'onkeydown',
    'onkeypress',
    'onkeyup',
    'ontoggle',
  ],
  ALLOW_DATA_ATTR: false,
  SANITIZE_DOM: true,
};

// Hook fuer sichere externe Links
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Bereinigt unvertrauenswuerdiges Frage- und Options-HTML vor dem Rendern im Browser.
 */
export function sanitizeQuestionHtml(dirtyHtml: string | null | undefined): string {
  if (!dirtyHtml || typeof dirtyHtml !== 'string') return '';
  return DOMPurify.sanitize(dirtyHtml, CLIENT_SANITIZE_CONFIG);
}
