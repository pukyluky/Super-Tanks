# Tanques Tácticos 2D (PvE y PvP Multijugador por Turnos)

Juego táctico por turnos en navegador / aplicación Windows con servidor autoritativo en **Node.js puro** (sin dependencias externas), renderizado Pixel Art en **HTML5 Canvas** y arquitectura modular dividida en capas tanto en el servidor (`src/`) como en el cliente ES Modules (`public/js/`).

---

## Características principales

- **3 modos de juego:**
  - **PvE vs IA:** Servidor autoritativo en local con 3 niveles de dificultad (`Fácil`, `Normal`, `Difícil`).
  - **PvP Ad-Hoc (Red / Sala):** Un jugador crea una sala y actúa como Host (`IP:Puerto` + código de 4 caracteres), mientras el invitado se conecta directamente por WebSocket (`ws://<host>:<puerto>`) y sincroniza cada turno.
  - **PvP Legacy (Módem Años 90 por Audio):** Sincronización sin red mediante sonidos reales de módem analógico de los años 90 (tono de marcado, marcación DTMF, portadora CED a `2100 Hz` y ráfagas V.32bis/V.90) junto a un módem acústico BFSK real (`1200 Hz` / `2200 Hz`, trama UART + CRC-16 + demodulador Goertzel) que puede usarse por altavoz + micrófono entre dos dispositivos cercanos o en el mismo PC con audio audible.
- **9 Tanques con habilidad especial `[2]` y habilidad táctica `[3]`:**
  - **Artillero** (`Mortero Táctico` + `Cóctel Molotov`)
  - **Escopetero** (`Cañón Metralla` + `Mina Terrestre`)
  - **Rebotador** (`Cañón Rebotador` + `Tiro Cargado`)
  - **Cazacarros** (`Rifle Perforante` + `Trampa Invisible`)
  - **Ingeniero** (`Constructor de Muro` + `Torreta Autónoma`)
  - **Químico** (`Tiro Tóxico` + `Tiro Congelador`)
  - **Caín** (`Tiro de Fuego` + `Muro de Fuego`)
  - **NetRunner** (`Escopeta Corta` básica + `Dron Táctico` controlable + `Bomba PEM`)
  - **Berserker** (Pasiva `Furia de Sangre` + `Chupasangre` con robo de vida + `Ira`)
- **3 chasis configurables** (`Ligero`, `Medio`, `Pesado`) y **3 niveles de dificultad** (`Fácil`, `Normal`, `Difícil`).
- **Micro-cuadrícula destructible (`120 × 72` celdas de `8 × 8 px`):** Muros de ladrillo con vida gradual, acero indestructible, escombros y recálculo parcial del terreno en canvas.
- **Botón de apagado integrado:** Permite cerrar el servidor local de forma limpia directamente desde el Hangar o durante la batalla (`WS shutdown_server` o `POST /api/shutdown`).

---

## Cómo jugar

1. **Aplicación Windows distribuible (`.exe`):** Ejecuta `dist/TanquesTacticos2D.exe` (incluye `node.exe` y todos los recursos embebidos; no requiere tener Node.js instalado, abre ventana independiente sin consola y cierra el servidor automáticamente al cerrar el juego).
   - Para recompilar el `.exe` tras cambios: ejecuta `powershell -ExecutionPolicy Bypass -File build_exe.ps1`.
2. **Modo desarrollo:** Haz doble clic en `jugar.vbs` o `jugar.bat` para arrancar el código local sin terminal ni barra de navegador (también cierra el servidor automáticamente al cerrar la ventana).
3. **Aplicación Android (`Android/`):** Proyecto Android completo en Java/Gradle con WebView en modo inmersivo horizontal, D-Pad táctil, servidor TCP WebSocket nativo (`AdhocRelayServer.java`) para salas Ad-Hoc por Wi-Fi/Hotspot (compatible con PC y otros móviles), audio/micrófono para Módem años 90 y APK compilado en `Android/dist/TanquesTacticos2D.apk`.
   - Para sincronizar cambios y recompilar el APK: ejecuta `powershell -ExecutionPolicy Bypass -File Android\build_apk.ps1`.

