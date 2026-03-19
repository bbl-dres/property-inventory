// Utility functions

export function escapeHtml(text) {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeForJs(text) {
  if (text == null) return '';
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"');
}

export function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function getNestedProperty(obj, path) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = current[parts[i]];
  }
  return current;
}

// Format number with Swiss thousand separator (1'000)
export function formatNum(value, decimals) {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  const fixed = decimals != null ? num.toFixed(decimals) : String(num);
  const parts = fixed.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return parts.join('.');
}

export function formatArea(value) {
  if (value === undefined || value === null || value === '') return null;
  return formatNum(value, 0) + ' m\u00B2';
}

export function formatVolume(value) {
  if (value === undefined || value === null || value === '') return null;
  return formatNum(value, 0) + ' m\u00B3';
}

export function formatCHF(value) {
  if (value === undefined || value === null || value === '') return null;
  return 'CHF ' + formatNum(value, 0);
}

export function formatDate(isoDate) {
  if (!isoDate) return null;
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? match[3] + '.' + match[2] + '.' + match[1] : null;
}

export function formatCurrency(amount) {
  if (amount == null) return '\u2014';
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency: 'CHF',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCurrencyWithUnit(amount, einheit) {
  if (amount == null) return '\u2014';
  let currency = 'CHF';
  if (einheit) {
    const parts = einheit.split('/');
    if (parts.length > 0) currency = parts[0].trim();
  }
  try {
    return new Intl.NumberFormat('de-CH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  } catch (e) {
    // Fallback if currency code is invalid
    return Number(amount).toLocaleString('de-CH') + ' ' + currency;
  }
}

export function getStatusClassName(status) {
  if (!status) return 'status-inactive';
  switch (status) {
    case 'Aktiv': return 'status-active';
    case 'In Renovation': return 'status-renovation';
    case 'In Planung': return 'status-planning';
    case 'Verkauft': return 'status-inactive';
    default: return 'status-inactive';
  }
}

export function getContractStatusClassName(status) {
  if (!status) return '';
  const s = status.toLowerCase();
  if (s === 'aktiv') return 'status-active';
  if (s === 'gek\u00FCndigt') return 'status-terminated';
  if (s === 'ausgelaufen') return 'status-expired';
  return '';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function fetchWithErrorHandling(url, options) {
  return fetch(url, options)
    .then(function(response) {
      if (!response.ok) {
        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
      }
      return response.json();
    });
}
