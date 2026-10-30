import { buildMiamiBeach } from './MiamiBeach.js';
import { buildGoldenGate } from './GoldenGate.js';
import { buildMississippi } from './Mississippi.js';
import { buildWashington } from './Washington.js';

export const BUILDERS = {
  'miami-beach': buildMiamiBeach,
  'golden-gate': buildGoldenGate,
  mississippi: buildMississippi,
  washington: buildWashington,
};