### Controles
- `W A S D` o Flechas: Mover el tanque (o el Dron si está seleccionado) paso a paso.
- `Clic Derecho` (o modo `[M]` + `Clic Izquierdo`): Movimiento automático con ruta A*.
- `Ratón` + `Clic Izquierdo` (en modo `[F]`): Apuntar 360° y disparar.
- `1` / `2` / `3`: Seleccionar arma (`[1]` Disparo Básico, `[2]` Habilidad 1, `[3]` Habilidad 2).
- `Tab`: Alternar el control entre el tanque **NetRunner** y su **Dron Táctico**.
- `Espacio`: Terminar turno y pasar al turno de la IA.

---

## Cómo se dividen los archivos y qué hay en cada uno

El proyecto separa la configuración, los *assets* (datos de juego en `src/data/` y *sprites*/paletas en `public/js/assets/`), la lógica de simulación, la red y la interfaz visual.

### Raíz y empaquetado (`build/` y `dist/`)
| Archivo | Contenido y responsabilidad |
|---|---|
| `dist/TanquesTacticos2D.exe` | Ejecutable único autocontenido para Windows (`/target:winexe`, sin terminal): extrae en `%LocalAppData%\TanquesTacticos2D\app\` su `node.exe` y archivos embebidos, lanza el servidor en un puerto libre dentro de un Win32 Job Object y lo detiene al cerrar la ventana del juego. |
| `build/Launcher.cs` | Código fuente C# del lanzador nativo de Windows (`EnsurePayloadExtracted`, `NativeJob`, `FindChromiumBrowser`, `StopServer`). |
| `build_exe.ps1` | Script PowerShell que genera el icono `build/tanques.ico`, empaqueta `build/payload.zip` y compila `dist/TanquesTacticos2D.exe` con `csc.exe`. |
| `jugar.vbs` | Lanzador silencioso de Windows (`WScript.Shell`): inicia `node server.js` sin ventana de terminal, espera a que `http://127.0.0.1:3000/index.html` responda, localiza un navegador compatible (`msedge.exe`, `chrome.exe`, `brave.exe`, `opera.exe`) y lo abre en ventana independiente (`--app=http://localhost:3000 --new-window --window-size=1320,860`) sin barra de direcciones ni pestañas del buscador. |
| `jugar.bat` | Delega inmediatamente en `wscript.exe //B "%~dp0jugar.vbs"` y finaliza sin dejar consola abierta. |
| `package.json` | Metadatos del proyecto (`"main": "server.js"`, script `"start": "node server.js"`), sin dependencias externas. |
| `server.js` | Punto de entrada del servidor HTTP/WebSocket. Sirve archivos estáticos desde `public/`, expone `POST /api/shutdown`, gestiona `shutdownServer()` (incluyendo cierre automático a los `2.5s` si se desconectan todas las ventanas WebSocket) y delega conexiones WebSocket (`upgrade`) a `attachWebSocketSession`. |
| `README.md` | Documentación técnica de arquitectura, archivos y flujo de ejecución. |

---

### Backend (`src/`)

#### Configuración (`src/config/`)
| Archivo | Contenido y responsabilidad |
|---|---|
| `src/config/constants.js` | Constantes compartidas del servidor: `PORT`, `PUBLIC_DIR`, dimensiones de la arena (`GRID_W = 120`, `GRID_H = 72`), `TANK_SIZE = 4`, códigos de celda (`CELL_EMPTY`, `CELL_STEEL`, `BRICK_MAX_HP`) y `MIME_TYPES` (incluyendo `.js`, `.css`, `.html`). |

