import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'net.ekoclient.android',
  appName: 'KaferProjects Launcher',
  webDir: '../out',
  android: {
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: true,
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
