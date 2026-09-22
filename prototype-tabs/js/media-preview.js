// Adapted from service-portal/js/ui/doc-viewer.js (MIT; see vendor/service-portal/LICENSE).
// Shared image/document shell: controls, modal lifecycle, metadata, zoom and navigation.
import { escapeHtml, formatDate } from './utils.js';
import { documentPages } from './document-pages.js';
import { initSwipe } from './gestures.js';

let activeClose = null;
export function closeMediaPreview(restoreFocus = true) {
  if (activeClose) activeClose(restoreFocus);
}

function icon(name) { return '<span class="material-symbols-outlined" aria-hidden="true">' + name + '</span>'; }
function button(action, label, symbol) {
  return '<button type="button" class="icon-btn icon-btn--md icon-btn--on-dark media-preview-button" data-doc-action="' + action + '" title="' + label + '" aria-label="' + label + '">' + icon(symbol) + '</button>';
}
export function documentSourceUrl(doc) {
  try { const url = new URL(doc.url); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function documentTitleLink(doc) {
  const source = documentSourceUrl(doc);
  const attrs = ' class="media-preview-link" data-preview-document="' + escapeHtml(doc.documentId) + '"';
  return source ? '<a' + attrs + ' href="' + escapeHtml(source) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(doc.name) + '</a>' :
    '<button type="button"' + attrs + '>' + escapeHtml(doc.name) + '</button>';
}

export function openDocumentPreview(doc, siblings = [], context = {}) {
  return openMediaPreview(doc, siblings, context, false);
}
export function openImagePreview(urls, details, index, onChange) {
  const items = urls.map((url, i) => ({ documentId: url, url, photo: details[i] || {},
    name: details[i]?.alt || url.split('/').pop() }));
  return openMediaPreview(items[index], items, { onChange }, true);
}
function openMediaPreview(doc, siblings, context, isImage) {
  if (!doc) return;
  closeMediaPreview(false);
  const opener = document.activeElement;
  const list = siblings.some(d => d.documentId === doc.documentId) ? siblings.slice() : [doc];
  let index = Math.max(0, list.findIndex(d => d.documentId === doc.documentId));
  let zoom = 1;
  let metadataOpen = false;
  let closed = false;
  let resizeFrame;
  let baseWidth = 794, baseHeight = 1123;
  const minimumZoom = isImage ? 0.05 : 0.25;
  const overflow = document.body.style.overflow;
  const background = Array.from(document.body.children).filter(el => !['SCRIPT', 'STYLE'].includes(el.tagName)).map(el => [el, el.hasAttribute('inert')]);
  background.forEach(([el]) => el.setAttribute('inert', ''));
  document.body.style.overflow = 'hidden';
  const root = document.createElement('div');
  root.id = isImage ? 'lightbox' : 'document-preview';
  root.className = 'media-preview' + (isImage ? ' image-preview active' : ' document-preview');
  root.dataset.kind = isImage ? 'image' : 'document';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'media-preview-title');
  root.innerHTML = '<header class="media-preview-bar"><div class="media-preview-heading"><h2 id="media-preview-title"></h2>' +
    '<p><span id="media-preview-caption"></span><span id="media-preview-counter" aria-live="polite"></span></p></div><div class="media-preview-actions">' +
    '<a class="icon-btn icon-btn--md icon-btn--on-dark media-preview-button" data-doc-source target="_blank" rel="noopener noreferrer" title="Original öffnen / herunterladen" aria-label="Original öffnen / herunterladen">' + icon('download') + '</a>' +
    button('download-unavailable', 'Keine Originaldatei verfügbar', 'download') + button('upload', 'Hochladen – im Demo deaktiviert', 'upload') +
    button('metadata', 'Informationen anzeigen', 'info') + button('close', 'Vorschau schliessen', 'close') + '</div></header>' +
    '<div class="media-preview-body"><div class="media-preview-canvas"><div class="media-preview-stage" tabindex="0" aria-label="Vorschau"><div class="media-preview-pages"></div></div>' +
    '<nav class="media-preview-navigation" aria-label="Vorschau wechseln">' + button('previous', 'Vorheriges Dokument', 'chevron_left') +
    button('next', 'Nächstes Dokument', 'chevron_right') + '</nav></div>' +
    '<aside class="media-preview-meta" id="media-preview-meta" hidden><h3>Metadaten</h3><dl></dl></aside></div>' +
    '<footer class="media-preview-controls"><div class="media-preview-zoom" role="group" aria-label="Zoom">' +
    button('zoom-out', 'Verkleinern', 'remove') + '<button type="button" class="icon-btn icon-btn--on-dark media-preview-button media-preview-readout" data-doc-action="fit" title="Einpassen" aria-label="Einpassen"></button>' +
    button('zoom-in', 'Vergrössern', 'add') + '</div><span id="media-preview-page" aria-live="polite"></span></footer>';
  document.body.appendChild(root);
  const stage = root.querySelector('.media-preview-stage');
  const pages = root.querySelector('.media-preview-pages');
  const meta = root.querySelector('.media-preview-meta');
  const metaButton = root.querySelector('[data-doc-action="metadata"]');
  root.querySelector('[data-doc-action="upload"]').disabled = true;
  root.querySelector('[data-doc-action="download-unavailable"]').disabled = true;
  if (isImage) {
    for (const [action, text] of [['previous', 'Vorheriges Bild'], ['next', 'Nächstes Bild']]) {
      const control = root.querySelector('[data-doc-action="' + action + '"]');
      control.title = text; control.setAttribute('aria-label', text);
    }
  }
  metaButton.setAttribute('aria-controls', meta.id);
  metaButton.setAttribute('aria-expanded', 'false');

  function updatePage() {
    if (isImage) { root.querySelector('#media-preview-page').textContent = 'Bild ' + (index + 1) + ' / ' + list.length; return; }
    const position = stage.getBoundingClientRect().top + stage.clientHeight / 2;
    let page = 1;
    const sheets = Array.from(pages.children);
    sheets.forEach((sheet, i) => { if (sheet.getBoundingClientRect().top < position) page = i + 1; });
    root.querySelector('#media-preview-page').textContent = 'Seite ' + page + ' / ' + sheets.length;
  }
  function applyZoom(value) {
    zoom = Math.max(minimumZoom, Math.min(3, value));
    pages.style.setProperty('--document-scale', zoom);
    root.querySelector('[data-doc-action="fit"]').textContent = Math.round(zoom * 100) + '%';
    root.querySelector('[data-doc-action="zoom-out"]').disabled = zoom <= minimumZoom;
    root.querySelector('[data-doc-action="zoom-in"]').disabled = zoom >= 3;
    updatePage();
    if (isImage) {
      const frame = pages.querySelector('.media-image-frame');
      if (frame) { frame.style.width = baseWidth * zoom + 'px'; frame.style.height = baseHeight * zoom + 'px'; }
    }
  }
  function fit() { applyZoom(Math.min(1, ((stage.clientWidth || window.innerWidth) - 48) / baseWidth,
    isImage ? ((stage.clientHeight || window.innerHeight) - 48) / baseHeight : 1)); }
  function mount() {
    const current = list[index];
    const title = root.querySelector('#media-preview-title');
    title.textContent = current.name;
    title.title = current.name;
    const caption = root.querySelector('#media-preview-caption');
    caption.textContent = isImage ? current.photo.credit || 'Gebäudebild' : 'Demovorschau';
    caption.title = caption.textContent;
    root.querySelector('#media-preview-counter').textContent = ' · ' + (isImage ? 'Bild ' : 'Dokument ') + (index + 1) + ' / ' + list.length;
    const source = root.querySelector('[data-doc-source]');
    const url = isImage ? current.url : documentSourceUrl(current);
    source.hidden = !url;
    root.querySelector('[data-doc-action="download-unavailable"]').hidden = !!url;
    if (url) source.href = url; else source.removeAttribute('href');
    if (isImage) { source.download = current.url.split('/').pop(); source.title = 'Bild herunterladen'; source.setAttribute('aria-label', source.title); }
    const facts = isImage ? [['Beschreibung', current.name], ['Copyright', current.photo.credit], ['Ansicht', current.photo.scene === 'interior' ? 'Innenaufnahme' : 'Aussenaufnahme']] :
      [['Titel', current.name], ['KBOB-Typ', [current.documentTypeCode, current.type].filter(Boolean).join(' · ')],
      ['Objekt', context.buildingName], ['Format', current.fileFormat], ['Stand', formatDate(current.validFrom)],
      ['Version', current.version], ['Dateigrösse', current.fileSize], ['Inhalt der Vorschau', 'Generierter Beispielinhalt, keine Originaldatei']];
    meta.querySelector('dl').innerHTML = facts.map(([label, value]) => '<dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value || '—') + '</dd>').join('');
    const original = documentSourceUrl({ url: isImage ? current.photo.originalUrl : current.url });
    if (original) meta.querySelector('dl').insertAdjacentHTML('beforeend', '<dt>Quelle</dt><dd><a href="' + escapeHtml(original) + '" target="_blank" rel="noopener noreferrer">Original öffnen</a></dd>');
    if (isImage) {
      pages.innerHTML = '<div class="media-image-frame"><img id="lightbox-image" class="media-preview-image" alt="' + escapeHtml(current.name) + '" draggable="false"></div>';
      const img = pages.querySelector('img');
      img.onload = () => { if (closed || !root.contains(img)) return; baseWidth = img.naturalWidth; baseHeight = img.naturalHeight; fit(); };
      img.src = current.url;
      if (img.complete && img.naturalWidth) { baseWidth = img.naturalWidth; baseHeight = img.naturalHeight; }
      context.onChange?.(index);
    } else pages.innerHTML = documentPages(current, context);
    stage.scrollTop = 0; stage.scrollLeft = 0;
    root.querySelectorAll('.media-preview-navigation button').forEach(el => { el.disabled = list.length < 2; });
    fit();
    if (!isImage) root.querySelector('#media-preview-page').textContent = 'Seite 1 / ' + pages.children.length;
  }
  function go(delta) {
    if (list.length < 2) return;
    const focused = document.activeElement;
    index = (index + delta + list.length) % list.length;
    mount();
    if (focused?.closest('[hidden]')) stage.focus();
  }
  function onResize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (!closed) fit(); });
  }
  function close(restoreFocus = true) {
    if (closed) return;
    closed = true;
    cancelAnimationFrame(resizeFrame);
    document.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('popstate', onNavigate);
    root.remove();
    background.forEach(([el, wasInert]) => { if (!wasInert) el.removeAttribute('inert'); });
    document.body.style.overflow = overflow;
    activeClose = null;
    if (restoreFocus && opener?.isConnected) opener.focus();
  }
  function onNavigate() { close(false); }
  function onKeydown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') {
      const controls = Array.from(root.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')).filter(el => !el.closest('[hidden]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest?.('input, textarea, select')) return;
    const action = { ArrowLeft: () => go(-1), ArrowRight: () => go(1), '+': () => applyZoom(zoom + .25), '=': () => applyZoom(zoom + .25), '-': () => applyZoom(zoom - .25), '0': fit }[event.key];
    if (action) { event.preventDefault(); event.stopPropagation(); action(); }
  }
  root.addEventListener('click', event => {
    const action = event.target.closest('[data-doc-action]')?.dataset.docAction;
    if (action === 'close') close();
    else if (action === 'previous') go(-1);
    else if (action === 'next') go(1);
    else if (action === 'zoom-in') applyZoom(zoom + .25);
    else if (action === 'zoom-out') applyZoom(zoom - .25);
    else if (action === 'fit') fit();
    else if (action === 'metadata') {
      metadataOpen = !metadataOpen;
      meta.hidden = !metadataOpen;
      metaButton.setAttribute('aria-expanded', String(metadataOpen));
      metaButton.setAttribute('aria-label', metadataOpen ? 'Informationen ausblenden' : 'Informationen anzeigen');
      metaButton.title = metaButton.getAttribute('aria-label');
      onResize();
    }
  });
  stage.addEventListener('scroll', updatePage, { passive: true });
  if (isImage) initSwipe(stage,
    () => { if (stage.scrollWidth <= stage.clientWidth + 1) go(1); },
    () => { if (stage.scrollWidth <= stage.clientWidth + 1) go(-1); });
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('popstate', onNavigate);
  activeClose = close;
  mount();
  root.querySelector('[data-doc-action="close"]').focus();
  return close;
}
