// Preserve existing double-escaped filter URLs, including commas inside values.
// Handwritten/malformed percent escapes must never prevent the app from booting.
export function readFilterParams(params, keys) {
  return Object.fromEntries(keys.map(key => [key, (params.get('filter_' + key) || '').split(',').filter(Boolean).map(value => {
    try { return decodeURIComponent(value); } catch { return value; }
  })]));
}

export function writeFilterParams(url, filters) {
  for (const [key, values] of Object.entries(filters)) {
    if (values.length) url.searchParams.set('filter_' + key, values.map(encodeURIComponent).join(','));
    else url.searchParams.delete('filter_' + key);
  }
  return url;
}
