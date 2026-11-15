import { CELL_PX } from '../constants.js';
import { state, getMyTeamId, isMyTurn, canvas, dom, showToast, saveSettings } from '../state.js';

let battleSendWs = null;

export function getActiveControlInfo() {
  const myId = getMyTeamId();
  const player = state.tanks.find((t) => t.id === myId);
  const drone = state.deployables.find((d) => d.kind === 'drone' && d.ownerId === myId && d.hp > 0);
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
  const myId = getMyTeamId();
  const myTurn = isMyTurn();
  const player = state.tanks.find((t) => t.id === myId);
  dom.turnIndicator.textContent = `TURNO ${state.turnNumber}`;

  if (state.phase === 'gameover') {
    const iWon = state.winner === myId;
    const isDraw = state.winner === 'draw';
    dom.phaseIndicator.textContent = isDraw ? 'EMPATE' : iWon ? 'VICTORIA' : 'DERROTA';
    dom.phaseIndicator.className = `phase-pill ${iWon ? 'player' : 'ai'}`;
  } else if (myTurn) {
    dom.phaseIndicator.textContent = state.isPvp
      ? `TU TURNO (${myId === 'player1' ? 'J1' : 'J2'})`
      : 'TU TURNO';
    dom.phaseIndicator.className = 'phase-pill player';
  } else if (state.isPvp) {
    dom.phaseIndicator.textContent = `TURNO RIVAL (${state.activeTeam === 'player1' ? 'J1' : 'J2'})...`;
    dom.phaseIndicator.className = 'phase-pill ai';
  } else {
    dom.phaseIndicator.textContent = 'TURNO IA...';
    dom.phaseIndicator.className = 'phase-pill ai';
  }

  if (player) {
    const drone = state.deployables.find((d) => d.kind === 'drone' && d.ownerId === myId && d.hp > 0);
    const usingDrone = Boolean(drone) && state.activeControl === 'drone';
    if (!drone && state.activeControl === 'drone') {
      state.activeControl = myId;
    }

    if (dom.toggleControlBtn) {
      if (drone) {
        dom.toggleControlBtn.classList.remove('hidden');
        dom.toggleControlBtn.classList.toggle('drone-active', usingDrone);
        dom.toggleControlBtn.textContent = usingDrone
          ? `[TAB] Dron (${drone.hp} PV)`
          : '[TAB] Tanque → Dron';
        dom.toggleControlBtn.disabled = !myTurn;
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
    const berserkPct = player.passive === 'berserk' && player.maxHp > 0
      ? Math.max(0, Math.round(((player.maxHp - player.hp) / player.maxHp) * 100))
      : 0;
    const berserkSuffix = berserkPct > 0 ? ` (+${berserkPct}%)` : '';
    const turret = state.catalog?.turrets[player.turretId];
    if (usingDrone) {
      dom.weaponNormalBtn.textContent = '[1] Dron (20 PV)';
      dom.weaponSpecialBtn.textContent = '[2] — (Dron)';
      dom.weaponSpecialBtn.disabled = true;
      if (state.weaponMode === 'special') state.weaponMode = 'normal';
    } else {
      dom.weaponNormalBtn.textContent = player.basicWeapon === 'short_shotgun'
        ? `[1] Escopeta Corta${berserkSuffix}`
        : `[1] Estándar${berserkSuffix}`;
      if (isSilenced) {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'} (PEM ${player.silencedTurns}t)`;
        dom.weaponSpecialBtn.disabled = true;
        if (state.weaponMode === 'special') state.weaponMode = 'normal';
      } else if (player.specialCooldown > 0) {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'} (${player.specialCooldown}t)`;
        dom.weaponSpecialBtn.disabled = true;
        if (state.weaponMode === 'special') state.weaponMode = 'normal';
      } else {
        dom.weaponSpecialBtn.textContent = `[2] ${turret ? turret.name : 'Especial 1'}${berserkSuffix}`;
        dom.weaponSpecialBtn.disabled = !player.canShoot || !myTurn || inTrapBurst;
      }
    }

    const sp2 = state.catalog?.specials2?.[player.special2Id];
    const sp2Cd = usingDrone ? (drone.droneSpecial2Cooldown || 0) : player.special2Cooldown;
    if (inTrapBurst) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Trampa'} (2ª carga)`;
      dom.weaponSpecial2Btn.disabled = !player.canShoot || !myTurn;
    } else if (!usingDrone && sp2?.id === 'rage') {
      const belowMaxHp = player.hp < player.maxHp * (sp2.maxHpPercent ?? 0.25);
      if (player.rageActive) {
        dom.weaponSpecial2Btn.textContent = `[3] ${sp2.name} (ACTIVA)`;
        dom.weaponSpecial2Btn.disabled = true;
      } else if (isSilenced) {
        dom.weaponSpecial2Btn.textContent = `[3] ${sp2.name} (PEM ${player.silencedTurns}t)`;
        dom.weaponSpecial2Btn.disabled = true;
      } else if (!belowMaxHp) {
        dom.weaponSpecial2Btn.textContent = `[3] ${sp2.name} (Req <25% PV)`;
        dom.weaponSpecial2Btn.disabled = true;
      } else {
        dom.weaponSpecial2Btn.textContent = `[3] ${sp2.name}`;
        dom.weaponSpecial2Btn.disabled = !myTurn;
      }
      if (state.weaponMode === 'special2') state.weaponMode = 'normal';
    } else if (!usingDrone && player.chargedReady) {
      dom.weaponSpecial2Btn.textContent = `[3] ${sp2 ? sp2.name : 'Cargado'} (¡LISTO!)`;
      dom.weaponSpecial2Btn.disabled = !player.canShoot || !myTurn;
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
      dom.weaponSpecial2Btn.disabled = !activeUnit.canShoot || !myTurn;
    }

    dom.weaponNormalBtn.disabled = !activeUnit.canShoot || !myTurn || inTrapBurst;
    dom.endTurnBtn.disabled = !myTurn;
  }

  if (dom.battleScreen) {
    dom.battleScreen.dataset.clickMode = state.clickMode;
    dom.battleScreen.classList.toggle('sidebar-open', Boolean(state.mobileInfoOpen));
  }

  const syncMobileBtn = (src, dst, isActive) => {
    if (!src || !dst) return;
    let label = src.textContent;
    const statusMatch = label.match(/^(\[\d\])\s+(.+?)\s+(\([^)]+\))$/);
    if (statusMatch) {
      label = `${statusMatch[1]} ${statusMatch[3]} ${statusMatch[2]}`;
    }
    dst.textContent = label;
    dst.title = src.textContent;
    dst.disabled = src.disabled;
    dst.classList.toggle('active', isActive);
  };
  syncMobileBtn(dom.weaponNormalBtn, dom.mWeaponNormalBtn, state.weaponMode === 'normal');
  syncMobileBtn(dom.weaponSpecialBtn, dom.mWeaponSpecialBtn, state.weaponMode === 'special');
  syncMobileBtn(dom.weaponSpecial2Btn, dom.mWeaponSpecial2Btn, state.weaponMode === 'special2');

  const { unit: ctrlUnit } = getActiveControlInfo();
  const fireBtn = dom.mobileFireBtn || document.getElementById('mobile-fire-btn');
  if (fireBtn) {
    const canFireNow = Boolean(myTurn && player && player.alive && ctrlUnit && (ctrlUnit.canShoot || (player.trapBurstRemaining || 0) > 0));
    fireBtn.disabled = !canFireNow;
  }

  const canMoveNow = Boolean(myTurn && player && player.alive && ctrlUnit && ctrlUnit.moveAp > 0);
  if (dom.joyMove) {
    dom.joyMove.classList.toggle('disabled', !canMoveNow);
  }
  if (dom.mobileDpad) {
    dom.mobileDpad.classList.toggle('disabled', !canMoveNow);
  }
  if (dom.joyAim) {
    const canAimNow = Boolean(myTurn && player && player.alive && ctrlUnit);
    dom.joyAim.classList.toggle('disabled', !canAimNow);
  }

  dom.modeShootBtn.classList.toggle('active', state.clickMode === 'shoot');
  dom.modeMoveBtn.classList.toggle('active', state.clickMode === 'move');
  dom.weaponNormalBtn.classList.toggle('active', state.weaponMode === 'normal');
  dom.weaponSpecialBtn.classList.toggle('active', state.weaponMode === 'special');
  dom.weaponSpecial2Btn.classList.toggle('active', state.weaponMode === 'special2');

  dom.enemyListEl.innerHTML = '';
  state.tanks
    .filter((t) => t.team !== myId)
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
    if (state.winner === 'draw') {
      dom.gameoverTitle.textContent = 'EMPATE';
      dom.gameoverTitle.style.color = '#fbbf24';
      dom.gameoverDesc.textContent = `Ambos tanques fueron destruidos simultáneamente en el turno ${state.turnNumber}.`;
    } else if (state.winner === myId) {
      dom.gameoverTitle.textContent = '¡VICTORIA TÁCTICA!';
      dom.gameoverTitle.style.color = '#4ade80';
      dom.gameoverDesc.textContent = state.isPvp
        ? `Has ganado el duelo PvP en ${state.turnNumber} turnos.`
        : `Has derrotado a toda la fuerza enemiga en ${state.turnNumber} turnos.`;
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
    const sp2 = state.catalog?.specials2?.[player.special2Id];
    if (!usingDrone && sp2?.id === 'rage') {
      if (player.rageActive) {
        showToast('¡Ira ya está activa en este turno!');
        return;
      }
      if (!(player.hp < player.maxHp * (sp2.maxHpPercent ?? 0.25))) {
        showToast('Solo puedes activar Ira cuando tu vida baja del 25%.');
        return;
      }
      if (battleSendWs && isMyTurn()) {
        battleSendWs({
          type: 'shoot',
          mode: 'special2',
          angle: player.aimAngle || 0,
          targetX: player.x,
          targetY: player.y
        });
      }
      return;
    }
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
  battleSendWs = sendWs;

  const aimAtClientPos = (clientX, clientY) => {
    const pos = getCanvasGridCoords(clientX, clientY);
    state.mouseGrid = pos;
    const { player, usingDrone, unit, size } = getActiveControlInfo();
    if (player && player.alive && unit && isMyTurn()) {
      const vt = usingDrone ? null : state.visualTanks.get(player.id);
      const ox = (vt ? vt.x : unit.x) + size / 2;
      const oy = (vt ? vt.y : unit.y) + size / 2;
      const angle = Math.atan2(pos.y - oy, pos.x - ox);
      unit.aimAngle = angle;
      if (vt) vt.aimAngle = angle;
    }
    return pos;
  };

  const fireAtCurrentAim = () => {
    if (!isMyTurn()) return;
    const { player, unit, size } = getActiveControlInfo();
    if (!player || !player.alive || !unit) return;
    const ox = unit.x + size / 2;
    const oy = unit.y + size / 2;
    const pos = state.mouseGrid || { x: ox + Math.cos(unit.aimAngle || 0) * 10, y: oy + Math.sin(unit.aimAngle || 0) * 10 };
    const angle = Math.atan2(pos.y - oy, pos.x - ox);
    sendWs({
      type: 'shoot',
      mode: state.weaponMode,
      angle,
      targetX: pos.x,
      targetY: pos.y
    });
  };

  let touchStart = null;
  let suppressNextClick = false;

  canvas.addEventListener('pointerdown', (e) => {
    aimAtClientPos(e.clientX, e.clientY);
    if (e.pointerType === 'touch') {
      touchStart = { x: e.clientX, y: e.clientY };
      suppressNextClick = false;
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' && touchStart) {
      if (Math.hypot(e.clientX - touchStart.x, e.clientY - touchStart.y) > 10) {
        suppressNextClick = true;
      }
      aimAtClientPos(e.clientX, e.clientY);
      return;
    }
    aimAtClientPos(e.clientX, e.clientY);
  });

  canvas.addEventListener('pointerup', () => {
    touchStart = null;
  });

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!isMyTurn()) return;
    const pos = getCanvasGridCoords(e.clientX, e.clientY);
    sendWs({ type: 'move_to', x: pos.x, y: pos.y });
  });

  canvas.addEventListener('click', (e) => {
    if (!isMyTurn()) return;
    if (suppressNextClick) {
      suppressNextClick = false;
      return;
    }
    const pos = aimAtClientPos(e.clientX, e.clientY);
    if (state.clickMode === 'move') {
      sendWs({ type: 'move_to', x: pos.x, y: pos.y });
      return;
    }
    fireAtCurrentAim();
  });

  const getActiveWeaponAimRange = (player, usingDrone) => {
    if (state.weaponMode === 'normal') {
      if (!usingDrone && player.basicWeapon === 'short_shotgun') return { min: 6, max: 22 };
      return { min: 14, max: 38 };
    }
    if (state.weaponMode === 'special' && !usingDrone) {
      const tu = state.catalog?.turrets?.[player.turretId];
      if (tu && typeof tu.range === 'number') {
        return { min: 5, max: tu.range };
      }
      return { min: 14, max: 40 };
    }
    if (state.weaponMode === 'special2') {
      const sp2 = state.catalog?.specials2?.[player.special2Id];
      if (sp2 && typeof sp2.range === 'number') {
        return { min: 5, max: sp2.range };
      }
      return { min: 14, max: 40 };
    }
    return { min: 14, max: 36 };
  };

  const getSens = () => Math.max(0.5, Math.min(2.0, Number(state.settings?.sensitivity) || 1.0));

  const bindVirtualJoystick = (el, { getDeadzone, onUpdate, onEnd }) => {
    if (!el) return;
    const thumb = el.querySelector('.joystick-thumb');
    let activePointerId = null;

    const resetThumb = () => {
      if (thumb) thumb.style.transform = 'translate(0px, 0px)';
      el.classList.remove('active');
    };

    const handleMove = (clientX, clientY) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const maxR = Math.max(24, rect.width * 0.36);
      const rawDx = clientX - cx;
      const rawDy = clientY - cy;
      const rawDist = Math.hypot(rawDx, rawDy);
      const clampedDist = Math.min(maxR, rawDist);
      const scale = rawDist > 0 ? clampedDist / rawDist : 0;
      const dx = rawDx * scale;
      const dy = rawDy * scale;

      if (thumb) {
        thumb.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
      }
      const nx = dx / maxR;
      const ny = dy / maxR;
      const mag = Math.min(1, Math.hypot(nx, ny));
      const dz = getDeadzone ? getDeadzone() : 0.2;
      onUpdate({ nx, ny, mag, deadzone: dz, active: mag >= dz });
    };

    el.addEventListener('pointerdown', (e) => {
      if (activePointerId !== null) return;
      e.preventDefault();
      e.stopPropagation();
      activePointerId = e.pointerId;
      try {
        el.setPointerCapture(e.pointerId);
      } catch (_) {}
      el.classList.add('active');
      handleMove(e.clientX, e.clientY);
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      handleMove(e.clientX, e.clientY);
    });

    const endHandler = (e) => {
      if (e.pointerId !== activePointerId) return;
      e.preventDefault();
      activePointerId = null;
      resetThumb();
      if (onEnd) onEnd();
    };

    el.addEventListener('pointerup', endHandler);
    el.addEventListener('pointercancel', endHandler);
  };

  // Joystick Izquierdo: Movimiento continuo (incluye diagonales alternando X/Y)
  if (dom.joyMove) {
    let curNx = 0;
    let curNy = 0;
    let curMag = 0;
    let curActive = false;
    let moveTimer = null;
    let lastStepAt = 0;
    let accX = 0;
    let accY = 0;

    const clearMoveLoop = () => {
      if (moveTimer) {
        clearTimeout(moveTimer);
        moveTimer = null;
      }
    };

    const stepOnce = () => {
      if (!curActive || !isMyTurn()) return;
      const { unit } = getActiveControlInfo();
      if (!unit || unit.moveAp <= 0) return;

      const ax = Math.abs(curNx);
      const ay = Math.abs(curNy);
      const dzAxis = Math.max(0.10, Math.min(0.32, 0.22 / getSens()));
      if (ax < dzAxis && ay < dzAxis) return;

      let sdx = 0;
      let sdy = 0;
      if (ax >= 0.34 && ay >= 0.34) {
        accX += ax;
        accY += ay;
        if (accX >= accY) {
          sdx = Math.sign(curNx);
          accX = Math.max(0, accX - 1);
        } else {
          sdy = Math.sign(curNy);
          accY = Math.max(0, accY - 1);
        }
      } else if (ax >= ay) {
        sdx = Math.sign(curNx);
      } else {
        sdy = Math.sign(curNy);
      }

      if (sdx !== 0 || sdy !== 0) {
        lastStepAt = performance.now();
        sendWs({ type: 'move_step', dx: sdx, dy: sdy });
      }
    };

    const scheduleLoop = () => {
      clearMoveLoop();
      if (!curActive) return;
      const sens = getSens();
      const effectiveMag = Math.min(1, curMag * sens);
      const intervalMs = Math.max(48, Math.min(220, Math.round((150 - effectiveMag * 70) / Math.pow(sens, 0.55))));
      moveTimer = setTimeout(() => {
        stepOnce();
        scheduleLoop();
      }, intervalMs);
    };

    bindVirtualJoystick(dom.joyMove, {
      getDeadzone: () => Math.max(0.10, Math.min(0.32, 0.22 / getSens())),
      onUpdate: ({ nx, ny, mag, active }) => {
        const wasActive = curActive;
        curNx = nx;
        curNy = ny;
        curMag = mag;
        curActive = active;
        if (!active) {
          clearMoveLoop();
          accX = 0;
          accY = 0;
          return;
        }
        if (!wasActive) {
          if (performance.now() - lastStepAt >= 55) {
            stepOnce();
          }
          scheduleLoop();
        }
      },
      onEnd: () => {
        curActive = false;
        curNx = 0;
        curNy = 0;
        curMag = 0;
        accX = 0;
        accY = 0;
        clearMoveLoop();
      }
    });
  }

  // Cruceta Izquierda (D-Pad): Alternativa seleccionable en Ajustes
  if (dom.mobileDpad) {
    let dpadTimer = null;
    let activeBtn = null;

    const stopDpadHold = () => {
      if (dpadTimer) {
        clearTimeout(dpadTimer);
        dpadTimer = null;
      }
      if (activeBtn) {
        activeBtn.classList.remove('active');
        activeBtn = null;
      }
    };

    const sendDpadStep = (dx, dy) => {
      if (!isMyTurn()) return;
      const { unit } = getActiveControlInfo();
      if (!unit || unit.moveAp <= 0) return;
      sendWs({ type: 'move_step', dx, dy });
    };

    dom.mobileDpad.querySelectorAll('.dpad-btn[data-dx]').forEach((btn) => {
      const dx = Number(btn.dataset.dx) || 0;
      const dy = Number(btn.dataset.dy) || 0;

      const scheduleRepeat = () => {
        const intervalMs = Math.max(50, Math.min(230, Math.round(115 / getSens())));
        dpadTimer = setTimeout(() => {
          if (activeBtn !== btn) return;
          sendDpadStep(dx, dy);
          scheduleRepeat();
        }, intervalMs);
      };

      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        stopDpadHold();
        activeBtn = btn;
        btn.classList.add('active');
        try {
          btn.setPointerCapture(e.pointerId);
        } catch (_) {}
        sendDpadStep(dx, dy);
        scheduleRepeat();
      });
      btn.addEventListener('pointerup', stopDpadHold);
      btn.addEventListener('pointercancel', stopDpadHold);
      btn.addEventListener('lostpointercapture', stopDpadHold);
    });
  }

  // Joystick Derecho: Apuntado 360° (mantiene la mira fija al soltar)
  if (dom.joyAim) {
    bindVirtualJoystick(dom.joyAim, {
      getDeadzone: () => Math.max(0.08, Math.min(0.24, 0.15 / getSens())),
      onUpdate: ({ nx, ny, mag, deadzone, active }) => {
        if (!active || !isMyTurn()) return;
        const { player, usingDrone, unit, size } = getActiveControlInfo();
        if (!player || !player.alive || !unit) return;

        if (state.clickMode !== 'shoot') {
          state.clickMode = 'shoot';
          updateHUD();
        }

        const angle = Math.atan2(ny, nx);
        const vt = usingDrone ? null : state.visualTanks.get(player.id);
        const ox = (vt ? vt.x : unit.x) + size / 2;
        const oy = (vt ? vt.y : unit.y) + size / 2;
        const { min, max } = getActiveWeaponAimRange(player, usingDrone);
        const rawT = Math.max(0, (mag - deadzone) / Math.max(0.01, 1 - deadzone));
        const t = Math.max(0, Math.min(1, rawT * Math.sqrt(getSens())));
        const dist = min + t * (max - min);

        unit.aimAngle = angle;
        if (vt) vt.aimAngle = angle;
        state.mouseGrid = {
          x: ox + Math.cos(angle) * dist,
          y: oy + Math.sin(angle) * dist
        };
      }
    });
  }

  const mobileFireBtn = dom.mobileFireBtn || document.getElementById('mobile-fire-btn');
  if (mobileFireBtn) {
    mobileFireBtn.onclick = () => {
      if (!isMyTurn()) return;
      state.clickMode = 'shoot';
      fireAtCurrentAim();
    };
  }

  if (dom.mWeaponNormalBtn) dom.mWeaponNormalBtn.onclick = () => selectWeapon('normal');
  if (dom.mWeaponSpecialBtn) dom.mWeaponSpecialBtn.onclick = () => selectWeapon('special');
  if (dom.mWeaponSpecial2Btn) dom.mWeaponSpecial2Btn.onclick = () => selectWeapon('special2');

  if (dom.mobileInfoBtn) {
    dom.mobileInfoBtn.onclick = () => {
      state.mobileInfoOpen = !state.mobileInfoOpen;
      updateHUD();
    };
  }
  if (dom.mobileSidebarClose) {
    dom.mobileSidebarClose.onclick = () => {
      state.mobileInfoOpen = false;
      updateHUD();
    };
  }

  if (dom.toggleControlBtn) {
    dom.toggleControlBtn.onclick = () => {
      if (isMyTurn()) sendWs({ type: 'switch_control' });
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
    if (isMyTurn()) sendWs({ type: 'end_turn' });
  };

  window.addEventListener('keydown', (e) => {
    if (!isMyTurn()) return;
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

function formatSensitivityLabel(sens) {
  const pct = Math.round(sens * 100);
  if (pct <= 75) return `${pct}% (Suave)`;
  if (pct <= 115) return `${pct}% (Normal)`;
  if (pct <= 160) return `${pct}% (Rápida)`;
  return `${pct}% (Máxima)`;
}

export function initSettingsUI() {
  if (!dom.settingsOverlay) return;

  const syncSettingsModal = () => {
    const { controlType, sensitivity } = state.settings;
    if (dom.settingsControlOptions) {
      dom.settingsControlOptions.querySelectorAll('[data-control-type]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.controlType === controlType);
      });
    }
    const pct = Math.round(sensitivity * 100);
    if (dom.settingsSensitivity) {
      dom.settingsSensitivity.value = String(pct);
    }
    if (dom.settingsSensitivityVal) {
      dom.settingsSensitivityVal.textContent = formatSensitivityLabel(sensitivity);
    }
    if (dom.settingsSensitivityPresets) {
      dom.settingsSensitivityPresets.querySelectorAll('[data-sens]').forEach((btn) => {
        btn.classList.toggle('active', Number(btn.dataset.sens) === pct);
      });
    }
  };

  const openSettings = () => {
    syncSettingsModal();
    dom.settingsOverlay.classList.remove('hidden');
  };

  const closeSettings = () => {
    dom.settingsOverlay.classList.add('hidden');
  };

  if (dom.settingsHangarBtn) dom.settingsHangarBtn.onclick = openSettings;
  if (dom.settingsBattleBtn) dom.settingsBattleBtn.onclick = openSettings;
  if (dom.settingsCloseBtn) dom.settingsCloseBtn.onclick = closeSettings;
  if (dom.settingsDoneBtn) dom.settingsDoneBtn.onclick = closeSettings;

  dom.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === dom.settingsOverlay) closeSettings();
  });

  if (dom.settingsControlOptions) {
    dom.settingsControlOptions.querySelectorAll('[data-control-type]').forEach((btn) => {
      btn.onclick = () => {
        state.settings.controlType = btn.dataset.controlType === 'dpad' ? 'dpad' : 'joystick';
        saveSettings();
        syncSettingsModal();
      };
    });
  }

  if (dom.settingsSensitivity) {
    dom.settingsSensitivity.addEventListener('input', () => {
      const pct = Math.max(50, Math.min(200, Number(dom.settingsSensitivity.value) || 100));
      state.settings.sensitivity = pct / 100;
      saveSettings();
      syncSettingsModal();
    });
  }

  if (dom.settingsSensitivityPresets) {
    dom.settingsSensitivityPresets.querySelectorAll('[data-sens]').forEach((btn) => {
      btn.onclick = () => {
        const pct = Math.max(50, Math.min(200, Number(btn.dataset.sens) || 100));
        state.settings.sensitivity = pct / 100;
        saveSettings();
        syncSettingsModal();
      };
    });
  }

  if (dom.settingsResetBtn) {
    dom.settingsResetBtn.onclick = () => {
      state.settings.controlType = 'joystick';
      state.settings.sensitivity = 1.0;
      saveSettings();
      syncSettingsModal();
    };
  }

  syncSettingsModal();
}
