// ─── App Color System ────────────────────────────────────────────────────────
// Each area of life gets a ColorSet — a light background and a dark accent.
// We store just the palette key in the database (e.g. "forest"), not the hex
// values. That way we can tweak colors later without any DB migration.

export type PaletteKey =
  | 'forest' | 'ocean' | 'sand' | 'ember' | 'steel'
  | 'ash' | 'honey' | 'plum' | 'clay' | 'teal';

export interface ColorSet {
  key: PaletteKey;
  label: string;
  light: string; // block background
  dark: string;  // text + accents on that block
}

export const PALETTE: ColorSet[] = [
  { key: 'forest', label: 'Forest', light: '#C5D9C5', dark: '#1E4A2A' },
  { key: 'ocean',  label: 'Ocean',  light: '#B8D4E8', dark: '#0C3554' },
  { key: 'sand',   label: 'Sand',   light: '#E8DCC8', dark: '#5C4020' },
  { key: 'ember',  label: 'Ember',  light: '#F0D0B0', dark: '#6B2C08' },
  { key: 'steel',  label: 'Steel',  light: '#C4CCD8', dark: '#202840' },
  { key: 'ash',    label: 'Ash',    light: '#D0CCCA', dark: '#38302E' },
  { key: 'honey',  label: 'Honey',  light: '#F0E4A8', dark: '#584400' },
  { key: 'plum',   label: 'Plum',   light: '#D8C8E4', dark: '#3C1860' },
  { key: 'clay',   label: 'Clay',   light: '#ECC8B8', dark: '#642010' },
  { key: 'teal',   label: 'Teal',   light: '#B8DCD8', dark: '#144038' },
];

// Looks up a ColorSet by key. Falls back to the first color if key is invalid.
export const getPalette = (key: string): ColorSet =>
  PALETTE.find((p) => p.key === key) ?? PALETTE[0];

// Global app background — warm off-white paper feel
export const APP_BACKGROUND = '#F5F0E8';