#### Assets de datos y catálogos (`src/data/`)
Cada ficha está definida como un objeto independiente exportable y agrupada en su catálogo:
| Archivo | Objetos individuales y catálogo exportado |
|---|---|
| `src/data/armors.js` | `LIGHT_ARMOR`, `MEDIUM_ARMOR`, `HEAVY_ARMOR` → agrupados en `ARMOR_CATALOG`. |
| `src/data/specials1.js` | `MORTAR_ABILITY`, `SHOTGUN_ABILITY`, `RICOCHET_ABILITY`, `PIERCING_ABILITY`, `BUILDER_ABILITY`, `TOXIC_ABILITY`, `FIRE_SHOT_ABILITY`, `DRONE_ABILITY`, `BLOODSUCKER_ABILITY` → agrupados en `TURRET_CATALOG`. |
| `src/data/specials2.js` | `MOLOTOV_ABILITY`, `LANDMINE_ABILITY`, `CHARGED_SHOT_ABILITY`, `TRAP_ABILITY`, `AUTO_TURRET_ABILITY`, `FREEZE_SHOT_ABILITY`, `FIRE_WALL_ABILITY`, `EMP_BOMB_ABILITY`, `RAGE_ABILITY` → agrupados en `SPECIAL2_CATALOG`. |
| `src/data/tanks.js` | `ARTILLERY_TANK`, `BREACHER_TANK`, `PRISMA_TANK`, `HUNTER_TANK`, `ENGINEER_TANK`, `CHEMIST_TANK`, `CAIN_TANK`, `NETRUNNER_TANK`, `BERSERKER_TANK` → agrupados en `TANK_TYPES_CATALOG`, más `DIFFICULTY_CONFIG`. |

#### Motor de simulación (`src/engine/`)
| Archivo | Funciones y responsabilidad |
|---|---|
| `src/engine/mapGenerator.js` | `createSeededRng`, `createEmptyGrid`, `paintRect`, `generateArena` (`bunkers`, `labyrinth`, `open`, `random`). Genera el mapa `120 × 72` de ladrillo y acero; en modo `random` construye desde 0 estructuras aleatorias con garantía de conectividad A*/BFS entre todos los puntos de aparición y soporte de semilla determinista (`mapSeed`) para PvP Legacy. |
| `src/engine/pathfinding.js` | `isFootprintFree`, `buildWalkableGrid`, `findPathAStar`. Valida colisiones de tamaño `size × size` y calcula rutas A*. |
| `src/engine/physics.js` | `intersectRayAABB`, `raycastWallDDA`, `findClosestTankHit`, `findNearestEmptyPoint`, `computeOutgoingDamage`, `applyTankDamage`, `applyRadialWallDamage`, `applyRadialTankDamage`, `buildWallBarricade`, `hasLineOfSightToTank`. Trazado de rayos, escalado pasivo de daño, reducción de daño recibida, impacto contra tanques/desplegables y daño/construcción en ladrillos. |
| `src/engine/hazards.js` | `serializeHazardsForPlayer`, `armTeamTraps`, `isTankTouchingCircle`, `isTankTouchingOrientedRect`, `isTankTouchingHazard`, `processMovementWithHazards`, `tickMolotovZones`, `applySingleDoT`, `applyTurnStartPoison`, `computeTurnMoveAp`. Gestiona charcos (`molotov`, `poison`, `fire_pool`), `fire_wall`, minas, trampas invisibles, DoT y cálculo de AP con ralentizaciones. |
| `src/engine/combat.js` | `resolveShot`. Resuelve cualquier disparo (`normal`, `special`, `special2`), escopeta corta, rebotes, perforación, mortero, muro/torreta/dron desplegable, veneno, congelación, muro de fuego y Bomba PEM. |
| `src/engine/match.js` | `delay`, `createTankEntity`, `createMatch`, `createPvpMatch`, `getGameActiveTeam`, `getControlledTank`, `checkGameOver`, `serializeGrid`, `serializeState`, `runDeployableTurrets`, `beginAITurn`, `runAITurn`, `advancePvpTurn`. Ciclo de partida PvE y PvP, inicialización de equipos, disparo automático de torretas y lógica de IA. |
| `src/engine/turnExecutor.js` | `getOwnedDrone`, `broadcastForRecipients`, `maybeAutoEndTurn`, `executeTurnAction`. Ejecutor compartido de acciones (`move_step`, `move_to`, `shoot`, `switch_control`, `end_turn`) para PvE, PvP Ad-Hoc y PvP Legacy con filtrado de trampas por equipo. |

