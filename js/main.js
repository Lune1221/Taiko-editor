import { initAudioContext, loadSoundEffects } from './audio.js';
import { setupEventListeners, updateUIFromState } from './ui.js';

window.addEventListener("DOMContentLoaded", () => {
    initAudioContext();
    loadSoundEffects();
    setupEventListeners();
    updateUIFromState();
});
