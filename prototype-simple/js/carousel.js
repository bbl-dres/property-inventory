// Image carousel of the detail view with an optional fullscreen lightbox (shared).
// Markup: #detail-carousel with #carousel-image, #carousel-dots, buttons with
// data-action="carouselPrev|carouselNext"; optionally #lightbox with its controls.

import { cssUrl } from './utils.js';
import { onEscape } from './keys.js';
import { initSwipe } from './gestures.js';

let images = [];
let photoDetails = [];
let currentIndex = 0;
let carouselInitialized = false;

function updateCarouselImage() {
  const imageEl = document.getElementById('carousel-image');
  if (!imageEl) return;
  if (images.length === 0) { imageEl.style.backgroundImage = ''; return; }
  imageEl.style.backgroundImage = cssUrl(images[currentIndex]);
  const photo = photoDetails[currentIndex] || {};
  imageEl.setAttribute('role', 'img');
  imageEl.setAttribute('aria-label', photo.alt || 'Gebäudebild');
  document.querySelectorAll('.carousel-dot').forEach(function(dot, index) {
    dot.classList.toggle('active', index === currentIndex);
  });
}

export function carouselPrev() {
  if (images.length === 0) return;
  currentIndex = (currentIndex - 1 + images.length) % images.length;
  updateCarouselImage();
}

export function carouselNext() {
  if (images.length === 0) return;
  currentIndex = (currentIndex + 1) % images.length;
  updateCarouselImage();
}

export const carouselActions = {
  carouselPrev: function() { carouselPrev(); },
  carouselNext: function() { carouselNext(); }
};

// Show a list of image URLs (the first one active) and (once) bind the controls
export function showCarousel(imageUrls, details) {
  images = (imageUrls && imageUrls.length > 0) ? imageUrls.slice() : [];
  photoDetails = details || [];
  currentIndex = 0;

  const dotsContainer = document.getElementById('carousel-dots');
  if (dotsContainer) {
    dotsContainer.innerHTML = '';
    images.forEach(function(_, index) {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'carousel-dot' + (index === 0 ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', String(index + 1));
      dot.addEventListener('click', function() {
        currentIndex = index;
        updateCarouselImage();
      });
      dotsContainer.appendChild(dot);
    });
  }

  updateCarouselImage();

  if (!carouselInitialized) {
    carouselInitialized = true;
    const imageEl = document.getElementById('carousel-image');
    if (imageEl && document.getElementById('lightbox')) {
      imageEl.addEventListener('click', function() { openLightbox(currentIndex); });
    }
    initSwipe(document.getElementById('detail-carousel'), carouselNext, carouselPrev);
    initLightbox();
  }
}

// ===== FULLSCREEN LIGHTBOX =====

let lightboxIndex = 0;

function getFilenameFromUrl(url) {
  try {
    const parts = String(url).split('/');
    const last = parts[parts.length - 1].split('?')[0];
    return last || 'image';
  } catch (e) {
    return 'image';
  }
}

function updateLightbox() {
  const url = images[lightboxIndex];
  const img = document.getElementById('lightbox-image');
  const counter = document.getElementById('lightbox-counter');
  const filename = document.getElementById('lightbox-filename');
  const photo = photoDetails[lightboxIndex] || {};
  if (img) { img.src = url; img.alt = photo.alt || 'Gebäudebild'; }
  if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + images.length;
  if (filename) filename.textContent = photo.credit ? photo.credit + ' · ' + photo.alt : getFilenameFromUrl(url);
  // Keep the carousel in sync
  currentIndex = lightboxIndex;
  updateCarouselImage();
}

function openLightbox(index) {
  if (images.length === 0) return;
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;
  lightboxIndex = index;
  lightbox.classList.add('active');
  updateLightbox();
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) lightbox.classList.remove('active');
  document.body.style.overflow = '';
}

function isLightboxOpen() {
  const lightbox = document.getElementById('lightbox');
  return !!lightbox && lightbox.classList.contains('active');
}

function lightboxPrev() {
  lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
  updateLightbox();
}

function lightboxNext() {
  lightboxIndex = (lightboxIndex + 1) % images.length;
  updateLightbox();
}

function initLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (!lightbox) return;

  const closeBtn = document.getElementById('lightbox-close');
  const backdrop = lightbox.querySelector('.lightbox-backdrop');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  const downloadBtn = document.getElementById('lightbox-download');

  if (closeBtn) closeBtn.addEventListener('click', closeLightbox);
  if (backdrop) backdrop.addEventListener('click', closeLightbox);
  if (prevBtn) prevBtn.addEventListener('click', function(e) { e.stopPropagation(); lightboxPrev(); });
  if (nextBtn) nextBtn.addEventListener('click', function(e) { e.stopPropagation(); lightboxNext(); });
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      const url = images[lightboxIndex];
      const a = document.createElement('a');
      a.href = url;
      a.download = getFilenameFromUrl(url);
      a.target = '_blank';
      a.rel = 'noopener';
      a.click();
    });
  }

  onEscape(function() {
    if (!isLightboxOpen()) return false;
    closeLightbox();
    return true;
  }, 100);

  document.addEventListener('keydown', function(e) {
    if (!isLightboxOpen()) return;
    if (e.key === 'ArrowLeft') lightboxPrev();
    else if (e.key === 'ArrowRight') lightboxNext();
  });

  initSwipe(lightbox, lightboxNext, lightboxPrev);
}
