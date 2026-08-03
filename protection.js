/* ============================================
   CODE PROTECTION - Basic Level
   Erschwert das Kopieren des Quellcodes
   ============================================ */

// 1. Rechtsklick sperren
document.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showWarning('⚠️ Rechtsklick ist deaktiviert');
    return false;
});

// 2. Tastenkombinationen blockieren
document.addEventListener('keydown', function(e) {
    // F12 (DevTools)
    if (e.keyCode === 123) {
        e.preventDefault();
        showWarning('⚠️ DevTools sind blockiert');
        return false;
    }
    // Strg+U (Quelltext anzeigen)
    if (e.ctrlKey && e.keyCode === 85) {
        e.preventDefault();
        showWarning('⚠️ Quelltext-Anzeige ist blockiert');
        return false;
    }
    // Strg+Shift+I (DevTools öffnen)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 73) {
        e.preventDefault();
        showWarning('⚠️ DevTools sind blockiert');
        return false;
    }
    // Strg+Shift+J (Console öffnen)
    if (e.ctrlKey && e.shiftKey && e.keyCode === 74) {
        e.preventDefault();
        showWarning('⚠️ Console ist blockiert');
        return false;
    }
    // Strg+S (Speichern)
    if (e.ctrlKey && e.keyCode === 83) {
        e.preventDefault();
        return false;
    }
    // Strg+C (Kopieren) - nur außerhalb von Formularen
    if (e.ctrlKey && e.keyCode === 67) {
        const selection = window.getSelection().toString();
        if (selection.length > 0 && !isInputElement(e.target)) {
            // Erlauben in Eingabefeldern
        }
    }
});

// 3. DevTools-Erkennung
let devtoolsOpen = false;
const threshold = 160;

setInterval(function() {
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    
    if (widthDiff > threshold || heightDiff > threshold) {
        if (!devtoolsOpen) {
            devtoolsOpen = true;
            showWarning('⚠️ Bitte schließe die Developer Tools');
        }
    } else {
        devtoolsOpen = false;
    }
}, 1000);

// 4. Text-Selection für Nicht-Inhalts-Elemente blockieren
document.addEventListener('selectstart', function(e) {
    if (!isInputElement(e.target) && !isContentElement(e.target)) {
        e.preventDefault();
    }
});

// 5. Drag & Drop blockieren
document.addEventListener('dragstart', function(e) {
    if (e.target.tagName === 'IMG' || e.target.tagName === 'A') {
        e.preventDefault();
    }
});

// Helper: Ist es ein Eingabeelement?
function isInputElement(el) {
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

// Helper: Ist es ein Content-Element (wo Selektion erlaubt sein soll)?
function isContentElement(el) {
    // Erlaube Textauswahl in bestimmten Bereichen
    return el.closest('article, .selectable, p, h1, h2, h3, h4, h5, h6, li') !== null;
}

// Warning-Notification anzeigen
function showWarning(message) {
    const existing = document.getElementById('protection-warning');
    if (existing) existing.remove();
    
    const warning = document.createElement('div');
    warning.id = 'protection-warning';
    warning.textContent = message;
    warning.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: rgba(220, 38, 38, 0.95);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        font-family: 'Inter', sans-serif;
        font-size: 14px;
        font-weight: 500;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        animation: slideInRight 0.3s ease-out;
        backdrop-filter: blur(10px);
    `;
    document.body.appendChild(warning);
    
    setTimeout(() => {
        warning.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => warning.remove(), 300);
    }, 2500);
}

// CSS-Animationen einfügen
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOutRight {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);

// Console-Warnung für Entwickler
console.log('%c⚠️ Stopp!', 'color: #dc2626; font-size: 50px; font-weight: bold;');
console.log('%cDiese Website ist geschützt. Das Kopieren oder Verändern des Codes ist nicht gestattet.', 'color: #ffffff; font-size: 16px;');
console.log('%c© 2024 HighSociety De', 'color: #22c55e; font-size: 14px; font-weight: bold;');
