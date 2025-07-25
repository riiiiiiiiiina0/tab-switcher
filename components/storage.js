/**
 * @typedef {Object} TabData
 * @property {number} id - The tab ID
 * @property {number} lastActive - The timestamp of the last active time
 * @property {string} [title] - The title of the tab (optional)
 * @property {string} [favIconUrl] - The favicon URL of the tab (optional)
 * @property {string} [screenshot] - The screenshot of the tab (optional)
 */

/**
 * Save the screenshot of the tab to local storage
 * @param {number} id - The tab ID
 * @param {TabData} tabData - The tab data to save
 */
export function saveTabData(id, tabData) {
  chrome.storage.local.set({ [`tab-${id}`]: tabData }, () => {
    // console.log(`Screenshot saved for tab ${id}`);
    // console.log(
    //   '%c ',
    //   `font-size:300px; background:url(${resizedDataUrl}) no-repeat; background-size: contain;`,
    // );
  });
}

/**
 * Retrieves a list of tab data objects for all tabs in the current window,
 * sorted by their lastActive timestamp in descending order (most recent first).
 * Only tab data with an id matching a tab in the current window are included.
 *
 * @param {number} activeTabId - The ID of the active tab
 * @param {function(Array<TabData>): void} callback - Function to call with the resulting array of tab data objects.
 */
export function getTabDataList(activeTabId, callback) {
  // 1. Get all tabs in the current window
  chrome.tabs.query({ currentWindow: true }, (tabs) => {
    // Build a quick lookup so we can patch stored data with the latest info.
    /** @type {Map<number, chrome.tabs.Tab>} */
    const liveTabMap = new Map(
      tabs
        .filter((t) => typeof t.id === 'number')
        .map((t) => [/** @type {number} */ (t.id), t]),
    );

    const currentTabIds = new Set(liveTabMap.keys());

    // 2. Retrieve everything stored in chrome.storage.local
    chrome.storage.local.get(null, (items) => {
      const storedTabs = new Map(
        Object.values(items)
          .filter((item) => item && currentTabIds.has(item.id))
          .map((item) => [item.id, item]),
      );

      const tabDataList = /** @type {TabData[]} */ (
        tabs
          // 3. Filter out tabs that don't have a URL or a valid ID
          .filter(
            (tab) =>
              tab.url &&
              tab.url.startsWith('http') &&
              typeof tab.id === 'number',
          )
          // 4. Map the tabs to tab data objects
          .map((tab) => {
            const stored = storedTabs.get(tab.id);
            return {
              id: tab.id,
              lastActive: stored ? stored.lastActive : 0,
              title: tab.title,
              url: tab.url,
              favIconUrl: tab.favIconUrl,
              screenshot: stored ? stored.screenshot : undefined,
            };
          })
          // 5. Sort by lastActive in descending order (most recent first)
          .sort((a, b) => {
            if (a.id === activeTabId) return -1;
            if (b.id === activeTabId) return 1;
            return b.lastActive - a.lastActive;
          })
      );
      callback(tabDataList);
    });
  });
}
