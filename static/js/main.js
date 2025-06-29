// static/js/main.js

import { initializeImageTab } from './modules/image-tab.js';
import { initializeVideoTab } from './modules/video-tab.js';
import { initializeWebcamTab, stopWebcam as stopWebcamSession } from './modules/webcam-tab.js';
import { initializeImageModal } from './modules/modal.js';

// --- Tab Management ---
const tabButtons = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');

function showTab(targetTabId) {
    tabContents.forEach(content => content.classList.remove('active'));
    tabButtons.forEach(button => button.classList.remove('active'));
    
    document.getElementById(targetTabId)?.classList.add('active');
    document.getElementById(targetTabId.replace('content-', 'tab-'))?.classList.add('active');
    
    // Dừng webcam nếu chuyển sang tab khác
    if (targetTabId !== 'content-webcam') {
        stopWebcamSession();
    }
}

function initializeTabs() {
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            showTab(this.id.replace('tab-', 'content-'));
        });
    });
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeImageTab();
    initializeVideoTab();
    initializeWebcamTab();
    initializeImageModal();

    // Dừng webcam khi rời khỏi trang
    window.addEventListener('beforeunload', stopWebcamSession);
});