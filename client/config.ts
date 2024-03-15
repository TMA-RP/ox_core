export * from '../common/config';

export const DEATH_SYSTEM = GetConvarInt('ox:deathSystem', 1) === 1;
export const SPAWN_SELECT = GetConvarInt('ox:spawnSelect', 0) === 1;

export const DEFAULT_SPAWN = [2155.0837, 2921.0220, -61.9025, 95.4659];
export const SPAWN_LOCATIONS = [
  [394.503174, -713.93396, 29.28544, 268.384399],
  [-1038.936401, -2739.876953, 13.852936, 328.259064],
  [-491.354736, -697.363525, 33.24139, 0.049134],
];
