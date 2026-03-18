// Share link and social sharing functions

import { state } from './state.js';

export function getShareUrl() {
  var baseUrl = window.location.origin + window.location.pathname;
  var params = new URLSearchParams(window.location.search);

  // Add current map position if map exists
  if (state.map) {
    var center = state.map.getCenter();
    var zoom = state.map.getZoom();
    params.set('lng', center.lng.toFixed(5));
    params.set('lat', center.lat.toFixed(5));
    params.set('zoom', zoom.toFixed(2));
  }

  // Add selected building or parcel if one is selected
  if (state.selectedBuildingId) {
    params.set('id', state.selectedBuildingId);
    params.delete('parcelId');
  } else if (state.selectedParcelId) {
    params.set('parcelId', state.selectedParcelId);
    params.delete('id');
  } else {
    params.delete('id');
    params.delete('parcelId');
  }

  return baseUrl + '?' + params.toString();
}

export function updateShareLink() {
  var input = document.getElementById('share-link-input');
  if (input) {
    input.value = getShareUrl();
  }
}

export function shareViaEmail() {
  var url = getShareUrl();
  var subject = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
  var body = encodeURIComponent('Schauen Sie sich diese Kartenansicht an:\n\n' + url);
  window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
}

export function shareViaFacebook() {
  var url = encodeURIComponent(getShareUrl());
  window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'width=600,height=400');
}

export function shareViaLinkedIn() {
  var url = encodeURIComponent(getShareUrl());
  window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank', 'width=600,height=400');
}

export function shareViaX() {
  var url = encodeURIComponent(getShareUrl());
  var text = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
  window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'width=600,height=400');
}

export function copyShareLink() {
  var input = document.getElementById('share-link-input');
  var button = document.querySelector('.share-copy-btn');

  if (input && navigator.clipboard) {
    navigator.clipboard.writeText(input.value).then(function() {
      button.textContent = 'Kopiert!';
      button.classList.add('copied');
      setTimeout(function() {
        button.textContent = 'Link kopieren';
        button.classList.remove('copied');
      }, 2000);
    });
  } else if (input) {
    // Fallback for older browsers
    input.select();
    document.execCommand('copy');
    button.textContent = 'Kopiert!';
    button.classList.add('copied');
    setTimeout(function() {
      button.textContent = 'Link kopieren';
      button.classList.remove('copied');
    }, 2000);
  }
}
