import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'


// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Measurement builds (docs/perf/many-tabs.md): React's profiling build, so <Profiler> times commits.
      ...(process.env.VITE_EZEL_PERF === "1" ? { "react-dom/client": "react-dom/profiling" } : {}),
    }
  }
})
