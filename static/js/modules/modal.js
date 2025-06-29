// static/js/modules/modal.js

const elements = {
    loadingModal: document.getElementById('loadingModal'),
    loadingMessage: document.getElementById('loadingMessage'),
    imageModal: document.getElementById('imageModal'),
    modalImage: document.getElementById('modalImage'),
    closeModalBtn: document.getElementById('closeModalBtn')
};

// --- Loading Modal ---
export function showLoading(message = 'Đang xử lý...') {
    if (elements.loadingMessage) elements.loadingMessage.textContent = message;
    if (elements.loadingModal) elements.loadingModal.classList.remove('hidden');
}

export function hideLoading() {
    if (elements.loadingModal) elements.loadingModal.classList.add('hidden');
}

// --- Image Viewer Modal ---
function openImageModal(imageUrl) {
    if (!elements.imageModal || !elements.modalImage) return;
    elements.modalImage.src = imageUrl;
    elements.imageModal.classList.remove('hidden');
}

function closeImageModal() {
    if (!elements.imageModal || !elements.modalImage) return;
    elements.imageModal.classList.add('hidden');
    elements.modalImage.src = '';
}

export function initializeImageModal() {
    if (!elements.imageModal || !elements.closeModalBtn) return;
    
    elements.closeModalBtn.addEventListener('click', closeImageModal);
    elements.imageModal.addEventListener('click', (e) => {
        if (e.target === elements.imageModal) closeImageModal();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !elements.imageModal.classList.contains('hidden')) {
            closeImageModal();
        }
    });

    // Event delegation cho tất cả các thumbnail có thể click
    document.addEventListener('click', function(e) {
        const thumbnail = e.target.closest('.evidence-thumbnail');
        if (thumbnail) {
            const imageUrl = thumbnail.querySelector('img').src;
            openImageModal(imageUrl);
        }
    });
}