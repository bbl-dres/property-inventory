// One collator per locale, not one localeCompare options setup per comparison.
const collators = new Map();
export function compareTableValues(a, b, direction, locale) {
  const emptyA = a == null || a === '', emptyB = b == null || b === '';
  if (emptyA || emptyB) return emptyA && emptyB ? 0 : emptyA ? 1 : -1;
  const numberA = Number(a), numberB = Number(b);
  if (!Number.isNaN(numberA) && !Number.isNaN(numberB)) return (numberA - numberB) * direction;
  if (!collators.has(locale)) collators.set(locale, new Intl.Collator(locale, { numeric: true, sensitivity: 'base' }));
  return collators.get(locale).compare(String(a), String(b)) * direction;
}
