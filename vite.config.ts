import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.PAGES_BASE_PATH || '/gym-operations/',
    plugins: [react()],
  };
});
