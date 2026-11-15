# Rich Presence de KaferProjects Launcher

Esta guía explica qué hay que activar y qué **no** hace falta para que Discord muestre
"Jugando en KaferProjects Launcher".

---

## 1. Qué NO hace falta

- **No** hace falta crear un bot.
- **No** hace falta OAuth2, ni redirect URI, ni token.
- **No** hace falta invitarlo a ningún servidor de Discord.
- **No** hace falta publicar la app ni verificarla.
- **No** hay que tocar el `EKO Client` original: esta app de Discord es independiente.

La conexión es **RPC local** (IPC de escritorio): el launcher habla con el Discord que
está abierto en tu PC. Por eso solo funciona con **Discord de escritorio**, no con la
versión web ni con el móvil.

---

## 2. Qué SÍ hay que activar (una sola vez)

### 2.1 Crear la app en Discord Developer Portal

1. Entra en <https://discord.com/developers/applications> con tu cuenta.
2. Pulsa **New Application**.
3. Ponle nombre: `KaferProjects Launcher`.
4. Acepta los términos y crea.

### 2.2 Copiar el Application ID

1. Dentro de la app, ve a **General Information**.
2. Copia el **Application ID** (un número largo, tipo `1234567890123456789`).
3. Ese número es el `Client ID`. **No** es el "Public Key" ni el "Client Secret".

> Pásamelo y lo dejo escrito en `electron/discord-presence.js`
> (constante `DEFAULT_CLIENT_ID`) y vuelvo a generar el instalador.

### 2.3 Subir la imagen (asset)

1. En la app, ve a **Rich Presence → Art Assets**.
2. Sube `public/kafer-icon.png` (512×512, ya está en el proyecto).
3. Ponle como nombre exacto: `logo` (minúsculas, sin extensión).
4. Guarda los cambios.

El launcher ya pide ese asset con `largeImageKey: 'logo'`.

### 2.4 Activar el Rich Presence en el launcher

Dentro de **Configuración → Rendimiento**:

| Ajuste | Qué hace |
| --- | --- |
| **Rich Presence de Discord** | Enciende o apaga por completo la presencia. |
| **Mostrar instancia en Discord** | Si está activo, muestra el nombre de la instancia. Si lo apagas, solo dice "Jugando en KaferProjects Launcher". |

---

## 3. Qué activar en Discord (cliente de escritorio)

1. Abre **Discord de escritorio** y deja la sesión iniciada.
2. **Ajustes → Actividad de juego** (Activity Privacy):
   - **Compartir tu actividad detectada** → activado.
   - **Mostrar actividad actual como mensaje de estado** → activado
     (es lo que hace que tus amigos vean la tarjeta).
3. Si tienes varias cuentas o Discord cerrado, el launcher reintenta cada 15 s.
   No hay que hacer nada más.

> El Client ID ya está puesto en el launcher
> (`1569599407702417478`). Solo falta subir el asset `logo` en tu app de Discord.

> Si tu Discord está en modo "No molestar" o con la actividad oculta, la tarjeta no
> se mostrará aunque el launcher esté conectado.

---

## 4. Cómo comprobar que funciona

1. Abre Discord de escritorio.
2. Abre KaferProjects Launcher (versión instalada, no el navegador).
3. En Discord, tu propio perfil debe mostrar la tarjeta
   **KaferProjects Launcher** con el logo y el texto de estado.
4. Si no aparece:
   - Confirma que el Application ID del código coincide con el de tu app.
   - Confirma que el asset se llama exactamente `logo`.
   - Cierra y abre Discord (a veces el IPC queda pillado).
   - Revisa que **Rich Presence de Discord** esté activado en Configuración.

---

## 5. Dónde se cambia el Client ID

Ya está configurado con tu Application ID:

```js
const DEFAULT_CLIENT_ID = '1569599407702417478'
```

Si algún día cambias de app de Discord, edita `electron/discord-presence.js`.
También se puede sobrescribir sin tocar código con una variable de entorno:

```powershell
$env:KAFER_DISCORD_CLIENT_ID = "TU_APPLICATION_ID"
```

Orden de prioridad:

1. `options.clientId` (interno)
2. `KAFER_DISCORD_CLIENT_ID`
3. `EKO_DISCORD_CLIENT_ID`
4. `DEFAULT_CLIENT_ID`

---

## 6. Textos que muestra

| Situación | details | state |
| --- | --- | --- |
| En el menú | `En el menú de KaferProjects Launcher` | `Conectado como <gamertag>` |
| Jugando | `Jugando en <instancia>` | `Conectado como <gamertag>` |

Si "Mostrar instancia en Discord" está desactivado, se usan los textos genéricos
(`Explorando KaferProjects Launcher` / `Minecraft Bedrock`).
