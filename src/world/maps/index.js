import { buildSantaBarbara } from './SantaBarbara.js';
import { buildGoldenGate } from './GoldenGate.js';
import { buildMississippi } from './Mississippi.js';
import { buildWashington } from './Washington.js';

export const BUILDERS = {
  'santa-barbara': buildSantaBarbara,
  'golden-gate': buildGoldenGate,
  mississippi: buildMississippi,
  washington: buildWashington,
};
