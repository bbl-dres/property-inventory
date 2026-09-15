// KI mock answers in the search suggestions. Prototype only: a handful of question templates are
// answered from the loaded portfolio data (no model, no network). The point is the interaction
// (question among the suggestions, answer inline) before a real assistant is wired in.

import { state } from './state.js';
import { escapeHtml, highlightMatch, formatNum, extractYear } from './utils.js';

function formatSquareMetres(value) {
  return formatNum(value || 0, 0) + ' m²';
}

function buildingArea(f) {
  return Number(((f.properties || {}).extensionData || {}).netFloorArea || 0);
}

function buildingChip(f) {
  const p = f.properties;
  return '<a href="#" class="search-answer-link" data-building="' + escapeHtml(p.buildingId) + '">' +
    '<span class="material-symbols-outlined" aria-hidden="true">apartment</span>' + escapeHtml(p.name) + '</a>';
}

function buildingChips(features) {
  return '<span class="search-answer-links">' + features.map(buildingChip).join('') + '</span>';
}

function joinNames(features) {
  return features.map(function(f) { return '«' + escapeHtml(f.properties.name) + '»'; }).join(', ');
}

function buildingAnswer(f) {
  const p = f.properties;
  return {
    questionHtml: highlightMatch('Wie gross ist die Nettogeschossfläche von «' + p.name + '»?', p.name),
    answerHtml: '«' + escapeHtml(p.name) + '» (' + escapeHtml((p.city || '') + ', ' + (p.country || '')) +
      ') hat eine Nettogeschossfläche von <b>' + formatSquareMetres(buildingArea(f)) + '</b>. Baujahr ' +
      (extractYear(p.constructionYear) || '—') + ', Status «' + escapeHtml(p.status || '—') + '».' + buildingChips([f])
  };
}

