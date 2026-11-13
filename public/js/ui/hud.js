import { CELL_PX } from '../constants.js';
import { state, canvas, dom, showToast } from '../state.js';

export function getActiveControlInfo() {
  const player = state.tanks.find((t) => t.id === 'player');
  const drone = state.deployables.find((d) => d.kind === 'drone' && d.ownerId === 'player' && d.hp > 0);
  const usingDrone = Boolean(drone) && state.activeControl === 'drone';
  return {
    player,
    drone,
    usingDrone,
    unit: usingDrone ? drone : player,
    size: usingDrone ? drone.size : state.tankSize
  };
}

export function updateHUD() {
  const player = state.tanks.find((t) => t.id === 'player');
  dom.turnIndicator.textContent = `TURNO ${state.turnNumber}`;

  if (state.phase === 'player') {
    dom.phaseIndicator.textContent = 'TU TURNO';
    dom.phaseIndicator.className = 'phase-pill player';
  } else if (state.phase === 'ai') {
    dom.phaseIndicator.textContent = 'TURNO IA...';
    dom.phaseIndicator.className = 'phase-pill ai';
  } else {
    dom.phaseIndicator.textContent = state.winner === 'player' ? 'VICTORIA' : 'DERROTA';
    dom.phaseIndicator.className = `phase-pill ${state.winner === 'player' ? 'player' : 'ai'}`;
  }

  if (player) {
    const drone = state.deployables.find((d) => d.kind === 'drone' && d.ownerId === 'player' && d.hp > 0);
    const usingDrone = Boolean(drone) && state.activeControl === 'drone';
    if (!drone && state.activeControl === 'drone') {
      state.activeControl = 'player';
    }

    if (dom.toggleControlBtn) {
      if (drone) {
        dom.toggleControlBtn.classList.remove('hidden');
        dom.toggleControlBtn.classList.toggle('drone-active', usingDrone);
        dom.toggleControlBtn.textContent = usingDrone
          ? `[TAB] Dron (${drone.hp} PV)`
          : '[TAB] Tanque → Dron';
        dom.toggleControlBtn.disabled = state.phase !== 'player';
      } else {
        dom.toggleControlBtn.classList.add('hidden');
        dom.toggleControlBtn.classList.remove('drone-active');
      }
    }

    const activeUnit = usingDrone ? drone : player;
    const pct = Math.max(0, (player.hp / player.maxHp) * 100);
    dom.playerHpBar.style.width = `${pct}%`;
    dom.playerHpText.textContent = `${player.hp} / ${player.maxHp}`;
    dom.playerApText.textContent = usingDrone
      ? `${drone.moveAp} / ${drone.maxMoveAp} (Dron)`
      : `${player.moveAp} / ${player.maxMoveAp}`;

    const inTrapBurst = !usingDrone && (player.trapBurstRemaining || 0) > 0;
    if (inTrapBurst) {
      state.weaponMode = 'special2';
    }

    const isSilenced = (player.silencedTurns || 0) > 0;
    const turret = state.catalog?.turrets[player.turretId];
    if (usingDrone) {
      dom.weaponNormalBtn.textContent = '[1] Dron (20 PV)';
      dom.weaponSpecialBtn.textContent = '[2] — (Dron)';
      dom.weaponSpecialBtn.disabled = true;
      if (state.weaponMode === 'special') state.weaponMode = 'normal';
    } else {
      dom.weaponNormalBtn.textContent = player.basicWeapon === 'short_shotgun'
        ? '[1] Escopeta Corta'
        : '[1] Estándar';
      if (isSilenced) {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'} (PEM ${player.silencedTurns}t)`;
        dom.weaponSpecialBtn.disabled = true;
        if (state.weaponMode === 'special') state.weaponMode = 'normal';
      } else if (player.specialCooldown > 0) {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'} (${player.specialCooldown}t)`;
        dom.weaponSpecialBtn.disabled = true;
        if (state.weaponMode === 'special') state.weaponMode = 'normal';
      } else {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'}`;
        dom.weaponSpecialBtn.disabled = !player.canShoot || state.phase !== 'player' || inTrapBurst;
      }
    }

    const sp2 = state.catalog?.specials2?.[player.special2Id];
    const sp2Cd = usingDrone ? (drone.droneSpecial2Cooldown || 0) : player.special2Cooldown;
    if (inTrapBurst) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Trampa'} (2ª carga)`;
      dom.weaponSpecial2Btn.disabled = !player.canShoot || state.phase !== 'player';
    } else if (!usingDrone && player.chargedReady) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Cargado'} (¡LISTO!)`;
      dom.weaponSpecial2Btn.disabled = !player.canShoot || state.phase !== 'player';
    } else if (isSilenced) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Especial 2'} (PEM ${player.silencedTurns}t)`;
      dom.weaponSpecial2Btn.disabled = true;
      if (state.weaponMode === 'special2') state.weaponMode = 'normal';
    } else if (sp2Cd > 0) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Especial 2'} (${sp2Cd}t)`;
      dom.weaponSpecial2Btn.disabled = true;
      if (state.weaponMode === 'special2') state.weaponMode = 'normal';
    } else {
      const sp2Label = sp2?.id === 'charged_shot' ? 'Cargar Tiro' : (sp2 ? sp2.name : 'Especial 2');
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2Label}`;
      dom.weaponSpecial2Btn.disabled = !activeUnit.canShoot || state.phase !== 'player';
    }

    dom.weaponNormalBtn.disabled = !activeUnit.canShoot || state.phase !== 'player' || inTrapBurst;
    dom.endTurnBtn.disabled = state.phase !== 'player';
  }

  dom.modeShootBtn.classList.toggle('active', state.clickMode === 'shoot');
  dom.modeMoveBtn.classList.toggle('active', state.clickMode === 'move');
  dom.weaponNormalBtn.classList.toggle('active', state.weaponMode === 'normal');
  dom.weaponSpecialBtn.classList.toggle('active', state.weaponMode === 'special');
  dom.weaponSpecial2Btn.classList.toggle('active', state.weaponMode === 'special2');

  dom.enemyListEl.innerHTML = '';
  state.tanks
    .filter((t) => t.team === 'ai')
    .forEach((en) => {
      const turretName = state.catalog?.turrets[en.turretId]?.name || en.turretId;
      const armorLabel = en.armorName || '';
      const div = document.createElement('div');
      div.className = `enemy-card ${en.alive ? '' : 'dead'}`;
      const pct = Math.max(0, (en.hp / en.maxHp) * 100);
      div.innerHTML = `
        <div class="enemy-top">
          <span style="color:${en.color}">${en.name}</span>
          <span>${en.alive ? `${en.hp} PV` : 'Destruido'}</span>
        </div>
        <div style="font-size:11px;color:#93a4bf;margin-bottom:4px;">${turretName}${armorLabel ? ` • ${armorLabel}` : ''}</div>
        <div class="enemy-hp-bg">
          <div class="enemy-hp-fill" style="width:${pct}%"></div>
        </div>
      `;
      dom.enemyListEl.appendChild(div);
    });

  dom.combatLogEl.innerHTML = '';
  state.logs.forEach((line) => {
    const li = document.createElement('li');
    li.textContent = line;
    dom.combatLogEl.appendChild(li);
  });

  if (state.phase === 'gameover') {
    dom.gameoverOverlay.classList.remove('hidden');
    if (state.winner === 'player') {
      dom.gameoverTitle.textContent = '¡VICTORIA TÁCTICA!';
      dom.gameoverTitle.style.color = '#4ade80';
      dom.gameoverDesc.textContent = `Has derrotado a toda la fuerza enemiga en ${state.turnNumber} turnos.`;
    } else {
      dom.gameoverTitle.textContent = 'DERROTA';
      dom.gameoverTitle.style.color = '#f87171';
      dom.gameoverDesc.textContent = `Tu unidad fue destruida en el turno ${state.turnNumber}. ¡Prueba otra táctica!`;
    }
  }
}

function getCanvasGridCoords(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: ((clientX - rect.left) * scaleX) / CELL_PX,
    y: ((clientY - rect.top) * scaleY) / CELL_PX
  };
}

export function selectWeapon(mode) {
  const { player, drone, usingDrone } = getActiveControlInfo();
  if (!player) return;
  if (!usingDrone && (player.trapBurstRemaining || 0) > 0 && mode !== 'special2') {
    showToast('Debes lanzar la 2ª Trampa Invisible antes de cambiar de disparo.');
    return;
  }
  if (mode === 'normal') {
    state.weaponMode = 'normal';
    updateHUD();
    return;
  }
  if ((player.silencedTurns || 0) > 0) {
    showToast('⚡ ¡Supresión PEM activa! No puedes usar habilidades especiales.');
    return;
  }
  if (mode === 'special') {
    if (usingDrone) {
      showToast('El Dron usa [1] Disparo Dron o [3] Bomba PEM.');
      return;
    }
    if (player.specialCooldown === 0) {
      state.weaponMode = 'special';
      updateHUD();
    }
    return;
  }
  if (mode === 'special2') {
    const sp2Ready = usingDrone
      ? (drone.droneSpecial2Cooldown || 0) === 0
      : (player.special2Cooldown === 0 || player.chargedReady);
    if (sp2Ready) {
      state.weaponMode = 'special2';
      updateHUD();
    }
  }
}

export function initBattleControls(sendWs) {
  canvas.addEventListener('mousemove', (e) => {
    const pos = getCanvasGridCoords(e.clientX, e.clientY);
    state.mouseGrid = pos;
    const { player, usingDrone, unit, size } = getActiveControlInfo();
    if (player && player.alive && unit && state.phase === 'player') {
      const vt = usingDrone ? null : state.visualTanks.get(player.id);
      const ox = (vt ? vt.x : unit.x) + size / 2;
      const oy = (vt ? vt.y : unit.y) + size / 2;
      const angle = Math.atan2(pos.y - oy, pos.x - ox);
      unit.aimAngle = angle;
      if (vt) vt.aimAngle = angle;
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (state.phase !== 'player') return;
    const pos = getCanvasGridCoords(e.clientX, e.clientY);
    sendWs({ type: 'move_to', x: pos.x, y: pos.y });
  });

  canvas.addEventListener('click', (e) => {
    if (state.phase !== 'player') return;
    const pos = getCanvasGridCoords(e.clientX, e.clientY);
    if (state.clickMode === 'move') {
      sendWs({ type: 'move_to', x: pos.x, y: pos.y });
      return;
    }
    const { player, unit, size } = getActiveControlInfo();
    if (!player || !player.alive || !unit) return;
    const ox = unit.x + size / 2;
    const oy = unit.y + size / 2;
    const angle = Math.atan2(pos.y - oy, pos.x - ox);
    sendWs({
      type: 'shoot',
      mode: state.weaponMode,
      angle,
      targetX: pos.x,
      targetY: pos.y
    });
  });

  if (dom.toggleControlBtn) {
    dom.toggleControlBtn.onclick = () => {
      if (state.phase === 'player') sendWs({ type: 'switch_control' });
    };
  }
  dom.modeShootBtn.onclick = () => {
    state.clickMode = 'shoot';
    updateHUD();
  };
  dom.modeMoveBtn.onclick = () => {
    state.clickMode = 'move';
    updateHUD();
  };
  dom.weaponNormalBtn.onclick = () => selectWeapon('normal');
  dom.weaponSpecialBtn.onclick = () => selectWeapon('special');
  dom.weaponSpecial2Btn.onclick = () => selectWeapon('special2');
  dom.endTurnBtn.onclick = () => {
    if (state.phase === 'player') sendWs({ type: 'end_turn' });
  };

  window.addEventListener('keydown', (e) => {
    if (state.phase !== 'player') return;
    const key = e.key.toLowerCase();

    if (e.key === 'Tab') {
      const { drone } = getActiveControlInfo();
      if (drone) {
        e.preventDefault();
        sendWs({ type: 'switch_control' });
      }
      return;
    }
    if (key === ' ') {
      e.preventDefault();
      sendWs({ type: 'end_turn' });
      return;
    }
    if (key === '1') {
      selectWeapon('normal');
      return;
    }
    if (key === '2') {
      selectWeapon('special');
      return;
    }
    if (key === '3') {
      selectWeapon('special2');
      return;
    }
    if (key === 'm') {
      state.clickMode = 'move';
      updateHUD();
      return;
    }
    if (key === 'f') {
      state.clickMode = 'shoot';
      updateHUD();
      return;
    }

    const now = performance.now();
    if (now - state.lastKeyMoveAt < 75) return;

    let dx = 0;
    let dy = 0;
    if (key === 'w' || e.key === 'ArrowUp') dy = -1;
    else if (key === 's' || e.key === 'ArrowDown') dy = 1;
    else if (key === 'a' || e.key === 'ArrowLeft') dx = -1;
    else if (key === 'd' || e.key === 'ArrowRight') dx = 1;

    if (dx !== 0 || dy !== 0) {
      e.preventDefault();
      state.lastKeyMoveAt = now;
      sendWs({ type: 'move_step', dx, dy });
    }
  });
}
