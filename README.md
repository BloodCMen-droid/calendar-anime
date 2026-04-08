# ANIME.TX — Tracker Semanal

Tracker personal de animes en emisión con horario semanal, diseño neon y CRUD local.

## Estructura del proyecto

```
anime-tracker/
├── index.html          ← App principal
├── css/
│   └── style.css       ← Estilos (neon dark theme)
├── js/
│   └── app.js          ← Lógica principal
├── data/
│   └── animes.json     ← Base de datos local
└── README.md
```

## Cómo usar localmente

### Opción A — Servidor local simple (recomendado)
```bash
# Con Python (viene instalado en la mayoría de sistemas)
cd anime-tracker
python -m http.server 8080

# Luego abrir: http://localhost:8080
```

### Opción B — Con Node.js
```bash
npx serve .
```

### Opción C — VS Code
Instalar extensión **Live Server** y click en "Go Live".

> ⚠️ No abrir `index.html` directo con doble click (file://) porque el fetch de JSON falla por CORS.

## Cómo funciona el calendario semanal

- Cada anime tiene **fecha de estreno** y **total de episodios**
- El sistema calcula automáticamente en qué semana cae cada fecha
- Semana 1 = semana del estreno, Semana 2 = siguiente, etc.
- Si ya se superó el total de episodios, el anime **deja de aparecer**
- Las flechas ‹ › navegan entre semanas (hasta 4 semanas atrás, 16 adelante)

## Guardar datos

Los datos se guardan en **dos lugares**:
1. **`localStorage`** del navegador — instantáneo, siempre disponible
2. **`data/animes.json`** — se intenta guardar si hay un backend (ver abajo)

Para uso puramente local (sin backend), localStorage es suficiente.
Los datos NO se pierden al recargar la página.

## Subir a GitHub Pages (próximo paso)

Cuando estés listo para subir:
```bash
git init
git add .
git commit -m "feat: anime tracker inicial"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/anime-tracker.git
git push -u origin main
```

Luego en GitHub → Settings → Pages → Source: main / root.

**Nota de rutas**: El proyecto ya usa rutas relativas (`./css/`, `./js/`, `./data/`) que funcionan tanto en local como en GitHub Pages con un repo en la raíz. Si el repo tiene subdirectorio, actualizar el fetch en `app.js` línea donde dice `'./data/animes.json'`.

## CRUD

| Acción | Cómo |
|--------|------|
| Agregar | Botón **+ AGREGAR** o **+ NUEVO** |
| Editar | Click en cualquier tarjeta del calendario o ✎ en la lista |
| Eliminar | Botón ✕ en la lista de animes |

## Animes cargados (temporada Spring 2025)

| Anime | Estreno | Día | Eps |
|-------|---------|-----|-----|
| Dr. Stone | 03/10/2025 | Viernes | 12 |
| Re:Zero | 08/04/2025 | Martes | 12 |
| Wistoria | 12/04/2025 | Sábado | 12 |
| Akane-banashi | 04/04/2025 | Viernes | 12 |
| Barbarian's Bride | 09/04/2025 | Miércoles | 12 |
| Marriage Toxin | 04/04/2025 | Viernes | 12 |
| Angel Next Door | 05/04/2025 | Sábado | 12 |
| Petals of Reincarnation | 04/04/2025 | Viernes | 12 |
| Second Prettiest Girl | 07/04/2025 | Lunes | 12 |
| End This Love Game | 14/04/2025 | Lunes | 12 |
| Mistress Kanan | 04/04/2025 | Viernes | 12 |
