# Subir Auto Service Pro a Render (todo en un solo servicio, gratis)

El backend (Express) ahora también sirve las pantallas, así que **todo el
proyecto se sube a UN solo servicio en Render**: frontend + API. La base de
datos (Supabase) ya está en la nube.

---

## PARTE 0 — Subir el código a GitHub (una vez)

> ⚠️ El archivo `backend/.env` tiene llaves secretas. El `.gitignore` ya lo
> excluye, así que NO se subirá. No lo borres.

En la terminal, dentro de `C:\auto service pro`:

```
git init
git add .
git commit -m "Version para deploy"
git branch -M main
git remote add origin https://github.com/davloufide/villagra.git
git push -u origin main
```

(Si el remote ya existe, omite la línea de `git remote add`. Si pide login, usa tu usuario de GitHub.)

---

## PARTE 1 — Crear el servicio en Render

1. Entra a **https://render.com** y crea cuenta (puedes usar "Sign in with GitHub").
2. Botón **New +** → **Web Service**.
3. Conecta tu repositorio de GitHub (`villagra`).
4. Configura:
   - **Name:** auto-service-pro (o el que quieras → será parte de tu URL)
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. En **Environment Variables**, agrega estas 3 (cópialas de tu `backend/.env`):
   - `SUPABASE_URL` = (valor de tu .env)
   - `SUPABASE_SERVICE_KEY` = (valor de tu .env)
   - `JWT_SECRET` = (valor de tu .env)
   - *(NO agregues PORT: Render lo pone solo.)*
6. **Create Web Service** y espera a que diga **Live**.
7. Tu app queda en una URL como:
   `https://auto-service-pro.onrender.com`

¡Eso es todo! Esa URL sirve las pantallas **y** la API.

---

## Verificar
1. Abre la URL de Render → te lleva a la landing.
2. Entra a login y prueba con un usuario de prueba (ej. admin@villagra.cr / Admin1234!).
3. La primera carga puede tardar ~30-50 seg si el servicio estaba "dormido"
   (plan gratis). Reintenta y ya queda rápido.

---

## Actualizar la app después (nuevos cambios)
Cada vez que cambies código:
```
git add .
git commit -m "cambios"
git push
```
Render detecta el push y **vuelve a desplegar solo**.

---

## Notas
- **Local sigue igual:** `cd backend` → `npm run dev`, y el frontend con Live
  Server (puerto 5500). El `api.js` detecta si está en Live Server y apunta al
  backend local; en Render usa la misma URL.
- **Plan gratis de Render:** el servicio se "duerme" tras ~15 min sin uso; la
  primera petición después tarda un poco. Normal para demos.
- **Seguridad:** las llaves van como variables de entorno en Render, nunca en el
  código ni en GitHub (el `.gitignore` protege el `.env`).