#### Capa de red (`src/net/`)
| Archivo | Funciones y responsabilidad |
|---|---|
| `src/net/websocket.js` | `encodeWsText`, `decodeWsFrames`. Codificación y decodificación de tramas WebSocket en bruto sobre TCP (`Buffer`). |
| `src/net/adhocRooms.js` | `createAdhocRoom`, `joinAdhocRoom`, `leaveAdhocRoom`, `handleAdhocGameAction`. Registro de salas Ad-Hoc por código (`player1` Host vs `player2` Invitado), retransmisión por visor y revanchas. |
| `src/net/sessionHandler.js` | `attachWebSocketSession`. Handshake WebSocket (`HTTP 101`), envío inicial del `catalog` + `hostInfo`, gestión de sesión PvE / Ad-Hoc / Legacy (`start_legacy_pvp`, `legacy_remote_action`) y delegación en `turnExecutor` / `adhocRooms`. |

---

### Frontend (`public/`)

| Archivo | Contenido y responsabilidad |
|---|---|
| `public/index.html` | Estructura HTML de dos pantallas (`#hangar-screen` y `#battle-screen`), enlaces a `icon.svg` y `manifest.json`, HUD de control, slot de habilidades del tanque seleccionado, overlay de fin de partida y carga de `<script type="module" src="/js/main.js"></script>`. |
| `public/manifest.json` | Manifiesto Web App (`display: "standalone"`) con nombre e icono para ventana de aplicación independiente. |
| `public/icon.svg` | Icono vectorial Pixel Art del juego para barra de tareas y título de la ventana. |
| `public/style.css` | Estilos visuales, tema oscuro, diseño de tarjetas del hangar, HUD inferior, paneles laterales y botones. |
| `public/js/constants.js` | Constantes del cliente: `CELL_PX = 8`, `DEFAULT_GRID_W`, `DEFAULT_GRID_H`, `DEFAULT_TANK_SIZE`. |
| `public/js/state.js` | Estado reactivo compartido (`state`), referencias al canvas principal (`canvas`, `ctx`) y buffer de terreno (`terrainCanvas`, `terrainCtx`), cache de elementos del DOM (`dom`) y `showToast`. |
| `public/js/main.js` | Punto de entrada ES Module del navegador. Inicializa botones de apagado, UI del hangar, controles de batalla, bucle de renderizado y conexión WebSocket. |

#### Assets visuales (`public/js/assets/`)
Cada elemento visual se define como un objeto dedicado y se agrupa por tipo de recurso:
| Archivo | Objetos de asset y helpers exportados |
|---|---|
| `public/js/assets/palettes.js` | `TRACE_COLORS`, `PARTICLE_PALETTES`, `BRICK_PALETTES`, `SPECIAL2_PREVIEW_COLORS`. |
| `public/js/assets/terrainSprites.js` | `EMPTY_TILE_SPRITE`, `STEEL_TILE_SPRITE`, `BRICK_TILE_SPRITE` → `TERRAIN_SPRITES`, más `drawCellTile`, `rebuildTerrainCanvas`, `redrawCellsNeighborhood`. |
| `public/js/assets/tankSprites.js` | Chasis (`LIGHT_CHASSIS_SPRITE`, `MEDIUM_CHASSIS_SPRITE`, `HEAVY_CHASSIS_SPRITE` → `CHASSIS_SPRITES`) y torretas (`MORTAR_TURRET_SPRITE`, `SHOTGUN_TURRET_SPRITE`, `RICOCHET_TURRET_SPRITE`, `BUILDER_TURRET_SPRITE`, `TOXIC_TURRET_SPRITE`, `FIRE_SHOT_TURRET_SPRITE`, `DRONE_TURRET_SPRITE`, `BLOODSUCKER_TURRET_SPRITE`, `PIERCING_TURRET_SPRITE` → `TURRET_SPRITES`), más `drawTankChassis` y `drawTankTurret`. |
| `public/js/assets/deployableSprites.js` | `DRONE_SPRITE`, `AUTO_TURRET_SPRITE` → `DEPLOYABLE_SPRITES`, más `drawDeployable`. |
| `public/js/assets/hazardSprites.js` | `MOLOTOV_SPRITE`, `POISON_SPRITE`, `FIRE_POOL_SPRITE`, `FIRE_WALL_SPRITE`, `MINE_SPRITE`, `TRAP_SPRITE` → `HAZARD_SPRITES`, más `drawHazard`. |

