export const TRACE_COLORS = {
  ricochet: (a) => `rgba(34, 211, 238, ${a})`,
  charged: (a) => `rgba(34, 211, 238, ${a})`,
  emp: (a) => `rgba(0, 212, 255, ${a})`,
  drone: (a) => `rgba(0, 212, 255, ${a})`,
  drone_shot: (a) => `rgba(0, 212, 255, ${a})`,
  short_shotgun: (a) => `rgba(0, 212, 255, ${a})`,
  freeze: (a) => `rgba(103, 232, 249, ${a})`,
  toxic: (a) => `rgba(163, 230, 53, ${a})`,
  fire_shot: (a) => `rgba(239, 68, 68, ${a})`,
  fire_wall: (a) => `rgba(239, 68, 68, ${a})`,
  bloodsucker: (a) => `rgba(225, 29, 72, ${a})`,
  piercing: (a) => `rgba(232, 121, 249, ${a})`,
  trap: (a) => `rgba(232, 121, 249, ${a})`,
  builder: (a) => `rgba(45, 212, 191, ${a})`,
  molotov: (a) => `rgba(249, 115, 22, ${a})`,
  mine: (a) => `rgba(74, 222, 128, ${a})`,
  mortar: (a) => `rgba(251, 191, 36, ${a})`,
  standard: (a) => `rgba(253, 224, 71, ${a})`
};

export const PARTICLE_PALETTES = {
  ricochet: ['#22d3ee', '#a5f3fc', '#fde047', '#ffffff'],
  charged: ['#22d3ee', '#a5f3fc', '#fde047', '#ffffff'],
  charge_up: ['#22d3ee', '#a5f3fc', '#fde047', '#ffffff'],
  emp: ['#00d4ff', '#38bdf8', '#1d4ed8', '#e0f2fe'],
  drone: ['#00d4ff', '#38bdf8', '#1d4ed8', '#e0f2fe'],
  drone_shot: ['#00d4ff', '#38bdf8', '#1d4ed8', '#e0f2fe'],
  short_shotgun: ['#00d4ff', '#38bdf8', '#1d4ed8', '#e0f2fe'],
  freeze: ['#67e8f9', '#cffafe', '#38bdf8', '#ffffff'],
  toxic: ['#a3e635', '#bef264', '#65a30d', '#dcfce7'],
  poison: ['#a3e635', '#bef264', '#65a30d', '#dcfce7'],
  fire_shot: ['#ef4444', '#dc2626', '#f87171', '#fca5a5'],
  fire_pool: ['#ef4444', '#dc2626', '#f87171', '#fca5a5'],
  fire_wall: ['#ef4444', '#dc2626', '#f87171', '#fca5a5'],
  bloodsucker: ['#e11d48', '#fb7185', '#9f1239', '#ffe4e6'],
  rage: ['#e11d48', '#f43f5e', '#fbbf24', '#ffffff'],
  heal: ['#4ade80', '#22c55e', '#bbf7d0', '#ffffff'],
  piercing: ['#e879f9', '#f5d0fe', '#ffffff'],
  builder: ['#2dd4bf', '#99f6e4', '#b85d40', '#ffffff'],
  trap: ['#a855f7', '#e9d5ff', '#38bdf8'],
  trap_place: ['#a855f7', '#e9d5ff', '#38bdf8'],
  molotov: ['#f97316', '#ef4444', '#fde047'],
  default: ['#fbbf24', '#f97316', '#ef4444', '#64748b']
};

export const BRICK_PALETTES = {
  3: { base: '#9a4a32', light: '#b85d40', dark: '#662d1c', mortar: '#4a2115' },
  2: { base: '#7f3e2b', light: '#994e38', dark: '#4f2216', mortar: '#2b130c' },
  1: { base: '#592c20', light: '#703a2b', dark: '#381911', mortar: '#1a0c08' }
};

export const SPECIAL2_PREVIEW_COLORS = {
  molotov: 'rgba(249, 115, 22, 0.8)',
  emp_bomb: 'rgba(0, 212, 255, 0.88)',
  trap: 'rgba(192, 132, 252, 0.8)',
  auto_turret: 'rgba(45, 212, 191, 0.8)',
  default: 'rgba(74, 222, 128, 0.8)'
};
