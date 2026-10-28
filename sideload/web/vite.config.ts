import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
// VITE_BASE lets the same build serve from the TV ('/' default) or a GitHub Pages
// subpath (e.g. '/tcl-g08-smarttv-project/'). Manifest paths are relative so the
// installed app resolves its icons and start URL wherever it is hosted.
const base = process.env.VITE_BASE || '/';
export default defineConfig({base,plugins:[react(),VitePWA({registerType:'autoUpdate',manifest:{name:'Sideload · TV remote',short_name:'Sideload',description:'Your TV, a little closer.',theme_color:'#0a0a0a',background_color:'#0a0a0a',display:'standalone',orientation:'portrait',start_url:'.',scope:'.',icons:[{src:'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any'},{src:'icon-maskable.png',sizes:'512x512',type:'image/png',purpose:'maskable'}]},workbox:{globPatterns:['**/*.{js,css,html,png,svg,woff2}'],navigateFallbackDenylist:[/^\/api\//]}})],server:{proxy:{'/api':'http://127.0.0.1:8787'}}});