#### Renderizado, UI y cliente WebSocket (`public/js/render/`, `ui/`, `net/`)
| Archivo | Funciones y responsabilidad |
|---|---|
| `public/js/render/effects.js` | `spawnExplosionParticles`, `drawAimPreview`, `drawActiveTraces`, `drawParticles`, `drawFloatingTexts`. |
| `public/js/render/renderer.js` | `syncVisualTanks`, `drawStatusRingsAndBadges`, `startRenderLoop`. Bucle `requestAnimationFrame` a 60 FPS con interpolación de movimiento, cola de disparos diferidos (`pendingShots`) e invocación de los renderizadores de terreno, peligros, desplegables, tanques y efectos. |
| `public/js/ui/hangar.js` | `renderTankSkillsSlot`, `renderTankPreview`, `renderHangarOptions`, `resetBattleVisualState`, `initHangarUI`. Renderiza el Hangar, previsualiza el tanque en canvas, gestiona revanchas y envía `start_game`. |
| `public/js/ui/multiplayer.js` | `initMultiplayerUI`, `handleAdhocServerMessage`, `updateHostAddrDisplay`, `applySyncModeUI`, `requestLegacyRematch`, `resetMultiplayerOnHangarReturn`. Controla la interfaz de **PvP Ad-Hoc** (crear/unirse por IP+código) y la consola **Hayes 56K Módem 90s** (`PWR/HS/CD/TX/RX`, selección acústico/mismo PC). |
| `public/js/ui/hud.js` | `getActiveControlInfo`, `updateHUD`, `selectWeapon`, `initBattleControls`. Gestiona eventos de ratón/teclado/botones con bloqueo por turno activo (`isMyTurn`) y actualiza el HUD de combate, lista de rivales y logs. |
| `public/js/net/modemAudio.js` | `crc16Ccitt`, `encodePacketFrame`, `modulatePacketToPcm`, `FskStreamDecoder`, `serializeLegacyPacket`, `parseLegacyPacket`, `legacyModem`. Síntesis Web Audio de módem 90s (dial tone, DTMF, `2100 Hz` CED, ruido de portadora V.32bis/V.90) y códec acústico FSK (`1200/2200 Hz`, Goertzel + CRC-16). |
| `public/js/net/wsClient.js` | `sendLocalWs`, `sendWs`, `connectRemoteAdhoc`, `closeRemoteAdhoc`, `applyShotResolved`, `initShutdownButtons`, `connectWebSocket`. Enruta acciones al servidor local, al Host Ad-Hoc remoto o al transmisor de audio Módem 90s. |

---

## Quién llama a quién durante la ejecución

### 1. Mapa general de dependencias entre módulos

```text
SERVIDOR
  server.js
   ├── src/config/constants.js
   └── src/net/sessionHandler.js
        ├── src/net/websocket.js
        ├── src/data/{armors,specials1,specials2,tanks}.js
        ├── src/engine/pathfinding.js ──▶ constants.js
        ├── src/engine/hazards.js     ──▶ constants.js, specials1.js, specials2.js, physics.js
        ├── src/engine/combat.js      ──▶ constants.js, specials1.js, specials2.js, physics.js, hazards.js
        └── src/engine/match.js       ──▶ constants.js, armors.js, specials1.js, specials2.js, tanks.js,
                                          mapGenerator.js, pathfinding.js, physics.js, combat.js, hazards.js

CLIENTE
  public/index.html ──▶ public/js/main.js
   ├── public/js/net/wsClient.js (initShutdownButtons, connectWebSocket, sendWs, applyShotResolved)
   │    ├── state.js, constants.js
   │    ├── assets/terrainSprites.js (rebuildTerrainCanvas, redrawCellsNeighborhood) ──▶ palettes.js
   │    ├── render/effects.js (spawnExplosionParticles)
   │    ├── render/renderer.js (syncVisualTanks)
   │    ├── ui/hangar.js (renderHangarOptions)
   │    └── ui/hud.js (updateHUD)
   ├── public/js/ui/hangar.js (initHangarUI) ──▶ state.js, assets/tankSprites.js
   ├── public/js/ui/hud.js (initBattleControls) ──▶ state.js, constants.js
   └── public/js/render/renderer.js (startRenderLoop)
        ├── assets/{hazardSprites,deployableSprites,tankSprites}.js
        └── render/effects.js (drawAimPreview, drawActiveTraces, drawParticles, drawFloatingTexts)
```

