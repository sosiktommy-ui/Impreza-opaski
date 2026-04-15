// Map ISO 3166-1 numeric codes (used by world-atlas) to 2-letter codes (used in our DB)
// Only includes countries that exist in our system
export const ISO_NUMERIC_TO_ALPHA2 = {
  '040': 'at', // Austria
  '100': 'bg', // Bulgaria
  '203': 'cz', // Czech Republic
  '233': 'ee', // Estonia
  '250': 'fr', // France
  '276': 'de', // Germany
  '428': 'lv', // Latvia
  '440': 'lt', // Lithuania
  '442': 'lu', // Luxembourg
  '528': 'nl', // Netherlands
  '616': 'pl', // Poland
  '620': 'pt', // Portugal
  '703': 'sk', // Slovakia
  '724': 'es', // Spain
  '826': 'gb', // United Kingdom
  '840': 'us', // USA
  '410': 'kr', // South Korea
};

// Reverse mapping
export const ALPHA2_TO_NUMERIC = Object.fromEntries(
  Object.entries(ISO_NUMERIC_TO_ALPHA2).map(([k, v]) => [v, k])
);

// Country display names in our system
export const COUNTRY_NAMES = {
  at: 'Austria',
  bg: 'Bulgaria',
  cz: 'Czech Republic',
  de: 'Germany',
  ee: 'Estonia',
  es: 'Spain',
  fr: 'France',
  gb: 'United Kingdom',
  lt: 'Lithuania',
  lu: 'Luxembourg',
  lv: 'Latvia',
  nl: 'Netherlands',
  pl: 'Poland',
  pt: 'Portugal',
  sk: 'Slovakia',
  us: 'USA',
  kr: 'South Korea',
};
