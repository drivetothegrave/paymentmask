import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/paymentmask/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        plate: resolve(__dirname, 'plate.html'),
      },
    },
  },
});
