// static/js/modules/utils.js

// Lấy các DOM elements cho toast
const errorToast = document.getElementById('errorToast');
const errorMessage = document.getElementById('errorMessage');
const successToast = document.getElementById('successToast');
const successMessage = document.getElementById('successMessage');

function showToast(toastElem, messageElem, message, duration) {
    if (!toastElem || !messageElem) return;
    messageElem.textContent = message;
    toastElem.classList.remove('translate-x-full');
    setTimeout(() => toastElem.classList.add('translate-x-full'), duration);
}

export function showError(message) {
    showToast(errorToast, errorMessage, message, 5000);
}

export function showSuccess(message) {
    showToast(successToast, successMessage, message, 3000);
}

export function validateFile(file, allowedTypes, maxSizeMB) {
    if (!file) return false;
    const maxSize = maxSizeMB * 1024 * 1024;
    return allowedTypes.includes(file.type) && file.size <= maxSize;
}