# Cómo desbloquear KaferProjects Launcher en Windows

Si al abrir el instalador **KaferProjects-Setup-1.0.2.exe** aparece un aviso de
Windows ("El Control Inteligente de Aplicaciones bloqueó una aplicación" o
"Windows protegió tu PC"), es normal: el launcher no está firmado con un
certificado de código y Windows lo marca como "desconocido". **Es seguro
instalarlo** — sigue estos pasos:

---

## Opción A — Desbloquear el archivo (la más fácil)

1. **Cierra** el aviso de Windows si lo tienes abierto.
2. Ve a la carpeta donde está el instalador (normalmente **Descargas**).
3. **Clic derecho** sobre `KaferProjects-Setup-1.0.2.exe` → **Propiedades**.
4. En la pestaña **General**, abajo del todo, verás una casilla:
   **"Desbloquear"** (o *"Este archivo proviene de otra computadora…"*).
5. **Marca la casilla** ✅ y pulsa **Aceptar**.
6. **Doble clic** en el instalador → ahora sí abre sin avisos.

> Si no ves la casilla "Desbloquear", el archivo ya está desbloqueado:
> continúa con la Opción B.

---

## Opción B — "Ejecutar de todas formas" (un solo paso)

1. **Doble clic** en `KaferProjects-Setup-1.0.2.exe`.
2. Si aparece **"Windows protegió tu PC"** (pantalla azul con escudo):
   - Pulsa **"Más información"** (texto pequeño, debajo del aviso).
   - Aparecerá el botón **"Ejecutar de todas formas"** → púlsalo.
3. El instalador arranca normalmente.

---

## Opción C — Desactivar Smart App Control (solo si A y B no aparecen)

Windows 11 trae **"Control Inteligente de Aplicaciones"** (Smart App Control)
que puede bloquear en seco sin dar opción de ejecutar. Si es tu caso:

1. Abre el menú **Inicio** → escribe **"Seguridad de Windows"** → ábrelo.
2. Ve a **"Control de aplicaciones y del navegador"**.
3. En **"Control Inteligente de Aplicaciones"**, pulsa **"Configurar"**.
4. Cámbialo a **"Desactivado"**.

> ⚠️ Importante: Windows no permite volver a activarlo sin reinstalar
> Windows. Piénsalo como un cambio permanente. Solo hazlo si las opciones
> A y B no te aparecen.

---

## Opción D — Pedir a Microsoft que lo deje pasar (gratis)

Si el bloqueo no tiene botón de ejecutar, puedes pedir a Microsoft que revise
el archivo. Si está limpio (lo está), lo añaden a su lista de confianza:

1. Abre **https://www.microsoft.com/wdsi/filesubmission**
2. En "What do you want to report?" elige **"Incorrectly detected as malware"**
   (o "Application is blocked").
3. Adjunta el instalador `KaferProjects-Setup-1.0.2.exe`.
4. Escribe: *"This is a legitimate Minecraft Bedrock launcher, falsely detected
   by Smart App Control. Please review and allow."*
5. Envía. Microsoft resuelve en 24-72 h y deja pasar el archivo.

> Nota: con solo 1 descarga el archivo no tiene "reputación" todavía;
> enviar el archivo a Microsoft también ayuda a que gane reputación.

---

## Preguntas frecuentes

**¿Es seguro el launcher?**
Sí. El aviso sale porque el instalador no tiene firma digital de empresa (el
certificado cuesta dinero y estamos en fase de pruebas). Windows avisa con
todos los programas nuevos sin firma.

**¿Tengo que hacer esto en cada versión nueva?**
Opción A: sí, una vez por cada instalador nuevo que descargues.
Opción C: no, se hace una sola vez para siempre.

**¿Puedo marcar el archivo como seguro yo mismo?**
Sí, exactamente eso hace la Opción A ("Desbloquear" en Propiedades).

**¿Y en Android?**
En Android, si aparece "Instalar apps desconocidas", activa esa opción para el
navegador que uses para descargar el APK (Chrome, Discord, etc.) en
Ajustes → Aplicaciones → Acceso especial → Instalar apps desconocidas.
