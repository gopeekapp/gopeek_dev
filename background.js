let updateTimeout = null;

// SECURITY FIX: Centralized garbage collection for temporary session rules
function clearSessionRules(tabId = null) {
    if (tabId !== null) {
        chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });
        activeBypassTabs.delete(tabId); // Keep cache perfectly in sync
    } else {
        // Clear all session rules on startup/install to prevent leakage
        chrome.declarativeNetRequest.getSessionRules((rules) => {
            const ruleIds = rules.map(rule => rule.id);
            if (ruleIds.length > 0) chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: ruleIds });
        });
        activeBypassTabs.clear(); // Wipe cache on global reset
    }
}

chrome.tabs.onRemoved.addListener((tabId) => {
    clearSessionRules(tabId); // Scrub the rule and cache when the tab is closed
});

chrome.runtime.onInstalled.addListener(() => {
    clearSessionRules();
});
chrome.runtime.onStartup.addListener(() => {
    clearSessionRules();
});


// =========================================================
// SCALABLE CACHE: Tracks multiple tabs independently
// =========================================================
const activeBypassTabs = new Set(); 

// Primary Message Bus
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    
    if (request.action === "enable_bypass") {
        const tabId = sender.tab.id;
        
        // SPEED HACK: If THIS specific tab already has the bypass active, instantly resolve!
        if (activeBypassTabs.has(tabId)) {
            if (sendResponse) sendResponse({success: true});
            return true;
        }
        
        activeBypassTabs.add(tabId); // Lock in the cache for this tab
        
        chrome.declarativeNetRequest.updateSessionRules({
            removeRuleIds: [tabId], 
            addRules: [{
                id: tabId, 
                priority: 1,
                action: {
                    type: "modifyHeaders",
                    responseHeaders: [
                        { header: "x-frame-options", operation: "remove" },
                        { header: "frame-options", operation: "remove" },
                        { header: "content-security-policy", operation: "remove" }
                    ]
                },
                condition: {
                    tabIds: [tabId], 
                    resourceTypes: ["sub_frame"] 
                }
            }]
        }).then(() => { if (sendResponse) sendResponse({success: true}); });
        return true; 
    }

    if (request.action === "disable_bypass") {
        const tabId = sender.tab.id;
        clearSessionRules(tabId); // Handles both the DNR engine and the Set() cache
        if (sendResponse) sendResponse({success: true});
        return true;
    }

});