// Returns { questionHtml, answerHtml } or null when no template matches
export function suggestAiQuestion(term, localMatches) {
  if (!state.buildingsData || !state.buildingsData.features.length) return null;
  const features = state.buildingsData.features;
  const t = term.toLowerCase().trim();
  const question = function(text) { return highlightMatch(text, term); };
  const isQuestion = /\?$/.test(t) || /^(wie|welche|welches|was|wo|gibt)\b/.test(t);

  function byStatus(status, label) {
    const hits = features.filter(function(f) { return f.properties.status === status; });
    return {
      questionHtml: question('Welche Objekte sind ' + label + '?'),
      answerHtml: hits.length
        ? '<b>' + hits.length + (hits.length === 1 ? ' Objekt ist' : ' Objekte sind') + '</b> ' + label + ': ' + joinNames(hits) + '.' + buildingChips(hits)
        : 'Zurzeit ist kein Objekt ' + label + '.'
    };
  }

  // Keyword intents first
  if (/renov|sanier/.test(t)) return byStatus('In Renovation', 'in Renovation');
  if (/planung|geplant/.test(t)) return byStatus('In Planung', 'in Planung');
  if (/ausser betrieb|stillgelegt/.test(t)) return byStatus('Ausser Betrieb', 'ausser Betrieb');

  if (/gesamt|total|summe|portfolio|alle objekte|geschossfl|fläche|flaeche/.test(t) && !localMatches.length) {
    const total = features.reduce(function(sum, f) { return sum + buildingArea(f); }, 0);
    const largest = features.slice().sort(function(a, b) { return buildingArea(b) - buildingArea(a); })[0];
    return {
      questionHtml: question('Wie gross ist die gesamte Nettogeschossfläche des Portfolios?'),
      answerHtml: 'Das Portfolio umfasst <b>' + features.length + ' Objekte</b> mit total <b>' + formatSquareMetres(total) +
        '</b> Nettogeschossfläche. Das grösste Objekt ist «' + escapeHtml(largest.properties.name) + '» mit ' +
        formatSquareMetres(buildingArea(largest)) + '.' + buildingChips([largest])
    };
  }

  if (/ältest|baujahr/.test(t)) {
    const dated = features.filter(function(f) { return extractYear(f.properties.constructionYear); })
      .sort(function(a, b) { return extractYear(a.properties.constructionYear) - extractYear(b.properties.constructionYear); });
    if (dated.length) {
      const oldest = dated[0].properties;
      return {
        questionHtml: question('Welches ist das älteste Objekt im Portfolio?'),
        answerHtml: 'Das älteste Objekt ist «' + escapeHtml(oldest.name) + '» in ' + escapeHtml(oldest.city) +
          ' mit Baujahr <b>' + extractYear(oldest.constructionYear) + '</b>.' + buildingChips([dated[0]])
      };
    }
  }

  // The term is part of a building name: its floor area
  const nameMatches = localMatches.filter(function(f) { return (f.properties.name || '').toLowerCase().indexOf(t) !== -1; });
  if (nameMatches.length) return buildingAnswer(nameMatches[0]);

  // A place (city, region or country) matches: objects there
  let place = null;
  features.some(function(f) {
    const p = f.properties;
    place = [p.city, p.stateProvincePrefecture, p.country].find(function(v) {
      return v && String(v).toLowerCase().indexOf(t) !== -1;
    }) || null;
    return !!place;
  });
  if (place) {
    const inPlace = features.filter(function(f) {
      const p = f.properties;
      return p.city === place || p.stateProvincePrefecture === place || p.country === place;
    });
    const area = inPlace.reduce(function(sum, f) { return sum + buildingArea(f); }, 0);
    return {
      questionHtml: question('Wie viele Objekte gibt es in ' + place + '?'),
      answerHtml: 'In ' + escapeHtml(place) + ' gibt es <b>' + inPlace.length + (inPlace.length === 1 ? ' Objekt' : ' Objekte') +
        '</b> mit total ' + formatSquareMetres(area) + ' Nettogeschossfläche: ' + joinNames(inPlace) + '.' + buildingChips(inPlace)
    };
  }

  // A street matched a building: its floor area
  if (localMatches.length) return buildingAnswer(localMatches[0]);

  // Looks like a question, but nothing matched
  if (isQuestion) {
    return {
      questionHtml: escapeHtml(term),
      answerHtml: 'Diese Frage kann der Prototyp noch nicht beantworten. Beispiele, die funktionieren: ' +
        '«Wie viele Objekte gibt es in Bern?», «Welche Objekte sind in Renovation?», «Wie gross ist die gesamte Nettogeschossfläche?».'
    };
  }
  return null;
}

// Markup of the "Frage stellen" section (question row + hidden answer)
export function renderAiSection(suggestion) {
  if (!suggestion) return '';
  return '<div class="search-section-header"><span>Frage stellen</span><span class="search-section-source">KI</span></div>' +
    '<div class="search-item search-item--ask" id="search-ai-item" role="option" tabindex="0" aria-expanded="false">' +
      '<span class="material-symbols-outlined search-item-icon" aria-hidden="true">auto_awesome</span>' +
      '<span class="search-item-main"><span class="search-item-title">' + suggestion.questionHtml + '</span></span>' +
      '<span class="search-item-meta"><span class="material-symbols-outlined" aria-hidden="true">keyboard_return</span>Antwort</span>' +
    '</div>' +
    '<div class="search-answer" id="search-ai-answer" hidden aria-live="polite"></div>';
}

// Reveal the answer below the suggested question; chips in the answer select the object on the map
export function showAiAnswer(suggestion, onSelectBuilding) {
  const answerEl = document.getElementById('search-ai-answer');
  const item = document.getElementById('search-ai-item');
  if (!answerEl || !suggestion) return;
  answerEl.innerHTML = suggestion.answerHtml +
    '<span class="search-answer-note">Prototyp: Antwort aus den geladenen Daten, kein Sprachmodell.</span>';
  answerEl.hidden = false;
  if (item) item.setAttribute('aria-expanded', 'true');
  answerEl.querySelectorAll('[data-building]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      onSelectBuilding(this.dataset.building);
    });
  });
}