---

### 2. Secuencia de llamadas en tiempo de ejecución

1. **Arranque del servidor y apertura del juego**
   - `jugar.vbs` (o `jugar.bat` llamando a `wscript.exe //B jugar.vbs`) ejecuta `node server.js` oculto en segundo plano (`windowStyle = 0`), comprueba que el servidor responda `200` y abre `http://localhost:3000` en ventana de aplicación (`--app=...`).
   - `server.js` levanta `http.createServer` en `PORT` (`3000`) sirviendo `public/index.html`, `public/style.css` y `public/js/**/*.js`.
   - El navegador carga `public/js/main.js`, que llama en orden a:
     1. `initShutdownButtons()` (`wsClient.js`)
     2. `initHangarUI(sendWs)` (`hangar.js`)
     3. `initBattleControls(sendWs)` (`hud.js`)
     4. `startRenderLoop(applyShotResolved)` (`renderer.js`)
     5. `connectWebSocket()` (`wsClient.js`)
   - `connectWebSocket()` abre WebSocket contra `server.js` → evento `upgrade` → `server.js` llama a `attachWebSocketSession()` (`sessionHandler.js`).
   - `attachWebSocketSession()` responde el handshake HTTP `101`, codifica con `encodeWsText()` (`websocket.js`) y envía `{ type: 'catalog', ... }` usando los objetos de `src/data/*`.
   - En el cliente, `handleServerMessage()` (`wsClient.js`) guarda `state.catalog`, ajusta `canvas`/`terrainCanvas` y llama a `renderHangarOptions()` (`hangar.js`), que a su vez llama a `renderTankSkillsSlot()` y `renderTankPreview()` (usando `drawTankChassis` y `drawTankTurret` de `tankSprites.js`).

2. **Inicio de partida (`start_game`)**
   - El usuario pulsa **Iniciar Batalla** → callback `startMatch()` (`hangar.js`) → `sendWs({ type: 'start_game', ... })`.
   - En el servidor, `socket.on('data')` llama a `decodeWsFrames()` (`websocket.js`) y despacha `handleAction(parsed)` (`sessionHandler.js`).
   - `handleAction` llama a `createMatch()` (`match.js`) —que invoca a `generateArena()` (`mapGenerator.js`) y `createTankEntity()` para instanciar los equipos— y devuelve el estado con `serializeState(game)`.
   - `handleServerMessage` recibe `type: 'state'` → llama a `syncVisualTanks(true)` (`renderer.js`), `rebuildTerrainCanvas()` (`terrainSprites.js`) y `updateHUD()` (`hud.js`), y muestra `#battle-screen`.

3. **Bucle de renderizado continuo (60 FPS en el cliente)**
   - `startRenderLoop(applyShotResolved)` (`renderer.js`) ejecuta cada frame `renderLoop(now)`:
     - Dibuja `terrainCanvas`.
     - Llama a `drawHazard()` (`hazardSprites.js`) y `drawDeployable()` (`deployableSprites.js`).
     - Avanza la interpolación visual de `state.visualTanks`; cuando termina un desplazamiento con disparos en cola (`pendingShots`), invoca al callback `applyShotResolved()` (`wsClient.js`).
     - Llama a `drawStatusRingsAndBadges()`, `drawTankChassis()` y `drawTankTurret()` (`tankSprites.js`).
     - Llama a `drawAimPreview()`, `drawActiveTraces()`, `drawParticles()` y `drawFloatingTexts()` (`effects.js`).

