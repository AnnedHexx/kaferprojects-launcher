# EKO Client — Android

App Android (APK) que reutiliza la misma interfaz del launcher de Windows mediante
Capacitor, con un plugin nativo para las funciones que la web no puede hacer sola.

## APK generado

```
dist/EKOClient-Android-1.0.3.apk
```

- Paquete: `net.ekoclient.android`
- Versión: `1.0.3` (versionCode `103`)
- Android mínimo: 6.0 (API 23)
- Orientación: **horizontal** (`sensorLandscape`, admite girar 180°)
- Pantalla completa inmersiva: oculta barra de estado y navegación (se muestran
  deslizando desde el borde)
- Interfaz compacta automática en pantallas de móvil en horizontal
  (`@media (orientation: landscape) and (max-height: 600px)`)
- Firma: `keystore/eko-release.jks` (alias `eko`). Credenciales en `keystore/LEEME.txt`.

> Guarda el keystore y la contraseña. Sin ellos no podrás publicar actualizaciones
> de esta app: Android rechaza una actualización firmada con otra clave.

## Requisitos para recompilar

- JDK 21
- Android SDK 35 (`platforms;android-35`, `build-tools;35.0.0`, `platform-tools`)
- `local.properties` con `sdk.dir=...` (ya incluido)

En este equipo quedaron instalados en:

```
C:\Users\Home\AppData\Local\Android\jdk21
C:\Users\Home\AppData\Local\Android\Sdk
```

## Recompilar

Desde `extracted`:

```bat
npm run build
cd android-app
npx cap sync android
cd android
gradlew.bat assembleRelease
```

Salida:

```
android-app/android/app/build/outputs/apk/release/app-release.apk
```

## Qué funciona

- Toda la interfaz: launcher, servidores, perfiles, Bazaar, chats, ajustes, admin.
- Ping real por UDP (RakNet) a servidores Bedrock.
- Inicio de sesión Microsoft/Xbox con el flujo de código de dispositivo.
- Apertura de Minecraft Bedrock Android.
- Descarga de packs de servidor (`.mcaddon` / `.mcpack` / `.mcworld`) y entrega a
  Minecraft para que los importe en su carpeta `com.mojang`.
- Enlaces externos, notificaciones e información del sistema.

## Limitaciones frente a Windows

- **JUGAR no puede unirse automáticamente a un servidor.** Minecraft Bedrock de
  Android no ofrece un enlace/intent público para conectarse a una IP. El botón
  abre Minecraft; el servidor hay que elegirlo dentro del juego.
- **Discord Rich Presence no está disponible** en Android para apps de terceros.
- **Skin local del PC** no existe en Android; se usa la skin pública de Xbox Live.
- **Packs de servidor**: Android no permite escribir dentro de
  `Android/data/com.mojang.minecraftpe/`, así que la app descarga el pack y se lo
  entrega a Minecraft mediante un `content://`. Minecraft muestra su propio aviso
  de importación y lo guarda en `com.mojang`. Es el mismo mecanismo que abrir un
  `.mcaddon` desde WhatsApp o Chrome.
- **Aternos**: el panel de cuenta no está implementado en Android (el ping normal
  sigue funcionando).
- La interfaz se adapta a móvil en horizontal, pero sigue siendo la misma del
  escritorio: en pantallas muy pequeñas algunos paneles pueden requerir scroll.

## Estructura

```
android-app/
  capacitor.config.ts        configuración (webDir: ../out)
  assets/                    iconos y splash de origen
  keystore/                  clave de firma
  android/
    app/src/main/java/net/ekoclient/android/
      MainActivity.java      registra el plugin
      EkoNativePlugin.java   ping, HTTP, Minecraft, notificaciones
```

El puente web está en `lib/android-bridge.ts` y solo se activa dentro de
Capacitor (`window.Capacitor.isNativePlatform()`), así que no afecta a Windows.
