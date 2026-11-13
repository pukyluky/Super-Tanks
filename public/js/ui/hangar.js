import { state, dom } from '../state.js';
import { drawTankChassis, drawTankTurret } from '../assets/tankSprites.js';

function formatSpecial1Damage(tu) {
  if (!tu) return '—';
  if (tu.id === 'shotgun') {
    return `${tu.pelletDamage} × ${tu.pellets} (máx. ${tu.pelletDamage * tu.pellets} PV)`;
  }
  if (tu.id === 'builder') {
    return '0 PV (crea muro)';
  }
  if (tu.id === 'toxic') {
    return `${tu.specialDamage} + ${tu.poisonDamage}/t (${tu.poisonDuration}t) ó charco ${tu.poisonDamage}/t`;
  }
  if (tu.id === 'fire_shot') {
    return `${tu.specialDamage} + ${tu.burnDamage}/t (${tu.burnDuration}t) ó charco rojo ${tu.burnDamage}/t`;
  }
  if (tu.id === 'drone') {
    return `${tu.droneShotDamage} PV/tiro (${tu.droneHp} PV, ${tu.droneMoveAp} AP)`;
  }
  return `${tu.specialDamage} PV`;
}

function formatSpecial2Damage(sp2) {
  if (!sp2) return '—';
  if (sp2.id === 'molotov' || sp2.id === 'fire_wall') {
    return `${sp2.impactDamage} + ${sp2.burnDamage}/t (${sp2.duration}t)`;
  }
  if (sp2.id === 'trap') {
    return `${sp2.damage} PV × ${sp2.burstCount || 2} (-35% mov.)`;
  }
  if (sp2.id === 'auto_turret') {
    return `${sp2.fireDamage} PV/t (${sp2.turretHp} PV, ${sp2.duration || 4}t)`;
  }
  if (sp2.id === 'charged_shot') {
    return `${sp2.damage} PV (1t carga)`;
  }
  if (sp2.id === 'freeze_shot') {
    return `${sp2.damage} PV + Aturde ${sp2.stunTurns || 1}t`;
  }
  if (sp2.id === 'emp_bomb') {
    return `-25% mov. + Supresión ${sp2.suppressTurns}t (Directo: +${sp2.directStunTurns}t Stun)`;
  }
  return `${sp2.damage} PV`;
}

export function renderTankSkillsSlot() {
  if (!state.catalog || !dom.tankSkillsSlot) return;
  const { tankTypes, turrets, specials2 } = state.catalog;
  const tt = tankTypes[state.selectedTankType];
  if (!tt) return;
  const tu = turrets[tt.turretId];
  const sp2 = specials2?.[tt.special2Id];

  const isShortShotgun = tt.basicWeapon === 'short_shotgun';
  const skills = [
    {
      key: '1',
      name: isShortShotgun ? 'Escopeta Corta' : 'Cañón Estándar',
      dmg: isShortShotgun ? '7 × 4 (máx. 28 PV)' : '24 PV',
      cd: 'Sin CD (0t)',
      desc: isShortShotgun
        ? 'Disparo básico de corta distancia (4 perdigones, alcance 22).'
        : 'Disparo directo 360° con pequeño impacto sobre ladrillo.'
    },
    {
      key: '2',
      name: tu ? tu.name : tt.specialName,
      dmg: formatSpecial1Damage(tu),
      cd: `${tu ? tu.cooldown : 2} turnos`,
      desc: tu ? tu.desc : ''
    },
    {
      key: '3',
      name: sp2 ? sp2.name : tt.special2Name,
      dmg: formatSpecial2Damage(sp2),
      cd: `${sp2 ? sp2.cooldown : 2} turnos`,
      desc: sp2 ? sp2.desc : ''
    }
  ];

  dom.tankSkillsSlot.innerHTML = `
    <div class="skills-header">
      <span style="color:${tt.color}">${tt.name}</span>
      <span style="font-size:11px;color:var(--muted);">3 disparos</span>
    </div>
    ${skills
      .map(
        (sk) => `
        <div class="skill-card">
          <div class="skill-card-head">
            <span><span class="skill-key">[${sk.key}]</span>${sk.name}</span>
          </div>
          <div class="skill-metrics">
            <span class="skill-chip dmg">Daño: ${sk.dmg}</span>
            <span class="skill-chip cd">CD: ${sk.cd}</span>
          </div>
          <div class="skill-desc">${sk.desc}</div>
        </div>`
      )
      .join('')}
  `;
}

