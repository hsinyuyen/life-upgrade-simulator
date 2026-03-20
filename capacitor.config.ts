import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.levelup.liferpg',
  appName: 'Life Upgrade Simulator',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  }
};

export default config;
