import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    // GitHub Pages serves a project site from a sub-path
    // (https://<user>.github.io/<repo>/), so the emitted index.html must point at
    // <sub-path>/assets/... rather than /assets/... . The deploy workflow exports
    // VITE_BASE (taken from actions/configure-pages); './' is the safe fallback so a
    // local `npm run build` also works when dropped into any folder.
    base: process.env.VITE_BASE || './',
    define: {
      // No API key exists in a static Pages build; stringify(undefined) would emit a
      // bare `undefined` token, so fall back to an empty string.
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
