// prototype-backend — New map / New app modals
//
// Two tiny single-form modals, one per kind:
//   - kind: 'app' → Name + URL
//   - kind: 'map' → Name only
//
// Per product decision: minimal creation. Everything else (description,
// layers consumed, basemap, owner, thumbnail, tags) is edited later on
// the Maps & Apps detail page. Map creation does NOT launch a scene
// authoring UI.

import * as api from './api.js';
import { el, toast, openModal, closeModal } from './utils.js';

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function open({ kind = 'app', onCreated } = {}) {
  const isMap = kind === 'map';

  const nameInput = el('input', { type: 'text', required: true, placeholder: isMap ? 'Property Viewer 2026' : 'Field Inspection 2026' });
  const urlInput  = !isMap ? el('input', { type: 'url', required: true, placeholder: 'https://fieldapp.example.ch' }) : null;

  const submitErr = el('div', { class: 'pb-field-error', style: { display: 'none' } });
  const cancelBtn = el('button', { type: 'button', class: 'btn-secondary' }, 'Cancel');
  const submitBtn = el('button', { type: 'submit', class: 'btn-primary' }, isMap ? 'Create map' : 'Register app');

  cancelBtn.addEventListener('click', () => closeModal());

  const fields = [
    el('div', { class: 'pb-field' }, [
      el('label', {}, 'Name *'),
      nameInput
    ])
  ];
  if (!isMap) {
    fields.push(el('div', { class: 'pb-field' }, [
      el('label', {}, 'URL *'),
      urlInput,
      el('div', { class: 'pb-field-hint' }, 'Where the app is deployed.')
    ]));
  }
  fields.push(el('div', { class: 'pb-field-hint' },
    'More details (description, layers, ' +
    (isMap ? 'basemap, ' : 'thumbnail, ') +
    'owner) can be added later on the detail page.'
  ));
  fields.push(submitErr);

  const form = el('form', { class: 'pb-form', novalidate: true }, fields);

  // The submit button lives in the modal footer (outside the form), so the
  // native `type=submit` → form-submit association doesn't fire. Bridge it
  // with an explicit click handler that re-dispatches the submit event.
  submitBtn.addEventListener('click', (e) => {
    e.preventDefault();
    form.requestSubmit
      ? form.requestSubmit()
      : form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitErr.style.display = 'none';
    submitErr.textContent = '';

    const name = nameInput.value.trim();
    if (!name) {
      submitErr.textContent = 'Name is required.';
      submitErr.style.display = '';
      nameInput.focus();
      return;
    }
    if (!isMap && !urlInput.value.trim()) {
      submitErr.textContent = 'URL is required.';
      submitErr.style.display = '';
      urlInput.focus();
      return;
    }

    const slug = slugify(name);
    if (!slug) {
      submitErr.textContent = 'Name must contain letters or numbers.';
      submitErr.style.display = '';
      nameInput.focus();
      return;
    }

    submitBtn.disabled = true;
    try {
      const payload = {
        slug,
        name,
        kind,
        tags: [kind]
      };
      if (!isMap) payload.url = urlInput.value.trim();
      const created = await api.createProduct(payload);
      closeModal();
      toast(`${isMap ? 'Map' : 'App'} "${name}" created`, 'success');
      if (typeof onCreated === 'function') onCreated(created);
    } catch (err) {
      submitErr.textContent = err?.message || 'Failed to create.';
      submitErr.style.display = '';
      submitBtn.disabled = false;
    }
  });

  openModal(el('div', { class: 'pb-modal-content' }, [
    el('div', { class: 'pb-modal-header' }, isMap ? 'New map' : 'Register app'),
    el('div', { class: 'pb-modal-body' }, [form]),
    el('div', { class: 'pb-modal-footer' }, [cancelBtn, submitBtn])
  ]));
}
