// Additional JavaScript for enhanced functionality

// Copy code blocks
document.addEventListener('click', function(e) {
    if (e.target.closest('pre code')) {
        const code = e.target.closest('pre code');
        copyToClipboard(code.textContent);
        showNotification('Code copied to clipboard!');
    }
});

// Copy to clipboard function
function copyToClipboard(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + / for settings
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        document.getElementById('settingsBtn').click();
    }
    
    // Ctrl/Cmd + N for new chat
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        document.getElementById('newChatBtn').click();
    }
    
    // Escape to close sidebar
    if (e.key === 'Escape' && window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('active')) {
            toggleSidebar();
        }
    }
});

// Auto-save scroll position
let scrollPosition = 0;

function saveScrollPosition() {
    scrollPosition = messagesContainer.scrollTop;
}

function restoreScrollPosition() {
    messagesContainer.scrollTop = scrollPosition;
}

// Add scroll event listener
messagesContainer.addEventListener('scroll', saveScrollPosition);

// Image handling (if you want to add image support later)
function handleImageUpload(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            resolve(e.target.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Markdown rendering (optional enhancement)
function renderMarkdown(markdown) {
    // Simple markdown to HTML conversion
    let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/!\[(.*?)\]\((.*?)\)/gim, '<img alt="$1" src="$2">')
        .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')
        .replace(/\n$/gim, '<br>');
    
    return html;
}

// Performance optimization
let lastScrollTime = 0;
const SCROLL_THROTTLE = 100; // ms

messagesContainer.addEventListener('scroll', function() {
    const now = Date.now();
    if (now - lastScrollTime > SCROLL_THROTTLE) {
        lastScrollTime = now;
        // Perform heavy operations here
    }
});

// Service Worker for PWA (optional)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/sw.js').then(function(registration) {
            console.log('ServiceWorker registration successful');
        }, function(err) {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}

// Install prompt for PWA
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    
    // Show install button
    const installBtn = document.createElement('button');
    installBtn.textContent = 'Install WormGPT';
    installBtn.className = 'btn btn-primary';
    installBtn.style.position = 'fixed';
    installBtn.style.bottom = '20px';
    installBtn.style.right = '20px';
    installBtn.style.zIndex = '1000';
    installBtn.onclick = installApp;
    
    document.body.appendChild(installBtn);
    
    setTimeout(() => {
        installBtn.remove();
    }, 10000);
});

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('User accepted install');
            }
            deferredPrompt = null;
        });
    }
}