import { state, dom, isMobileUi } from '../state.js';
import { drawTankChassis, drawTankTurret } from '../assets/tankSprites.js';
import { requestLegacyRematch, resetMultiplayerOnHangarReturn } from './multiplayer.js';

const MAP_META = {
  bunkers: { name: 'Búnkeres', desc: 'Coberturas simétricas de ladrillo y pasillos tácticos.' },
  labyrinth: { name: 'Laberinto', desc: 'Rutas estrechas con muros destructibles y flanqueos.' },
  open: { name: 'Campo Abierto', desc: 'Campo despejado con poca cobertura para duelos directos.' },
  random: { name: '🎲 Aleatorio', desc: 'Generación aleatoria con conectividad garantizada.' }
};

export function updateWizardChrome() {
  if (!dom.hangarScreen) return;
  const step = state.hangarStep || 1;
  dom.hangarScreen.dataset.mobileStep = String(step);

  const tt = state.catalog?.tankTypes?.[state.selectedTankType];
  const ar = state.catalog?.armors?.[state.selectedArmor];
  const df = state.catalog?.difficulties?.[state.selectedDifficulty];
  const mapInfo = MAP_META[state.selectedMap] || { name: state.selectedMap };

  if (dom.stepVal1) dom.stepVal1.textContent = tt ? tt.name : '—';
  if (dom.stepVal2) dom.stepVal2.textContent = ar ? ar.name.replace('Blindaje ', '') : '—';
  if (dom.stepVal3) {
    dom.stepVal3.textContent = state.syncMode === 'pve'
      ? (df ? `${df.name} (${df.enemyCount} IA)` : '—')
      : state.syncMode === 'pvp_adhoc' ? 'PvP Sala' : 'Módem 90s';
  }
  if (dom.stepVal4) dom.stepVal4.textContent = mapInfo.name;

  if (dom.mobileWizardSteps) {
    dom.mobileWizardSteps.querySelectorAll('.wizard-step-btn').forEach((btn) => {
      const s = Number(btn.dataset.step);
      btn.classList.toggle('active', s === step);
      btn.classList.toggle('done', s < step);
    });
  }

  const mobile = isMobileUi();
  if (dom.hangarPrevBtn) {
    dom.hangarPrevBtn.classList.toggle('hidden', !mobile || step <= 1);
  }
  if (dom.hangarNextBtn) {
    dom.hangarNextBtn.classList.toggle('hidden', !mobile || step >= 4);
  }
  if (dom.startBtn) {
    const hideStart = state.syncMode !== 'pve' || (mobile && step !== 4);
    dom.startBtn.classList.toggle('hidden', hideStart);
  }

  if (dom.mobileSummaryCard) {
    const modeLabel = state.syncMode === 'pve'
      ? `${df ? df.name : 'Normal'} (${df ? df.enemyCount : 3} IA)`
      : state.syncMode === 'pvp_adhoc' ? 'PvP Ad-Hoc' : 'PvP Módem 90s';
    dom.mobileSummaryCard.innerHTML = `
      <div class="summary-title">Tu configuración actual</div>
      <div class="summary-chips">
        <span class="summary-chip"><strong>Tanque:</strong> <span style="color:${tt?.color || '#fff'}">${tt?.name || '—'}</span></span>
        <span class="summary-chip"><strong>Blindaje:</strong> ${ar ? `${ar.name.replace('Blindaje ', '')} (${ar.maxHp} PV • ${ar.moveAp} AP)` : '—'}</span>
        <span class="summary-chip"><strong>Modo:</strong> ${modeLabel}</span>
        <span class="summary-chip"><strong>Mapa:</strong> ${mapInfo.name}</span>
      </div>
    `;
  }
}

export function setHangarStep(step) {
  const clamped = Math.max(1, Math.min(4, Number(step) || 1));
  state.hangarStep = clamped;
  updateWizardChrome();
  const grid = dom.hangarScreen?.querySelector('.hangar-grid');
  if (grid) grid.scrollTop = 0;
  if (dom.hangarScreen) dom.hangarScreen.scrollTop = 0;
}

