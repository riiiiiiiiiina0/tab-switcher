(() => {
  // stop if the overlay already exists
  const existingOverlay = document.getElementById('tab-switcher-overlay');
  if (existingOverlay) return;

  /** @type {HTMLDivElement | null} */
  let overlay = null;

  /** @type {Array<any>} */
  let currentTabData = [];
  let selectedIndex = 0;

  // Track currently pressed keys so we know when all keys have been released
  let triggerHotkey = new Set();

  const onKeyDown = (e) => {
    if (e.key === 'ArrowRight') {
      selectNextTab();
    } else if (e.key === 'ArrowLeft') {
      selectPreviousTab();
    } else if (e.key === 'Enter') {
      activateTab(selectedIndex);
    } else if (e.key === 'Escape') {
      destroyOverlay();
    }
  };

  const onKeyUp = (e) => {
    triggerHotkey.delete(e.key.toLowerCase());
    if (overlay && triggerHotkey.size === 0) {
      activateTab(selectedIndex);
    }
  };

  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });

  // Dismiss overlay when the tab/page becomes hidden (e.g., user switches tabs or minimizes window)
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      destroyOverlay();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange, {
    capture: true,
  });

  // Request the latest tab data from the background script as soon as the
  // content script is executed.
  chrome.runtime.sendMessage({ type: 'request_tab_data' }, (response) => {
    if (response && response.type === 'tab_data') {
      const { tabData, shortcut } = response;
      if (Array.isArray(tabData) && tabData.length) {
        if (
          document.readyState === 'complete' ||
          document.readyState === 'interactive'
        ) {
          renderTabs(tabData);
        } else {
          document.addEventListener(
            'DOMContentLoaded',
            () => renderTabs(tabData),
            { once: true },
          );
        }
      }
      if (shortcut) {
        const isWindows = navigator.userAgent.includes('Windows');
        const shortcutKeys = isWindows
          ? shortcut.split('+') // Windows uses + to separate keys
          : shortcut.split('').slice(0, -1); // on Mac, the last key in the shortcut is not captured by the keyup event, so we remove it

        const keys = shortcutKeys.map((key) => {
          switch (key.toLowerCase()) {
            // handle mac modifier key symbols
            case '⌘':
              return 'meta';
            case '⌥':
              return 'alt';
            case '⇧':
              return 'shift';
            case '⌃':
            case 'ctrl':
              return 'control';
            default:
              return key.toLowerCase();
          }
        });
        triggerHotkey = new Set(keys);
      }
    }
  });

  // Inject base styles for the overlay
  function injectStyles() {
    if (document.getElementById('tab-switcher-styles')) return;
    const style = document.createElement('style');
    style.id = 'tab-switcher-styles';
    style.textContent = `
      #tab-switcher-overlay {
        position: fixed !important;
        top: 50% !important;
        left: 50% !important;
        transform: translate(-50%, -50%) !important;
        width: auto !important;
        height: 100% !important;
        display: flex !important;
        align-items: center !important;
        z-index: 2147483647 !important; /* Max z-index */
        flex-direction: row !important;
        height: auto !important;
        max-width: 90vw !important;
        overflow-x: auto !important;
        gap: 12px !important;
        background: rgba(255, 255, 255, 0.95) !important;
        padding: 16px 20px !important;
        border-radius: 12px !important;
        border: 1px solid rgba(0, 0, 0, 0.15) !important;
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.25) !important;
        backdrop-filter: blur(10px) !important;
        transition: opacity 150ms ease !important;
      }
      .tab-switcher-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        align-items: center;
        cursor: pointer;
        width: 180px;
        min-width: 180px;
      }
      .tab-switcher-item .thumbnail {
        width: 100%;
        height: 110px;
        object-fit: cover;
        border-radius: 6px;
      }
      .tab-switcher-item span {
        font-size: 13px;
        color: #222;
        font-family: "Arial Rounded MT", "Arial Rounded MT Bold", Arial, sans-serif;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        max-width: 100%;
      }
      /* New: title container with favicon */
      .tab-switcher-item .title-container {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
      }
      .tab-switcher-item .favicon {
        width: 16px;
        height: 16px;
        margin: 0;
        flex-shrink: 0;
      }
      .favicon-placeholder {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background-color: #ccc;
        flex-shrink: 0;
      }
      .tab-switcher-item.selected .thumbnail {
        outline: 6px solid #1573ff;
        outline-offset: -3px;
      }
      /* Dark mode overrides */
      @media (prefers-color-scheme: dark) {
        #tab-switcher-overlay {
          background: rgba(40, 40, 40, 0.95) !important;
          box-shadow: 0 4px 24px rgba(0, 0, 0, 0.75) !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }
        .tab-switcher-item span {
          color: #eee !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function createOverlay() {
    injectStyles();
    overlay = document.createElement('div');
    overlay.id = 'tab-switcher-overlay';

    // Make the overlay focusable and ensure it captures keyboard events
    overlay.tabIndex = -1;
    overlay.style.outline = 'none'; // Remove default focus outline

    overlay.addEventListener('click', (e) => {
      // Stop click from propagating to the page beneath
      e.stopPropagation();
    });

    // Add keyboard event listeners directly to the overlay for better capture
    overlay.addEventListener('keydown', onKeyDown, { capture: true });
    overlay.addEventListener('keyup', onKeyUp, { capture: true });

    document.body.appendChild(overlay);

    // Focus the overlay to ensure it receives keyboard events
    overlay.focus();
  }

  function destroyOverlay() {
    if (overlay) {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });

      // Remove event listeners from the overlay element
      overlay.removeEventListener('keydown', onKeyDown, { capture: true });
      overlay.removeEventListener('keyup', onKeyUp, { capture: true });

      chrome.runtime.onMessage.removeListener(onMessage);
      // Remove visibilitychange listener
      document.removeEventListener('visibilitychange', onVisibilityChange, {
        capture: true,
      });
      overlay.remove();
      overlay = null;
    }
  }

  function renderTabs(tabs) {
    currentTabData = tabs;

    // Start with the last tab selected
    selectedIndex = currentTabData.length > 1 ? 1 : 0;

    if (!overlay) createOverlay();

    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    if (!overlay) return; // safety
    overlay.innerHTML = '';

    currentTabData.forEach((tab, idx) => {
      const item = document.createElement('div');
      item.className =
        'tab-switcher-item' + (idx === selectedIndex ? ' selected' : '');
      item.dataset.tabId = String(tab.id);

      if (tab.screenshot) {
        const img = document.createElement('img');
        img.className = 'thumbnail';
        img.src = tab.screenshot;
        img.alt = tab.title || 'Tab thumbnail';
        item.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'thumbnail';
        placeholder.style.backgroundColor = '#f0f0f0';
        item.appendChild(placeholder);
      }

      const titleContainer = document.createElement('div');
      titleContainer.className = 'title-container';

      const createFaviconPlaceholder = () => {
        const placeholder = document.createElement('div');
        placeholder.className = 'favicon-placeholder';
        return placeholder;
      };

      // Favicon (small icon next to title)
      if (tab.favIconUrl) {
        const faviconImg = document.createElement('img');
        faviconImg.className = 'favicon';
        faviconImg.src = tab.favIconUrl;
        faviconImg.alt = 'favicon';

        // If the image fails to load, replace it with a placeholder
        faviconImg.onerror = () => {
          faviconImg.replaceWith(createFaviconPlaceholder());
        };
        titleContainer.appendChild(faviconImg);
      } else {
        // If there's no favicon URL, show the placeholder directly
        titleContainer.appendChild(createFaviconPlaceholder());
      }

      const title = document.createElement('span');
      title.textContent = tab.title || tab.url;
      titleContainer.appendChild(title);

      item.appendChild(titleContainer);

      overlay?.appendChild(item);
    });
  }

  function updateSelection() {
    if (!currentTabData.length) return;
    const items = document.querySelectorAll(
      '#tab-switcher-overlay .tab-switcher-item',
    );
    if (!items.length) return;
    items.forEach((el) => el.classList.remove('selected'));
    const current = items[selectedIndex];
    if (current) {
      current.classList.add('selected');
      current.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'center',
      });
    }
  }

  function selectNextTab() {
    if (!overlay) return;
    selectedIndex = (selectedIndex + 1) % currentTabData.length;
    updateSelection();
  }

  function selectPreviousTab() {
    if (!overlay) return;
    selectedIndex =
      (selectedIndex - 1 + currentTabData.length) % currentTabData.length;
    updateSelection();
  }

  function onMessage(message) {
    if (!message) return;
    if (message.type === 'advance_selection') {
      selectNextTab();
    }
  }

  chrome.runtime.onMessage.addListener(onMessage);

  function activateTab(index) {
    // cleanup
    destroyOverlay();

    const tab = currentTabData[index];
    if (tab) {
      chrome.runtime.sendMessage({ type: 'activate_tab', id: tab.id });
    }
  }
})();
