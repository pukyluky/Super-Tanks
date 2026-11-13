export const LIGHT_CHASSIS_SPRITE = {
  draw(c, color, accent) {
    c.fillStyle = accent;
    c.fillRect(-11, -8, 22, 16);
    c.fillStyle = color;
    c.fillRect(-9, -6, 18, 12);
  }
};

export const MEDIUM_CHASSIS_SPRITE = {
  draw(c, color, accent) {
    c.fillStyle = accent;
    c.fillRect(-12, -9, 24, 18);
    c.fillStyle = color;
    c.fillRect(-10, -7, 20, 14);
  }
};

export const HEAVY_CHASSIS_SPRITE = {
  draw(c, color, accent) {
    c.fillStyle = '#64748b';
    c.fillRect(-13, -12, 26, 24);
    c.fillStyle = accent;
    c.fillRect(-12, -10, 24, 20);
    c.fillStyle = color;
    c.fillRect(-9, -7, 18, 14);
    c.fillStyle = '#cbd5e1';
    c.fillRect(9, -7, 3, 14);
  }
};

export const CHASSIS_SPRITES = {
  light: LIGHT_CHASSIS_SPRITE,
  medium: MEDIUM_CHASSIS_SPRITE,
  heavy: HEAVY_CHASSIS_SPRITE
};

export const MORTAR_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#1f2937';
    c.fillRect(2, -4, 14, 8);
    c.fillStyle = '#fbbf24';
    c.fillRect(13, -4, 3, 8);
  }
};

export const SHOTGUN_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#1f2937';
    c.fillRect(2, -4, 12, 3);
    c.fillRect(2, 1, 12, 3);
    c.fillStyle = '#fb923c';
    c.fillRect(12, -5, 3, 10);
  }
};

export const RICOCHET_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#0f172a';
    c.fillRect(2, -2, 16, 4);
    c.fillStyle = '#22d3ee';
    c.fillRect(6, -1, 12, 2);
  }
};

export const BUILDER_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#1f2937';
    c.fillRect(2, -4, 13, 8);
    c.fillStyle = '#2dd4bf';
    c.fillRect(12, -5, 4, 3);
    c.fillRect(12, 2, 4, 3);
    c.fillStyle = '#99f6e4';
    c.fillRect(13, -1, 3, 2);
  }
};

export const TOXIC_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#1f2937';
    c.fillRect(2, -3, 14, 6);
    c.fillStyle = '#a3e635';
    c.fillRect(5, -4, 6, 8);
    c.fillStyle = '#65a30d';
    c.fillRect(14, -2, 4, 4);
  }
};

export const FIRE_SHOT_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#1f2937';
    c.fillRect(2, -3, 14, 6);
    c.fillStyle = '#ef4444';
    c.fillRect(5, -4, 6, 8);
    c.fillStyle = '#fca5a5';
    c.fillRect(14, -2, 4, 4);
  }
};

export const DRONE_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#0f172a';
    c.fillRect(2, -4, 11, 8);
    c.fillStyle = '#00d4ff';
    c.fillRect(4, -5, 4, 2);
    c.fillRect(4, 3, 4, 2);
    c.fillRect(11, -3, 3, 6);
  }
};

export const PIERCING_TURRET_SPRITE = {
  draw(c) {
    c.fillStyle = '#0f172a';
    c.fillRect(2, -2, 20, 4);
    c.fillStyle = '#e879f9';
    c.fillRect(18, -2, 4, 4);
  }
};

export const TURRET_SPRITES = {
  mortar: MORTAR_TURRET_SPRITE,
  shotgun: SHOTGUN_TURRET_SPRITE,
  ricochet: RICOCHET_TURRET_SPRITE,
  builder: BUILDER_TURRET_SPRITE,
  toxic: TOXIC_TURRET_SPRITE,
  fire_shot: FIRE_SHOT_TURRET_SPRITE,
  drone: DRONE_TURRET_SPRITE,
  piercing: PIERCING_TURRET_SPRITE
};

export function drawTankChassis(c, color, accent, dir, armorId = 'medium') {
  c.save();
  c.rotate(dir);

  c.fillStyle = '#1e293b';
  c.fillRect(-14, -14, 28, 6);
  c.fillRect(-14, 8, 28, 6);

  c.fillStyle = '#475569';
  for (let tx = -12; tx <= 10; tx += 5) {
    c.fillRect(tx, -14, 2, 6);
    c.fillRect(tx, 8, 2, 6);
  }

  const chassisSprite = CHASSIS_SPRITES[armorId] || CHASSIS_SPRITES.medium;
  chassisSprite.draw(c, color, accent);

  c.fillStyle = '#e2e8f0';
  c.fillRect(8, -4, 3, 8);
  c.restore();
}

export function drawTankTurret(c, turretId, color, accent, aimAngle) {
  c.save();
  c.rotate(aimAngle);

  const turretSprite = TURRET_SPRITES[turretId] || TURRET_SPRITES.piercing;
  turretSprite.draw(c);

  c.fillStyle = '#0f172a';
  c.fillRect(-7, -7, 14, 14);
  c.fillStyle = accent;
  c.fillRect(-6, -6, 12, 12);
  c.fillStyle = color;
  c.fillRect(-4, -4, 8, 8);

  c.restore();
}