export function renderTankPreview() {
  if (!state.catalog) return;
  const tt = state.catalog.tankTypes[state.selectedTankType];
  const pCtx = dom.previewCtx;
  pCtx.imageSmoothingEnabled = false;
  pCtx.clearRect(0, 0, 96, 96);

  pCtx.fillStyle = '#0e1420';
  pCtx.fillRect(0, 0, 96, 96);
  pCtx.strokeStyle = '#1d2738';
  for (let i = 0; i <= 96; i += 16) {
    pCtx.beginPath();
    pCtx.moveTo(i, 0);
    pCtx.lineTo(i, 96);
    pCtx.stroke();
    pCtx.beginPath();
    pCtx.moveTo(0, i);
    pCtx.lineTo(96, i);
    pCtx.stroke();
  }

  pCtx.save();
  pCtx.translate(48, 48);
  pCtx.scale(2.2, 2.2);
  drawTankChassis(pCtx, tt.color, tt.accent, 0, state.selectedArmor);
  drawTankTurret(pCtx, tt.turretId, tt.color, tt.accent, -0.35);
  pCtx.restore();
}

export function renderHangarOptions() {
  const { tankTypes, armors, turrets, difficulties } = state.catalog;

  dom.tankTypeContainer.innerHTML = '';
  Object.values(tankTypes).forEach((tt) => {
    const tu = turrets[tt.turretId];
    const btn = document.createElement('button');
    btn.className = `option-card ${state.selectedTankType === tt.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="option-title">
        <span style="color:${tt.color}">${tt.name}</span>
        <span style="color:#fbbf24;font-size:11px;">${tt.specialName} (${tu ? tu.cooldown : 2}t)</span>
      </div>
      <div class="option-desc">${tt.desc}</div>
    `;
    btn.onclick = () => {
      state.selectedTankType = tt.id;
      renderHangarOptions();
    };
    dom.tankTypeContainer.appendChild(btn);
  });

  dom.armorContainer.innerHTML = '';
  Object.values(armors).forEach((ar) => {
    const btn = document.createElement('button');
    btn.className = `option-card ${state.selectedArmor === ar.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="option-title">
        <span>${ar.name}</span>
        <span style="color:#38bdf8;font-size:12px;">${ar.maxHp} PV • ${ar.moveAp} AP</span>
      </div>
      <div class="option-desc">${ar.desc}</div>
    `;
    btn.onclick = () => {
      state.selectedArmor = ar.id;
      renderHangarOptions();
    };
    dom.armorContainer.appendChild(btn);
  });

  dom.difficultyContainer.innerHTML = '';
  Object.values(difficulties).forEach((df) => {
    const btn = document.createElement('button');
    btn.className = `pill ${state.selectedDifficulty === df.id ? 'active' : ''}`;
    btn.textContent = `${df.name} (${df.enemyCount} IA)`;
    btn.onclick = () => {
      state.selectedDifficulty = df.id;
      renderHangarOptions();
    };
    dom.difficultyContainer.appendChild(btn);
  });

  renderTankSkillsSlot();
  renderTankPreview();
}

export function initHangarUI(sendWs) {
  dom.mapOptions.querySelectorAll('.pill').forEach((btn) => {
    btn.onclick = () => {
      dom.mapOptions.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedMap = btn.dataset.map;
    };
  });

  const startMatch = () => {
    state.rubbleSet.clear();
    state.activeTraces = [];
    state.particles = [];
    state.floatingTexts = [];
    state.weaponMode = 'normal';
    state.clickMode = 'shoot';
    dom.gameoverOverlay.classList.add('hidden');
    sendWs({
      type: 'start_game',
      tankTypeId: state.selectedTankType,
      armorId: state.selectedArmor,
      difficulty: state.selectedDifficulty,
      mapStyle: state.selectedMap
    });
  };

  dom.startBtn.onclick = startMatch;
  dom.rematchBtn.onclick = startMatch;
  dom.backHangarBtn.onclick = () => {
    dom.battleScreen.classList.add('hidden');
    dom.hangarScreen.classList.remove('hidden');
  };
  dom.overlayHangarBtn.onclick = () => {
    dom.gameoverOverlay.classList.add('hidden');
    dom.battleScreen.classList.add('hidden');
    dom.hangarScreen.classList.remove('hidden');
  };
}
