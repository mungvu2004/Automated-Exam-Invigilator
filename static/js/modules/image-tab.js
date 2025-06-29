// static/js/modules/image-tab.js

import { showError, showSuccess, validateFile } from './utils.js';
import { showLoading, hideLoading } from './modal.js';

const elements = {
    imageInput: document.getElementById('imageInput'),
    analyzeImageBtn: document.getElementById('analyzeImageBtn'),
    imageResults: document.getElementById('imageResults'),
    imagePreviewContainer: document.getElementById('imagePreviewContainer'),
    imagePreview: document.getElementById('imagePreview'),
    clearImageResultsBtn: document.getElementById('clearImageResultsBtn'),
    imageDefaultPlaceholder: document.getElementById('imageResults').innerHTML,
};

function handleImageSelection(e) {
    const file = e.target.files[0];
    if (validateFile(file, ['image/jpeg', 'image/png', 'image/gif'], 500)) {
        elements.analyzeImageBtn.disabled = false;
        const reader = new FileReader();
        reader.onload = e => {
            elements.imagePreview.src = e.target.result;
            elements.imagePreviewContainer.classList.remove('hidden');
        };
        reader.readAsDataURL(file);
    } else {
        elements.analyzeImageBtn.disabled = true;
        resetImageTab();
        if (file) showError('File không hợp lệ. Chọn file ảnh (JPG, PNG) dưới 500MB.');
    }
}

async function analyzeImage() {
    const file = elements.imageInput.files[0];
    if (!file) return showError('Vui lòng chọn ảnh để phân tích');
    
    const formData = new FormData();
    formData.append('file', file);
    
    showLoading('Đang phân tích ảnh...');
    try {
        const response = await fetch('/detect/image', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok && result.success) {
            displayImageResults(result);
            showSuccess(result.message || 'Phân tích ảnh thành công!');
        } else {
            showError(result.error || 'Lỗi không xác định từ server.');
            resetImageTab();
        }
    } catch (error) {
        showError('Lỗi kết nối: ' + error.message);
        resetImageTab();
    } finally {
        hideLoading();
    }
}

function displayImageResults({ image, detections, cheating_count }) {
    const suspiciousClasses = new Set(['fraudulent']);
    elements.imageResults.innerHTML = `
        <div class="space-y-4 w-full">
            <img src="data:image/jpeg;base64,${image}" alt="Kết quả phân tích" class="max-w-full h-auto rounded-lg shadow-lg mx-auto">
            <div class="bg-white p-4 rounded-lg shadow-inner">
                <h4 class="font-medium text-gray-900 mb-3 text-center">Thống kê phát hiện</h4>
                <div class="flex justify-around items-center text-center">
                    <div><div class="text-3xl font-bold ${cheating_count > 0 ? 'text-red-600' : 'text-green-600'}">${cheating_count}</div><div class="text-sm text-gray-500">Hành vi đáng ngờ</div></div>
                    <div><div class="text-3xl font-bold text-blue-600">${detections.length}</div><div class="text-sm text-gray-500">Tổng phát hiện</div></div>
                </div>
            </div>
            ${detections.length > 0 ? `<div class="bg-white p-4 rounded-lg shadow-inner"><h4 class="font-medium text-gray-900 mb-2">Chi tiết:</h4><ul class="space-y-2 max-h-40 overflow-y-auto">${detections.map(det => `<li class="flex justify-between items-center p-2 bg-gray-50 rounded"><span class="font-semibold ${suspiciousClasses.has(det.class.toLowerCase()) ? 'text-red-600' : 'text-green-600'}">${det.class}</span><span class="text-sm bg-blue-100 text-blue-800 px-2 py-1 rounded-full">${(det.confidence * 100).toFixed(1)}%</span></li>`).join('')}</ul></div>` : ''}
        </div>`;
    elements.clearImageResultsBtn.classList.remove('hidden');
}

function resetImageTab() {
    elements.imageInput.value = '';
    elements.imagePreview.src = '#';
    elements.imagePreviewContainer.classList.add('hidden');
    elements.imageResults.innerHTML = elements.imageDefaultPlaceholder;
    elements.analyzeImageBtn.disabled = true;
    elements.clearImageResultsBtn.classList.add('hidden');
}

export function initializeImageTab() {
    elements.imageInput.addEventListener('change', handleImageSelection);
    elements.analyzeImageBtn.addEventListener('click', analyzeImage);
    elements.clearImageResultsBtn.addEventListener('click', resetImageTab);
}