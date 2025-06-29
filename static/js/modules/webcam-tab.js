// static/js/modules/webcam-tab.js

import { showError } from './utils.js';

const elements = {
    videoElement: document.getElementById('videoElement'),
    overlayCanvas: document.getElementById('overlayCanvas'),
    startWebcamBtn: document.getElementById('startWebcamBtn'),
    stopWebcamBtn: document.getElementById('stopWebcamBtn'),
    webcamStatus: document.getElementById('webcamStatus'),
    webcamSuspiciousCount: document.getElementById('webcamSuspiciousCount'),
    webcamTotalCount: document.getElementById('webcamTotalCount'),
    webcamStatsList: document.getElementById('webcamStatsList'),
    webcamEvidenceContainer: document.getElementById('webcamEvidenceContainer'),
    webcamEvidencePlaceholder: document.getElementById('webcamEvidencePlaceholder'),
};

let webcamActive = false;
let webcamStream = null;
let animationFrameId = null;
let webcamSessionStats = {};
let webcamTotalDetections = 0;
let webcamSuspiciousDetections = 0;
const MAX_WEBCAM_EVIDENCE = 30;

function resetWebcamSession() {
    webcamSessionStats = {};
    webcamTotalDetections = 0;
    webcamSuspiciousDetections = 0;
    elements.webcamSuspiciousCount.textContent = '0';
    elements.webcamTotalCount.textContent = '0';
    elements.webcamStatsList.innerHTML = '<li class="text-gray-400">Chưa có dữ liệu...</li>';
    if(elements.webcamEvidenceContainer) elements.webcamEvidenceContainer.innerHTML = '';
    if(elements.webcamEvidencePlaceholder) elements.webcamEvidencePlaceholder.classList.remove('hidden');
    const ctx = elements.overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.overlayCanvas.width, elements.overlayCanvas.height);
}

async function startWebcam() {
    if (webcamActive) return;
    resetWebcamSession();
    try {
        webcamStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        elements.videoElement.srcObject = webcamStream;
        await elements.videoElement.play();
        
        webcamActive = true;
        elements.startWebcamBtn.disabled = true;
        elements.stopWebcamBtn.disabled = false;
        updateWebcamStatus('Đang giám sát...', 'bg-green-100 text-green-800');
        
        animationFrameId = requestAnimationFrame(webcamDetectionLoop);
    } catch (error) {
        showError('Không thể truy cập webcam: ' + error.message);
        updateWebcamStatus('Lỗi truy cập webcam', 'bg-red-100 text-red-800');
    }
}

export function stopWebcam() {
    if (!webcamActive) return;
    webcamActive = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    webcamStream?.getTracks().forEach(track => track.stop());
    webcamStream = null;
    
    elements.videoElement.srcObject = null;
    elements.startWebcamBtn.disabled = false;
    elements.stopWebcamBtn.disabled = true;
    updateWebcamStatus('Đã dừng giám sát. Bắt đầu phiên mới để xóa thống kê.', 'bg-gray-100 text-gray-600');
}

async function webcamDetectionLoop() {
    if (!webcamActive) return;

    const canvas = document.createElement('canvas');
    canvas.width = elements.videoElement.videoWidth;
    canvas.height = elements.videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(elements.videoElement, 0, 0, canvas.width, canvas.height);
    const imageData = canvas.toDataURL('image/jpeg', 0.7);

    try {
        const response = await fetch('/detect/webcam', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: imageData })
        });
        const result = await response.json();
        if (result.success) {
            const framedImage = `data:image/jpeg;base64,${result.image}`;
            drawWebcamDetections(result);
            updateWebcamStatsAndEvidence(result, framedImage);
        }
    } catch (error) {
        // console.error('Webcam processing error:', error);
    } finally {
        if(webcamActive) animationFrameId = requestAnimationFrame(webcamDetectionLoop);
    }
}

function drawWebcamDetections({ detections }) {
    const canvas = elements.overlayCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const suspiciousClasses = new Set(['fraudulent']);
    detections.forEach(det => {
        const isSuspicious = suspiciousClasses.has(det.class.toLowerCase());
        const color = isSuspicious ? 'red' : 'lime';
        const [x1, y1, x2, y2] = det.bbox;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
        ctx.fillStyle = color;
        const label = `${det.class}: ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = '16px sans-serif';
        const textWidth = ctx.measureText(label).width;
        ctx.fillRect(x1, y1 - 20, textWidth + 10, 20);
        ctx.fillStyle = 'black';
        ctx.fillText(label, x1 + 5, y1 - 5);
    });
}

function updateWebcamStatsAndEvidence({ detections, cheating_count }, framedImage) {
    if (cheating_count > 0) {
        updateWebcamStatus(`⚠️ Phát hiện ${cheating_count} hành vi đáng ngờ!`, 'bg-red-100 text-red-800');
    } else {
        updateWebcamStatus('✅ Không phát hiện hành vi đáng ngờ', 'bg-green-100 text-green-800');
    }
    if(detections.length === 0) return;
    detections.forEach(det => {
        webcamTotalDetections++;
        webcamSessionStats[det.class] = (webcamSessionStats[det.class] || 0) + 1;
        if (new Set(['fraudulent']).has(det.class.toLowerCase())) {
            webcamSuspiciousDetections++;
        }
    });
    elements.webcamTotalCount.textContent = webcamTotalDetections;
    elements.webcamSuspiciousCount.textContent = webcamSuspiciousDetections;
    const suspiciousClasses = new Set(['fraudulent']);
    elements.webcamStatsList.innerHTML = Object.entries(webcamSessionStats).sort((a, b) => b[1] - a[1]).map(([className, count]) => `<li class="flex justify-between items-center p-1 bg-white rounded"><span class="font-semibold ${suspiciousClasses.has(className.toLowerCase()) ? 'text-red-600' : 'text-gray-700'}">${className}</span><span class="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">${count}</span></li>`).join('');
    if (cheating_count > 0) {
        elements.webcamEvidencePlaceholder.classList.add('hidden');
        const evidenceDiv = document.createElement('div');
        evidenceDiv.className = 'evidence-thumbnail w-full bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:ring-2 hover:ring-red-500 transition-all';
        evidenceDiv.innerHTML = `<img src="${framedImage}" alt="Bằng chứng webcam" class="w-full h-auto object-cover pointer-events-none"><div class="p-1 text-xs text-center text-gray-600 pointer-events-none">${new Date().toLocaleTimeString()}</div>`;
        elements.webcamEvidenceContainer.prepend(evidenceDiv);
        if (elements.webcamEvidenceContainer.children.length > MAX_WEBCAM_EVIDENCE) {
            elements.webcamEvidenceContainer.lastChild.remove();
        }
    }
}

function updateWebcamStatus(message, className) {
    elements.webcamStatus.textContent = message;
    elements.webcamStatus.className = `p-3 rounded-lg text-center transition-colors ${className}`;
}

export function initializeWebcamTab() {
    elements.startWebcamBtn.addEventListener('click', startWebcam);
    elements.stopWebcamBtn.addEventListener('click', stopWebcam);
}