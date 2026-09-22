// Image carousel of the detail view with an optional fullscreen lightbox (shared).
// Markup: #detail-carousel with #carousel-image, #carousel-dots, buttons with
// data-action="carouselPrev|carouselNext"; optionally #lightbox with its controls.

import { cssUrl } from './utils.js';
import { openImagePreview } from './media-preview.js';
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
  imageEl.setAttribute('role', 'button'); imageEl.tabIndex = 0; imageEl.setAttribute('aria-haspopup', 'dialog');
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
    if (imageEl) {
      imageEl.addEventListener('click', function() { openLightbox(currentIndex); });
      imageEl.addEventListener('keydown', function(e) { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); openLightbox(currentIndex); } });
    }
    initSwipe(document.getElementById('detail-carousel'), carouselNext, carouselPrev);
  }
}

// Fullscreen images share the document viewer shell.
function openLightbox(index) {
  openImagePreview(images, photoDetails, index, function(nextIndex) { currentIndex = nextIndex; updateCarouselImage(); });
}
