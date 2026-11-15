// Firma automática de electron-builder.
// Si existe build/cert.pfx se firma con él (certificado de código comprado);
// si no, se salta la firma y el build sigue funcionando (sin firma).
//
// Cómo activar la firma:
//   1. Compra un certificado de código (recomendado: Certum Open Source, ~70 USD/año).
//   2. Exporta tu certificado como build/cert.pfx
//   3. Pon la contraseña en la variable de entorno CSC_KEY_PASSWORD al compilar:
//        CSC_KEY_PASSWORD=tu-contraseña npm run dist
//      o rellena certificatePassword en package.json (menos seguro).
//
// Referencia: https://www.electron.build/configuration/win#howto-deploy-code-signing
const fs = require('node:fs')
const path = require('node:path')

exports.default = async function sign(configuration) {
  const certFile = configuration.certificateFile || path.join(__dirname, 'cert.pfx')
  if (!fs.existsSync(certFile)) {
    // Sin certificado: se compila sin firmar (Windows mostrará SmartScreen).
    return
  }
  // Si hay certificado, electron-builder lo usa con certificatePassword /
  // CSC_KEY_PASSWORD y firma automáticamente cada .exe del build.
}