4. **Movimiento del jugador (`move_step` / `move_to`)**
   - Teclas `WASD`/Flechas o clic en modo `[M]` / clic derecho en `initBattleControls()` (`hud.js`) → `sendWs({ type: 'move_step' | 'move_to' })`.
   - `sessionHandler.js`:
     - Para `move_step`: valida con `isFootprintFree()` (`pathfinding.js`).
     - Para `move_to`: genera el mapa transitable con `buildWalkableGrid()` y calcula la ruta con `findPathAStar()` (`pathfinding.js`).
     - Ambas rutas llaman a `dispatchMovement()` → `processMovementWithHazards()` (`hazards.js`) → envía `tank_moved` y `hazard_triggered`, verifica `checkGameOver()` (`match.js`) y llama a `maybeAutoEndTurn()`.
   - El cliente recibe `tank_moved` en `handleServerMessage()` (`wsClient.js`), encola los pasos en `vt.queue` para animarlos en `renderer.js` y refresca `updateHUD()`.

5. **Disparo y habilidades (`shoot`) y cambio de unidad (`switch_control`)**
   - Tecla `Tab` o botón de alternar unidad (`hud.js`) → `sendWs({ type: 'switch_control' })` → `sessionHandler.js` alterna `game.activeControl` entre `'player'` y `'drone'` y responde `control_changed`.
   - Clic izquierdo en modo `[F]` (`hud.js`) → `sendWs({ type: 'shoot', mode, angle, targetX, targetY })`.
   - `sessionHandler.js` valida cooldowns/supresión PEM y llama a `resolveShot()` (`combat.js`), que utiliza `physics.js` (`raycastWallDDA`, `findClosestTankHit`, `applyRadialWallDamage`, `applyRadialTankDamage`, `buildWallBarricade`, `findNearestEmptyPoint`) y `hazards.js` (`isTankTouchingHazard`).
   - El servidor envía `shot_resolved`, comprueba `checkGameOver()` y llama a `maybeAutoEndTurn()` (si no quedan acciones ni en el tanque ni en el dron, pasa automáticamente al turno de la IA).
   - En el cliente, `wsClient.js` llama a `applyShotResolved(msg)` (o lo encola en `vtShooter.pendingShots` si el tanque aún está en movimiento), lo que actualiza ladrillos con `redrawCellsNeighborhood()` (`terrainSprites.js`), genera partículas con `spawnExplosionParticles()` (`effects.js`), crea trazas/textos flotantes y llama a `updateHUD()`.

6. **Turno de la IA y fin de turno (`end_turn`)**
   - Tecla `Espacio`, botón **Terminar Turno** o fin automático desde `maybeAutoEndTurn()` → llama a `beginAITurn()` (`match.js`).
   - `beginAITurn()` ejecuta en secuencia:
     1. `runDeployableTurrets(game, 'player', ...)` (`match.js`): torretas autónomas del jugador disparan y descuentan turnos restantes.
     2. `tickMolotovZones()` (`hazards.js`): aplica daño de charcos activos (`molotov`, `poison`, `fire_pool`, `fire_wall`) y expira sus contadores.
     3. `runAITurn()` (`match.js`): para cada IA viva activa trampas (`armTeamTraps`), aplica veneno/fuego (`applyTurnStartPoison`), calcula AP (`computeTurnMoveAp`), busca caminos (`buildWalkableGrid`, `findPathAStar`), comprueba visibilidad (`hasLineOfSightToTank`) y dispara (`resolveShot`). Luego ejecuta `runDeployableTurrets(game, 'ai', ...)` y prepara el siguiente turno del jugador enviando `state`.

7. **Cierre del servidor (`shutdown_server` / `POST /api/shutdown`)**
   - Pulsar **Cerrar Servidor** en `initShutdownButtons()` (`wsClient.js`) llama a `requestServerShutdown()`:
     - Si el WebSocket está abierto, envía `{ type: 'shutdown_server' }` → `sessionHandler.js` responde `server_closing` → `markServerStopped()` en el cliente y ejecuta `shutdownServer()` (`server.js`).
     - Si el WebSocket no está abierto, realiza `fetch('/api/shutdown', { method: 'POST' })` → `server.js` responde JSON `200` y programa `shutdownServer()`, cerrando sockets activos y terminando el proceso Node.js.
