import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

declare const process: { env: Record<string, string | undefined> }

// On GitHub Pages the site lives at /<repo-name>/, so the deploy sets VITE_BASE. Locally it stays '/'.
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
