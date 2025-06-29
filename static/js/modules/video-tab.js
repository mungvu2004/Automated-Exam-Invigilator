// static/js/modules/video-tab.js

import { showError, showSuccess, validateFile } from './utils.js';

const elements = {
    videoInput: document.getElementById('videoInput'),
    videoFileName: document.getElementById('videoFileName'),
    analyzeVideoBtn: document.getElementById('analyzeVideoBtn'),
    videoResultsContainer: document.getElementById('videoResultsContainer'),
    videoPlaceholder: document.getElementById('videoPlaceholder'),
    videoProgress: document.getElementById('videoProgress'),
    videoProgressBar: document.getElementById('videoProgressBar'),
    videoProgressStatus: document.getElementById('videoProgressStatus'),
    videoResult: document.getElementById('videoResult'),
};

function handleVideoSelection(e) {
    const file = e.target.files[0];
    if (validateFile(file, ['video/mp4', 'video/avi', 'video/quicktime', 'video/x-matroska'], 500)) {
        elements.analyzeVideoBtn.disabled = false;
        elements.videoFileName.textContent = file.name;
    } else {
        elements.analyzeVideoBtn.disabled = true;
        elements.videoFileName.textContent = 'Hỗ trợ: MP4, AVI, MOV (Tối đa 500MB)';
        if (file) showError('File không hợp lệ. Chọn video (MP4, AVI, MOV) dưới 500MB.');
    }
}

async function analyzeVideo() {
    const file = elements.videoInput.files[0];
    if (!file) return showError('Vui lòng chọn video để phân tích');
    
    const formData = new FormData();
    formData.append('file', file);

    elements.analyzeVideoBtn.disabled = true;
    elements.videoPlaceholder.classList.add('hidden');
    elements.videoProgress.classList.remove('hidden');
    elements.videoResult.classList.add('hidden');
    
    try {
        const response = await fetch('/detect/video', { method: 'POST', body: formData });
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n\n').filter(line => line.trim().startsWith('data:'));
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line.substring(5));
                    handleVideoProgress(data);
                } catch (e) { console.error("Failed to parse SSE data chunk:", line); }
            }
        }
    } catch (error) {
        showError('Lỗi kết nối khi xử lý video: ' + error.message);
        resetVideoTab();
    } finally {
        elements.analyzeVideoBtn.disabled = false;
    }
}

function handleVideoProgress(data) {
    switch(data.status) {
        case 'start':
            elements.videoProgressStatus.textContent = `Bắt đầu xử lý ${data.total_frames} frames...`;
            break;
        case 'progress':
            const progress = data.progress.toFixed(2);
            elements.videoProgressBar.style.width = `${progress}%`;
            elements.videoProgressBar.textContent = `${progress}%`;
            elements.videoProgressStatus.textContent = `Đã xử lý ${data.current_frame} / ${data.total_frames} frames.`;
            break;
        case 'done':
            showSuccess(data.message);
            displayVideoResult(data.filename, data.stats);
            elements.videoProgress.classList.add('hidden');
            break;
        case 'error':
            showError(data.error);
            resetVideoTab();
            break;
    }
}

function displayVideoResult(filename, stats) {
    const suspiciousClasses = new Set(['fraudulent']);
    const totalDetections = stats ? Object.values(stats.summary).reduce((a, b) => a + b, 0) : 0;
    
    let evidenceHtml = '';
    if (stats?.suspicious_frames?.length > 0) {
        evidenceHtml = `
        <div class="p-4 bg-red-50 border-t rounded-b-lg">
            <h5 class="font-medium text-red-800 mb-3">Khoảnh khắc đáng ngờ (hiển thị tối đa 20)</h5>
            <div class="flex space-x-4 overflow-x-auto pb-2">
                ${stats.suspicious_frames.map(frame => `<div class="evidence-thumbnail flex-shrink-0 w-48 bg-white rounded-lg shadow overflow-hidden cursor-pointer hover:ring-2 hover:ring-red-500 transition-all"><img src="/evidence/${frame.filename}" alt="Bằng chứng tại frame ${frame.frame_number}" class="w-full h-32 object-cover pointer-events-none"><div class="p-2 text-xs text-center text-gray-600 pointer-events-none">Frame: ${frame.frame_number}</div></div>`).join('')}
            </div>
        </div>`;
    }

    let statsHtml = '';
    if (stats) {
        const suspiciousFrameCount = stats.suspicious_frames_count || 0;
        statsHtml = `
        <div class="p-4 bg-white border-t space-y-4">
            <h4 class="font-medium text-gray-900 text-center">Thống kê toàn bộ video</h4>
            <div class="flex justify-around items-center text-center">
                <div><div class="text-3xl font-bold ${suspiciousFrameCount > 0 ? 'text-red-600' : 'text-green-600'}">${suspiciousFrameCount}</div><div class="text-sm text-gray-500">Frame đáng ngờ</div></div>
                <div><div class="text-3xl font-bold text-blue-600">${totalDetections}</div><div class="text-sm text-gray-500">Tổng phát hiện</div></div>
            </div>
            ${Object.keys(stats.summary).length > 0 ? `<div class="bg-gray-50 p-4 rounded-lg shadow-inner"><h5 class="font-medium text-gray-800 mb-2">Chi tiết phát hiện:</h5><ul class="space-y-2 max-h-48 overflow-y-auto">${Object.entries(stats.summary).map(([className, count]) => `<li class="flex justify-between items-center p-2 bg-white rounded"><span class="font-semibold ${suspiciousClasses.has(className.toLowerCase()) ? 'text-red-600' : 'text-gray-700'}">${className}</span><span class="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">${count} lần</span></li>`).join('')}</ul></div>` : ''}
        </div>`;
    }

    elements.videoResult.innerHTML = `
        <div class="bg-gray-100 rounded-lg shadow-lg overflow-hidden">
            <div class="bg-white"><div class="p-4 bg-blue-50 border-b"><h4 class="font-medium text-gray-900">Kết quả phân tích video</h4></div><div class="bg-black"><video src="/processed/${filename}" controls autoplay class="w-full h-auto">Trình duyệt của bạn không hỗ trợ thẻ video.</video></div>${statsHtml}</div>
            ${evidenceHtml}
            <div class="p-4 bg-gray-50 text-center space-x-4 border-t"><a href="/processed/${filename}" download class="inline-block bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700"><i class="fas fa-download mr-2"></i> Tải video</a><button onclick="resetVideoTab()" class="inline-block bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600"><i class="fas fa-undo mr-2"></i> Phân tích video khác</button></div>
        </div>`;
    elements.videoResult.classList.remove('hidden');
}

function resetVideoTab() {
    elements.videoInput.value = '';
    elements.videoPlaceholder.classList.remove('hidden');
    elements.videoProgress.classList.add('hidden');
    elements.videoResult.classList.add('hidden');
    elements.videoResult.innerHTML = '';
    elements.videoProgressBar.style.width = '0%';
    elements.videoProgressBar.textContent = '0%';
    elements.videoFileName.textContent = 'Hỗ trợ: MP4, AVI, MOV (Tối đa 500MB)';
    elements.analyzeVideoBtn.disabled = true;
}
// Để resetVideoTab có thể được gọi từ HTML, ta phải gắn nó vào window
window.resetVideoTab = resetVideoTab;


export function initializeVideoTab() {
    elements.videoInput.addEventListener('change', handleVideoSelection);
    elements.analyzeVideoBtn.addEventListener('click', analyzeVideo);
}