function formatSpecial1Damage(tu) {
  if (!tu) return '—';
  if (tu.id === 'shotgun') {
    return `${tu.pelletDamage} × ${tu.pellets} (máx. ${tu.pelletDamage * tu.pellets} PV)`;
  }
  if (tu.id === 'bloodsucker') {
    return `${tu.pelletDamage} × ${tu.pellets} (máx. ${tu.pelletDamage * tu.pellets} PV) + ${Math.round(tu.lifesteal * 100)}% robo`;
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
  if (sp2.id === 'rage') {
    return `Req. <25% PV • -${Math.round(sp2.damageReduction * 100)}% daño recibido • +${Math.round(sp2.moveBonusPercent * 100)}% mov. (1t)`;
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
      cd: sp2 && sp2.cooldown === 0 ? 'Sin CD (0t)' : `${sp2 ? sp2.cooldown : 2} turnos`,
      desc: sp2 ? sp2.desc : ''
    }
  ];

  const passiveHtml = tt.passiveName
    ? `<div class="skill-card">
         <div class="skill-card-head">
           <span><span class="skill-key">PAS</span>${tt.passiveName}</span>
         </div>
         <div class="skill-metrics">
           <span class="skill-chip dmg">Pasiva: +1% daño / 1% PV perdido</span>
         </div>
         <div class="skill-desc">${tt.passiveDesc || ''}</div>
       </div>`
    : '';

  dom.tankSkillsSlot.innerHTML = `
    <div class="skills-header">
      <span style="color:${tt.color}">${tt.name}</span>
      <span style="font-size:11px;color:var(--muted);">${tt.passiveName ? 'Pasiva + 3 hab.' : '3 disparos'}</span>
    </div>
    ${passiveHtml}
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
  const { tankTypes, armors, turrets, specials2, difficulties } = state.catalog;

  dom.tankTypeContainer.innerHTML = '';
  Object.values(tankTypes).forEach((tt) => {
    const tu = turrets[tt.turretId];
    const sp2 = specials2?.[tt.special2Id];
    const btn = document.createElement('button');
    btn.className = `option-card tank-option-card ${state.selectedTankType === tt.id ? 'active' : ''}`;
    btn.innerHTML = `
      <div class="tank-card-row">
        <canvas class="tank-mini-canvas" width="42" height="42"></canvas>
        <div class="tank-card-body">
          <div class="option-title">
            <span style="color:${tt.color}">${tt.name}</span>
            <span class="tank-card-badges">
              ${tt.passiveName ? `<span class="mini-badge pas">PAS</span>` : ''}
              <span class="mini-badge sp1">[2] ${tt.specialName} (${tu ? tu.cooldown : 2}t)</span>
              <span class="mini-badge sp2">[3] ${sp2 ? sp2.name : tt.special2Name}</span>
            </span>
          </div>
          <div class="option-desc">${tt.desc}</div>
        </div>
      </div>
    `;
    const miniCanvas = btn.querySelector('.tank-mini-canvas');
    if (miniCanvas) {
      const mCtx = miniCanvas.getContext('2d');
      mCtx.imageSmoothingEnabled = false;
      mCtx.save();
      mCtx.translate(21, 21);
      mCtx.scale(1.05, 1.05);
      drawTankChassis(mCtx, tt.color, tt.accent, 0, state.selectedArmor);
      drawTankTurret(mCtx, tt.turretId, tt.color, tt.accent, -0.35);
      mCtx.restore();
    }
    btn.onclick = () => {
      state.selectedTankType = tt.id;
      renderHangarOptions();
      if (isMobileUi()) {
        setHangarStep(2);
      }
    };
    dom.tankTypeContainer.appendChild(btn);
  });

  dom.armorContainer.innerHTML = '';
  Object.values(armors).forEach((ar) => {
    const btn = document.createElement('button');
    btn.className = `option-card armor-option-card ${state.selectedArmor === ar.id ? 'active' : ''}`;
    const hpPct = Math.round((ar.maxHp / 155) * 100);
    const apPct = Math.round((ar.moveAp / 26) * 100);
    btn.innerHTML = `
      <div class="option-title">
        <span>${ar.name}</span>
        <span style="color:#38bdf8;font-size:12px;">${ar.maxHp} PV • ${ar.moveAp} AP</span>
      </div>
      <div class="armor-bars">
        <div class="armor-bar-row"><span>Resistencia</span><div class="armor-bar-track"><div class="armor-bar-fill hp" style="width:${hpPct}%"></div></div></div>
        <div class="armor-bar-row"><span>Movilidad</span><div class="armor-bar-track"><div class="armor-bar-fill ap" style="width:${apPct}%"></div></div></div>
      </div>
      <div class="option-desc">${ar.desc}</div>
    `;
    btn.onclick = () => {
      state.selectedArmor = ar.id;
      renderHangarOptions();
      if (isMobileUi()) {
        setHangarStep(3);
      }
    };
    dom.armorContainer.appendChild(btn);
  });

  dom.difficultyContainer.innerHTML = '';
  Object.values(difficulties).forEach((df) => {
    const btn = document.createElement('button');
    btn.className = `pill diff-pill ${state.selectedDifficulty === df.id ? 'active' : ''}`;
    const hpTxt = `${Math.round(df.hpScale * 100)}% PV`;
    const apTxt = `${Math.round(df.apScale * 100)}% AP`;
    btn.innerHTML = `
      <span class="diff-name">${df.name} (${df.enemyCount} IA)</span>
      <span class="diff-meta">${hpTxt} • ${apTxt}</span>
    `;
    btn.onclick = () => {
      state.selectedDifficulty = df.id;
      renderHangarOptions();
      if (isMobileUi() && state.syncMode === 'pve') {
        setHangarStep(4);
      }
    };
    dom.difficultyContainer.appendChild(btn);
  });

  renderTankSkillsSlot();
  renderTankPreview();
  updateWizardChrome();
}

export function resetBattleVisualState() {
  state.rubbleSet.clear();
  state.activeTraces = [];
  state.particles = [];
  state.floatingTexts = [];
  state.weaponMode = 'normal';
  state.clickMode = 'shoot';
  dom.gameoverOverlay.classList.add('hidden');
}

export function initHangarUI(sendWs) {
  dom.mapOptions.querySelectorAll('.pill').forEach((btn) => {
    btn.onclick = () => {
      dom.mapOptions.querySelectorAll('.pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      state.selectedMap = btn.dataset.map;
      updateWizardChrome();
    };
  });

  if (dom.mobileWizardSteps) {
    dom.mobileWizardSteps.querySelectorAll('.wizard-step-btn').forEach((btn) => {
      btn.onclick = () => {
        setHangarStep(Number(btn.dataset.step));
      };
    });
  }
  if (dom.hangarPrevBtn) {
    dom.hangarPrevBtn.onclick = () => setHangarStep(state.hangarStep - 1);
  }
  if (dom.hangarNextBtn) {
    dom.hangarNextBtn.onclick = () => setHangarStep(state.hangarStep + 1);
  }
  setHangarStep(state.hangarStep || 1);

  const startMatch = () => {
    resetBattleVisualState();
    state.gameMode = 'pve';
    state.isPvp = false;
    state.myTeam = 'player';
    sendWs({
      type: 'start_game',
      tankTypeId: state.selectedTankType,
      armorId: state.selectedArmor,
      difficulty: state.selectedDifficulty,
      mapStyle: state.selectedMap
    });
  };

  const handleRematch = () => {
    resetBattleVisualState();
    if (state.gameMode === 'pvp_adhoc') {
      sendWs({
        type: 'pvp_rematch',
        tankTypeId: state.selectedTankType,
        armorId: state.selectedArmor,
        mapStyle: state.selectedMap
      });
      return;
    }
    if (state.gameMode === 'pvp_legacy') {
      requestLegacyRematch();
      return;
    }
    startMatch();
  };

  dom.startBtn.onclick = startMatch;
  dom.rematchBtn.onclick = handleRematch;
  dom.backHangarBtn.onclick = () => {
    resetMultiplayerOnHangarReturn();
    state.mobileInfoOpen = false;
    dom.battleScreen?.classList.remove('sidebar-open');
    dom.battleScreen.classList.add('hidden');
    dom.hangarScreen.classList.remove('hidden');
    setHangarStep(1);
  };
  dom.overlayHangarBtn.onclick = () => {
    resetMultiplayerOnHangarReturn();
    state.mobileInfoOpen = false;
    dom.battleScreen?.classList.remove('sidebar-open');
    dom.gameoverOverlay.classList.add('hidden');
    dom.battleScreen.classList.add('hidden');
    dom.hangarScreen.classList.remove('hidden');
    setHangarStep(1);
  };
}
