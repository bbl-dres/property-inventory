// Local HTML demonstration pages, adapted from service-portal's mock document viewer.
// These are not PDF renderings or copies of the linked public publications.
import { escapeHtml, formatDate, formatNum, formatCurrency } from './utils.js';

const esc = escapeHtml;
function table(headings, rows) {
  return '<table class="document-sheet-table"><thead><tr>' + headings.map(h => '<th>' + esc(h) + '</th>').join('') +
    '</tr></thead><tbody>' + rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell ?? '—') + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}
function section(title, text) { return '<h2>' + esc(title) + '</h2><p>' + esc(text) + '</p>'; }

function content(doc, context) {
  const measurements = context.measurements || [];
  switch (doc.documentTypeCode) {
    case 'B14005': {
      const selected = measurements.filter(m => ['GF','NGF','NF','HNF','NNF','FF','VF','GV','GSF'].includes(m.extensionData?.code));
      const rics = measurements.filter(m => ['GEA','GIA','NIA'].includes(m.extensionData?.code));
      return [
        '<h2>Flächen- und Volumenübersicht</h2>' + table(['Bemessung', 'Wert', 'Genauigkeit'], selected.map(m => [m.type, formatNum(m.value, 0) + ' ' + m.unit, m.accuracy])) +
          '<p>Die Werte entsprechen dem Bemessungsregister dieses Prototyps. Publizierte Werte und Demo-Schätzungen sind dort separat gekennzeichnet.</p>',
        '<h2>RICS-Flächen</h2>' + table(['Bemessung', 'Wert'], rics.map(m => [m.type, formatNum(m.value, 0) + ' ' + m.unit])) +
          section('Bezugsgrundlagen', 'SIA 416:2003 und RICS Code of Measuring Practice, 6th edition (2015). Die verschiedenen Flächenbegriffe haben eigene Abgrenzungen; die Demo stellt keine zertifizierte Flächenermittlung dar.') +
          section('Nachführung', 'Bei Änderungen an Flächen oder Nutzung werden Bemessungsstand, Herkunft und Bezugsdatum gemeinsam dokumentiert.')
      ];
    }
    case 'B14102':
      return [
        '<h2>Erneuerung Gebäudetechnik und Innenausbau</h2>' +
        table(['Kostengruppe', 'Arbeitsgattung', 'Betrag'], (context.costs || []).map(c => [(c.extensionData?.classification || 'BKP') + ' ' + c.costGroup, c.costType, formatCurrency(c.amount)])) +
        '<p>Ausgewählte einmalige Baukosten in CHF, ohne Mehrwertsteuer. Fiktives Szenario; keine vollständige Projektabrechnung.</p>',
        section('Kostengrundlage', 'Die Teilbudgets werden im Kostenregister nach BKP (SN 506 500:2017) gegliedert. Ansätze und Mengen dienen ausschliesslich der Demonstration.') +
        section('Abgrenzung', 'Die Zusammenstellung enthält ausgewählte Arbeitspakete zur Erneuerung. Laufende Energie-, Reinigungs- und Mietkosten sind darin nicht enthalten.') +
        section('Änderungsnachweis', 'Beispielversion 0.1: Übernahme der Kostengruppen, Bezugsmengen und Szenarioansätze aus dem Objektregister.')
      ];
    case 'O07003':
      return [
        '<h2>Wiederkehrende Kontrollen</h2>' + table(['Anlage', 'Beispielaufgabe', 'Intervall'], [
          ['Wärme- / Kälteanlage', 'Funktionskontrolle durch Fachbetrieb', 'Jährlich'],
          ['Lüftung', 'Filter und Betriebszustand prüfen', 'Halbjährlich'],
          ['Beleuchtung', 'Funktionskontrolle', 'Jährlich'],
          ['Trinkwasserinstallation', 'Sichtkontrolle und Dokumentation', 'Jährlich']]) +
        '<p>Schematischer Wartungsplan. Die Intervalle sind fiktiv und ersetzen keine anlagenbezogenen Vorgaben.</p>',
        section('Durchführung und Nachweis', 'Im Beispielprozess erfasst das Facility Management Datum, betroffene Anlage, Feststellungen und den nächsten vorgesehenen Termin.') +
        table(['Arbeitsschritt', 'Zuständigkeit'], [['Termin abstimmen', 'Facility Management (Demo)'], ['Arbeiten dokumentieren', 'Fachbetrieb (Demo)'], ['Nachweis ablegen', 'Objektverantwortung (Demo)']]) +
        section('Ablage', 'Wartungsnachweise werden im Dokumentregister dem Gebäude und der jeweiligen Anlage zugeordnet.')
      ];
    case 'O03001':
      return [
        section('Betriebsorganisation', 'Dieses Beispielhandbuch zeigt, wie Objektinformationen, Zuständigkeiten und wiederkehrende Aufgaben an einem Ort zusammengeführt werden können.') +
        table(['Rolle', 'Aufgabe im Beispielprozess'], [['Objektverantwortung', 'Koordination und Freigaben'], ['Facility Management', 'Betrieb und Wartungsplanung'], ['Portfoliomanagement', 'Planung von Erneuerungen']]) +
        section('Dokumentation', 'Bemessungen, Anlagen, Verträge und Dokumente sind dem jeweiligen Objekt zugeordnet. Zuständigkeiten sind im Kontaktregister hinterlegt.'),
        section('Meldung und Bearbeitung', 'Eine Meldung wird mit Objektbezug und kurzer Beschreibung erfasst. Die zuständige Stelle ergänzt Bearbeitungsstand und Abschlussvermerk.') +
        section('Regelmässige Überprüfung', 'Das Beispiel sieht eine gemeinsame Prüfung der Stammdaten, Wartungstermine und Dokumentversionen vor.') +
        section('Versionierung', 'Änderungen werden mit Datum und Versionsstand nachvollziehbar dokumentiert. Diese Vorschau enthält keine verbindlichen Betriebsanweisungen.')
      ];
    case 'B14103':
      return [
        '<h2>Monatliches Verbrauchsprofil</h2><p>Illustratives Profil, auf 100 % des Jahresverbrauchs normiert. Keine gemessenen Energiedaten.</p>' +
        table(['Monat', 'Anteil'], ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'].map((month, i) => [month, [12,11,10,8,7,6,6,6,7,8,9,10][i] + ' %'])),
        section('Erfassungsumfang', 'Das Muster zeigt die monatliche Zusammenstellung von Energiebezugsdaten. In einer produktiven Anwendung werden Zähler, Energieträger und Erfassungszeitraum mitgeführt.') +
        table(['Prüfung', 'Beispiel'], [['Vollständigkeit', 'Alle Monate des Bezugsjahres vorhanden'], ['Einheiten', 'Gleiche Bezugsgrösse innerhalb einer Zeitreihe'], ['Vergleichbarkeit', 'Änderungen an Nutzung und Fläche vermerken']]) +
        section('Auswertung', 'Kennzahlen werden nur bei gleicher Systemgrenze verglichen. Die dargestellten Prozentwerte dienen der Vorschaufunktion.')
      ];
    default:
      return [section('Publikationsübersicht', 'Zu diesem Objekt ist eine öffentliche BBL-Publikation verknüpft. Diese Beispielseite zeigt die Dokumentvorschau; sie gibt den Inhalt der Originalpublikation nicht wieder.') +
        section('Objekt', context.buildingName || '—') + section('Standort', context.address || '—') +
        section('Originalpublikation', 'Über «Original öffnen» gelangen Sie zur öffentlichen Quelle. Die Originaldatei wird von der herausgebenden Stelle bereitgestellt.')];
  }
}

export function documentPages(doc, context = {}) {
  const pages = content(doc, context);
  return pages.map((body, i) => '<div class="document-sheet-frame"><article class="document-sheet" lang="de" aria-label="Seite ' + (i + 1) + '">' +
    '<header class="document-sheet-header"><span>Liegenschaften Inventar</span><span>Demovorschau</span></header>' +
    '<p class="document-sheet-kicker">' + esc(doc.documentTypeCode || '') + ' · ' + esc(doc.type || 'Dokument') + '</p>' +
    '<h1>' + esc(i ? doc.type + ' — Fortsetzung' : doc.name) + '</h1>' +
    '<dl class="document-sheet-facts"><div><dt>Objekt</dt><dd>' + esc(context.buildingName || '—') + '</dd></div>' +
    '<div><dt>Stand</dt><dd>' + esc(formatDate(doc.validFrom) || 'Siehe Originalpublikation') + '</dd></div></dl>' + body +
    '<footer class="document-sheet-footer"><span>Beispielinhalt · keine Originaldatei</span><span>Seite ' + (i + 1) + ' / ' + pages.length + '</span></footer></article></div>').join('');
}
