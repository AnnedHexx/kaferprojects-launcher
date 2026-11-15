# KaferProjects Launcher

Launcher de **Minecraft Bedrock** con instancias compartidas en tiempo real,
packs automáticos, panel de administración y soporte para Windows y Android.

## Características

- 🎮 Instancias compartidas que se sincronizan en tiempo real entre todos los usuarios
- 📦 Descarga e instalación automática de packs (.mcaddon / .mcpack) en la caché de Bedrock
- 🔐 Cuentas con cifrado PBKDF2 + AES-GCM (multi-dispositivo)
- 🛡️ Panel de admin: baneos, administradores y códigos de instancia
- 🎨 Personalización completa del botón JUGAR (13 animaciones, 50 tipografías, imágenes)
- 📱 Apps para Windows (Electron) y Android (Capacitor)
- 🎵 Discord Rich Presence y notificaciones nativas

## Tecnología

- **Next.js 16** + React 19 + TypeScript
- **Tailwind CSS 4** + shadcn/ui
- **Electron 44** (Windows) · **Capacitor 7** (Android)
- Sincronización vía GitHub Gist

## Desarrollo

```bash
npm install
npm run dev        # Desarrollo web
npm run desktop    # App de escritorio
npm run dist       # Instalador de Windows
```

Android:

```bash
cd android-app
npm install
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Firma y distribución

El instalador se firma automáticamente con **SignPath.io** (gratuito para
proyectos de código abierto) mediante GitHub Actions. Ver
`.github/workflows/sign-windows.yml`.

Si Windows bloquea el instalador, consulta [DESBLOQUEAR-APP.md](DESBLOQUEAR-APP.md).

## Licencia

[MIT](LICENSE)
