import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'app.duofit',
  appName: 'DuoFit',
  webDir: 'dist',
  backgroundColor: '#09090b',
  plugins: {
    SystemBars: {
      // App is dark-only: light icons on the status/navigation bars.
      style: 'DARK',
    },
  },
}

export default config
