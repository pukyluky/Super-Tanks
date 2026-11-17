# Tanques Tácticos 2D

Juego de estrategia y combates por turnos con estética Pixel Art para **Windows (`.exe`)**, navegador y **Android (`.apk`)**, desarrollado en **Node.js** y **HTML5 Canvas** sin dependencias externas.

---

## Características

- **Modos PvE (vs IA):**
  - **Clásico vs IA:** Combate contra varios tanques enemigos en dificultades `Fácil`, `Normal` y `Difícil`.
  - **Todos contra todos:** Número de bots ajustable (`1` a `5` bots) que también luchan entre sí en una arena circular.
- **Modos PvP Multijugador:**
  - **Red Local / Ad-Hoc (hasta 6 jugadores):** Crea una sala con código, selecciona tanque y blindaje en la antesala junto al resto de jugadores y elige entre **Todos contra todos** (arena redonda) o **Equipos** (reparto aleatorio al empezar).
  - **Módem años 90 (Audio FSK):** Duelo 1v1 sincronizado mediante tonos de módem por altavoz/micrófono o en el mismo PC.
- **10 Tanques únicos** combinables con **3 blindajes** (`Ligero`, `Medio`, `Pesado`):
  - **Artillero:** Mortero Táctico + Cóctel Molotov
  - **Escopetero:** Cañón Metralla + Mina Terrestre
  - **Rebotador:** Cañón Rebotador + Tiro Cargado
  - **Cazacarros:** Rifle Perforante + Trampa Invisible
  - **Ingeniero:** Constructor de Muro + Torreta Autónoma
  - **Químico:** Tiro Tóxico + Tiro Congelador
  - **Caín:** Tiro de Fuego + Muro de Fuego
  - **NetRunner:** Escopeta Corta + Dron Táctico + Bomba PEM
  - **Berserker:** Furia de Sangre (pasiva) + Chupasangre + Ira
  - **Assasin:** Golpe Trampero (daño extra por la espalda del chasis) + TP (espera 1 turno con escudo e invisibilidad)
- **Mapas destructibles:** `Búnkeres`, `Laberinto`, `Campo Abierto` y `Aleatorio`, adaptados automáticamente a base circular tipo coliseo en **Todos contra todos**.

---

## Cómo ejecutar

### Windows (`.exe`)
Abre directamente **`dist/TanquesTacticos2D.exe`** (no necesita instalar Node.js). Al cerrar la ventana del juego, el servidor local se apaga automáticamente.

### Modo desarrollo (Node.js)
- Doble clic en `jugar.vbs` o `jugar.bat`, o bien ejecuta:
  ```bash
  node server.js
  ```
- Abre `http://localhost:3000` si no se abre automáticamente.

### Compilación
- **Ejecutable de PC:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File build_exe.ps1
  ```
- **APK de Android** (generado en `Android/dist/TanquesTacticos2D.apk`):
  ```powershell
  powershell -ExecutionPolicy Bypass -File ..\Android\build_apk.ps1
  ```

---

## Controles (PC)

- **`W A S D` / Flechas:** Mover casilla a casilla.
- **`Clic Derecho` (o `[M]` + `Clic Izquierdo`):** Movimiento automático por ruta más corta.
- **`Clic Izquierdo` (modo `[F]`):** Apuntar 360° y disparar.
- **`1` / `2` / `3`:** Cambiar entre disparo básico y habilidades especiales.
- **`Tab`:** Alternar control entre tanque y dron (NetRunner).
- **`Espacio`:** Terminar turno.

---

## Estructura del proyecto

```text
PC/
├── server.js          # Servidor HTTP y WebSocket
├── jugar.vbs / .bat   # Lanzadores rápidos en Windows
├── build_exe.ps1      # Empaquetado del ejecutable (.exe)
├── src/
│   ├── config/        # Constantes del mapa y MIME
│   ├── data/          # Catálogo de tanques, blindajes y habilidades
│   ├── engine/        # Física, IA, mapas, combates y reglas de turno
│   └── net/           # Salas Ad-Hoc, descubrimiento LAN y WebSocket
├── public/            # Interfaz web, Canvas Pixel Art y módem FSK
├── build/             # Código del lanzador nativo e icono
└── dist/              # Ejecutable compilado (TanquesTacticos2D.exe)
```
