// Compact document entry point for the flat GIS prototype.
import { escapeHtml } from './utils.js';
import { documentTitleLink, openDocumentPreview } from './document-preview.js';

export function showDocumentList(documents = [], context = {}) {
  const host = document.getElementById('detail-documents');
  if (!host) return;
  const records = documents.slice().sort((a, b) => a.name.localeCompare(b.name, 'de'));
  host.innerHTML = records.length ? records.map(doc => '<div class="document-list-item" role="listitem" tabindex="0">' +
    '<span class="material-symbols-outlined" aria-hidden="true">description</span><div>' + documentTitleLink(doc) +
    '<small>' + escapeHtml([doc.documentTypeCode, doc.type, doc.fileFormat].filter(Boolean).join(' · ')) + '</small></div></div>').join('') :
    '<div class="document-list-empty">Keine Dokumente vorhanden</div>';
  host.querySelectorAll('[data-preview-document]').forEach(el => { el.title = el.textContent; });
  host.onclick = function(event) {
    const row = event.target.closest('.document-list-item');
    const trigger = row?.querySelector('[data-preview-document]');
    if (!trigger || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const doc = records.find(record => record.documentId === trigger.dataset.previewDocument);
    if (!doc) return;
    event.preventDefault();
    if (!event.target.closest('a, button')) row.focus();
    openDocumentPreview(doc, records, context);
  };
  host.onkeydown = function(event) {
    if (event.target.classList.contains('document-list-item') && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); event.target.click();
    }
  };
}
