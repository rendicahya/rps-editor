import { mount } from 'svelte';
import '@fontsource-variable/inter';
import './app.css';
import App from './App.svelte';
import { loadFonts } from './lib/fonts.js';

const target = document.getElementById('app');

// Font dokumen harus siap sebelum tata letak pertama dihitung (untuk jsPDF dan pratinjau SVG).
loadFonts(import.meta.env.BASE_URL)
  .then(() => mount(App, { target }))
  .catch((e) => {
    target.textContent = 'Gagal memuat aplikasi: ' + e.message;
  });
