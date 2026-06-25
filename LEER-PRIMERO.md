# Lubricentro Villagra — Guía para correr el proyecto (Windows)

Esta guía es para levantar el sistema en otra computadora Windows.
La base de datos vive en la nube (Supabase), así que **no hay que instalar ninguna base de datos**.

El proyecto tiene 2 partes que deben estar corriendo al mismo tiempo:
- **Backend** (API en Node.js)  → carpeta `backend`  → corre en `http://localhost:3000`
- **Frontend** (las pantallas)  → carpeta `sistema`  → se abre con "Live Server"

---

## 1. Instalar lo necesario (solo una vez)

Hay que instalar **3 cosas**: Node.js, Visual Studio Code y la extensión Live Server.
Sigue cada bloque en orden, sin saltarte la parte de "comprobar".

---

### 1.A — Instalar Node.js (el motor que corre la API)

1. Abrir el navegador e ir a: **https://nodejs.org**
2. Aparecen dos botones grandes. Hacer clic en el que dice **"LTS"**
   (es el recomendado / estable; el otro dice "Current", **no usar ese**).
3. Se descarga un archivo que termina en **`.msi`** (por ejemplo `node-v20.x.x-x64.msi`).
   Abrirlo (doble clic) desde la carpeta de Descargas.
4. En el instalador:
   - Clic en **Next**.
   - Marcar **"I accept the terms..."** → **Next**.
   - Dejar la carpeta de instalación como está → **Next**.
   - En la pantalla "Custom Setup" dejar todo como está → **Next**.
   - Si aparece una casilla sobre **"Tools for Native Modules"**, se puede **dejar
     SIN marcar** (no hace falta) → **Next**.
   - Clic en **Install**. Si Windows pregunta "¿Permitir que esta app haga cambios?",
     decir **Sí**.
   - Al terminar, clic en **Finish**.
5. **Comprobar que quedó bien instalado:**
   - Cerrar cualquier ventana de PowerShell que estuviera abierta.
   - Abrir el menú Inicio, escribir **PowerShell** y abrirlo.
   - Escribir esto y presionar Enter:
     ```
     node -v
     ```
     Debe responder algo como **`v20.11.1`** (el número puede variar).
   - Escribir también:
     ```
     npm -v
     ```
     Debe responder algo como **`10.2.4`**.
   - Si ambos muestran un número, **Node quedó listo.** ✅
   - Si dice *"no se reconoce como comando"*, **reiniciar la computadora** y volver a probar.

---

### 1.B — Instalar Visual Studio Code (el editor)

1. Ir a: **https://code.visualstudio.com**
2. Clic en el botón azul **"Download for Windows"**. Se descarga un `.exe`.
3. Abrir el archivo descargado.
4. En el instalador:
   - Aceptar el acuerdo → **Siguiente**.
   - Dejar la carpeta por defecto → **Siguiente**.
   - **Recomendado:** marcar la casilla **"Agregar al PATH"** (suele venir marcada,
     dejarla así). También se puede marcar "Crear icono en el escritorio".
   - **Siguiente** → **Instalar** → **Finalizar**.
5. Abrir **Visual Studio Code** (quedó en el menú Inicio o en el escritorio).

---

### 1.C — Instalar la extensión "Live Server" (para abrir las pantallas)

1. Con **VS Code** abierto, mirar la barra de íconos a la **izquierda**.
2. Hacer clic en el ícono de **Extensiones** (son 4 cuadritos, uno separado).
   - Atajo: presionar `Ctrl` + `Shift` + `X`.
3. En la barra de búsqueda que aparece arriba, escribir: **Live Server**
4. En los resultados, elegir el que dice **"Live Server"** del autor **Ritwick Dey**
   (es el más descargado, tiene millones de instalaciones).
5. Hacer clic en el botón azul **Install**.
6. Cuando termine, ya está. No hay que reiniciar nada.

