import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.duofit',
  appName: 'DuoFit',
  webDir: 'dist',
  backgroundColor: '#09090b',
  // The APK is a shell around the deployed site: `npm run deploy` updates the app with no reinstall.
  // Only native changes (plugins, manifest, icons) need a new APK.
  server: {
    url: 'https://duofit.luizalves.dev',
  },
  plugins: {
    SystemBars: {
      // App is dark-only: light icons on the status/navigation bars.
      style: 'DARK',
    },
  },
}

export default config
