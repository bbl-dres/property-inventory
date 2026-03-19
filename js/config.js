// Configuration constants

export const statusColors = {
  'Aktiv': '#2e7d32',
  'In Renovation': '#ef6c00',
  'In Planung': '#1976d2',
  'Verkauft': '#6C757D'
};

export const filterConfig = {
  status: { property: 'bbl_stat', label: 'Status' },
  eigentum: { property: 'bbl_eigen', label: 'Art Eigentum' },
  strategie: { property: 'bbl_ostr', label: 'Objektstrategie' },
  mietmodell: { property: 'bbl_mietm', label: 'Mietmodell' },
  teilportfolio: { property: 'bbl_port', label: 'Teilportfolio' },
  portfoliogruppe: { property: 'bbl_port2', label: 'Portfoliogruppe' },
  gebaeudeart: { property: 'bbl_gbda1', label: 'Gebäudeart' },
  land: { property: 'adr_land', label: 'Land' },
  region: { property: 'adr_reg', label: 'Region' },
  ort: { property: 'adr_ort', label: 'Ort' },
  gemeinde: { property: 'bfs_gem', label: 'Gemeinde' },
  kgskat: { property: 'kgs_kat', label: 'KGS Kategorie' }
};

export const mapStyles = {
  'positron': {
    name: 'Light',
    url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    thumbnail: 'https://basemaps.cartocdn.com/light_all/8/134/91.png'
  },
  'voyager': {
    name: 'Standard',
    url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    thumbnail: 'https://basemaps.cartocdn.com/rastertiles/voyager/8/134/91.png'
  },
  'swissimage': {
    name: 'Luftbild',
    url: {
      version: 8,
      glyphs: 'https://tiles.basemaps.cartocdn.com/fonts/{fontstack}/{range}.pbf',
      sources: {
        'swissimage': {
          type: 'raster',
          tiles: ['https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg'],
          tileSize: 256,
          maxzoom: 20,
          attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
        }
      },
      layers: [{ id: 'swissimage', type: 'raster', source: 'swissimage' }]
    },
    thumbnail: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/8/134/91.jpeg'
  },
  'dark-matter': {
    name: 'Dark',
    url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    thumbnail: 'https://basemaps.cartocdn.com/dark_all/8/134/91.png'
  }
};

export const placeholderImages = [
  'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1554435493-93422e8220c8?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1577495508048-b635879837f1?w=800&h=600&fit=crop',
  'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop'
];

export const paperSizes = {
  'a0': { width: 841, height: 1189 },
  'a1': { width: 594, height: 841 },
  'a2': { width: 420, height: 594 },
  'a3': { width: 297, height: 420 },
  'a4': { width: 210, height: 297 },
  'a5': { width: 148, height: 210 }
};