> Con esto queda todo lo necesario instalado. Esto **solo se hace una vez**;
> los siguientes días se salta directo al paso 3.

---

## 2. Copiar el proyecto

1. Copiar toda la carpeta **`auto service pro`** a la computadora (por ejemplo a `C:\auto service pro`).
2. ⚠️ **MUY IMPORTANTE:** dentro de `backend` debe existir un archivo llamado **`.env`**.
   Ese archivo tiene las llaves de conexión a la base de datos. Si al comprimir/copiar
   se perdió, pídeselo a David y pégalo dentro de la carpeta `backend`.
   - Para verificar que está: abrir la carpeta `backend` y activar en el Explorador de
     Windows  **Vista → Elementos ocultos**  (el `.env` a veces se ve "tenue").

---

## 3. Levantar el BACKEND (la API)

1. Abrir **VS Code** → menú **Archivo → Abrir carpeta** → elegir `C:\auto service pro`.
2. Abrir una terminal: menú **Terminal → Nueva terminal**.
3. Entrar a la carpeta del backend:
   ```
   cd backend
   ```
4. Instalar las dependencias (solo la primera vez, tarda 1–2 min):
   ```
   npm install
   ```
5. Arrancar el servidor:
   ```
   npm run dev
   ```
   Debe aparecer:  `API corriendo en http://localhost:3000`
   - **Dejar esta terminal abierta.** Si se cierra, se apaga la API.
   - `npm run dev` reinicia solo cuando se cambia código. (También sirve `npm start`.)

> Para comprobar que la API responde, abrir en el navegador:
> http://localhost:3000/api/ping  → debe mostrar `{"ok":true}`

---

## 4. Levantar el FRONTEND (las pantallas)

1. En VS Code, en el panel izquierdo, abrir la carpeta **`sistema`**.
2. Hacer **clic derecho** sobre el archivo **`login.html`**.
3. Elegir **"Open with Live Server"**.
4. Se abrirá el navegador en una dirección como `http://127.0.0.1:5500/sistema/login.html`.

> ⚠️ No abrir los `.html` con doble clic (eso usa `file://` y NO funciona).
> Siempre usar **Live Server**.

---

## 5. Iniciar sesión (usuarios de prueba)

En la pantalla de login hay botones de acceso rápido, o se puede escribir:

| Rol           | Correo                | Contraseña   |
|---------------|-----------------------|--------------|
| Administrador | admin@villagra.cr     | Admin1234!   |
| Mecánico      | kevin@villagra.cr     | Mecanico1!   |
| Cliente       | maria@cliente.cr      | Cliente1!    |

> Si las contraseñas no funcionan, en la terminal del backend correr una vez:
> ```
> node crear-usuarios.js
> ```
> (eso restablece las contraseñas de los usuarios de prueba)

---

## Resumen rápido (para los siguientes días)

Cada vez que se quiera usar el sistema:
1. Abrir VS Code en la carpeta del proyecto.
2. Terminal → `cd backend` → `npm run dev`  (dejar abierto).
3. Clic derecho en `sistema/login.html` → **Open with Live Server**.

---

## Problemas comunes

- **"node no se reconoce como comando"** → Node no está instalado o hay que cerrar y
  volver a abrir VS Code/PowerShell después de instalarlo.

- **La página carga pero no muestra datos / "Error de conexión"** → el backend no está
  corriendo. Volver al paso 3 (`npm run dev`) y verificar `http://localhost:3000/api/ping`.

- **"EADDRINUSE: address already in use :::3000"** → ya hay otra ventana con el backend
  corriendo. Cerrar las otras terminales o reiniciar la computadora.

- **Error de Supabase / "Invalid API key"** → falta o está mal el archivo `.env` en
  `backend`. Volver al paso 2.

- **Las pantallas no cargan estilos o quedan en blanco** → se abrió con doble clic en vez
  de Live Server. Cerrar y abrir con **Open with Live Server**.
