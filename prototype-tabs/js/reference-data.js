// Both prototypes load the same pinned, offline catalogue snapshot.
let metadata = null;
export const statusColors = {};
const statusClasses = {};

export function initReferenceData(value) {
  if (value?.schemaVersion !== 1 || !value.valueLists?.['local-operating-status']) throw new Error('Ungültige Referenzdaten: meta.json');
  metadata = value;
  Object.keys(statusColors).forEach(key => delete statusColors[key]);
  Object.keys(statusClasses).forEach(key => delete statusClasses[key]);
  referenceValues('local-operating-status').forEach(item => {
    const label = item.labels.de;
    statusColors[label] = item.color;
    statusClasses[label] = item.className;
  });
}
export function referenceValues(list) { return metadata?.valueLists[list]?.values || []; }
export function referenceLabel(list, code, language = 'de') {
  const value = referenceValues(list).find(item => item.code === code);
  return value?.labels[language] || value?.labels.de || value?.labels.en || code || '—';
}
export function getStatusClassName(status) { return statusClasses[status] || 'status-inactive'; }
export function statusLegendItems() { return Object.entries(statusColors).map(([label, color]) => ({ color, label })); }
