// Set up a recurring alarm every eight hours
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('fetchConversationsAlarm', { periodInMinutes: 480 });
});

const backupResults = {
  inProgress: false,
  lastResult: null,
  lastTime: null,
  itemCount: 0,
  duration: 0
};

// Listen for the alarm and fetch conversations
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchConversationsAlarm') {
    fetchAndSaveConversations();
  }
});

// Also fetch when the user clicks the extension icon
chrome.action.onClicked.addListener(() => {
  fetchAndSaveConversations();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'backupNow') {
    fetchAndSaveConversations();
    sendResponse({ success: true });    
  } else if (message.action === 'forceFullBackup') {
    fetchAndSaveConversations(true);
    sendResponse({ success: true });
  } else if (message.action === 'getBackupStatus') {
    sendResponse({ inProgress: backupResults.inProgress });
  } else if (message.action === 'getBackupResults') {
    sendResponse({ results: backupResults });
  }
  return true;
});

async function fetchAndSaveConversations(forceFullBackup = false) {

  backupResults.inProgress = true;
  backupResults.lastResult = null;

  updateBadge();
  
  chrome.storage.local.get(['downloadDir', 'lastBackupState'], async (settings) => {
    const downloadDir = settings.downloadDir || 'claude-conversations';
    const lastBackupState = settings.lastBackupState || {}; // UUID -> timestamp mapping
    
    try {
      // Step 1: Fetch organizations to find the one with chat capabilities
      const orgsResponse = await fetch('https://claude.ai/api/organizations');
      
      if (!orgsResponse.ok) {
        throw new Error(`Failed to fetch organizations: ${orgsResponse.status}`);
      }
      
      const organizations = await orgsResponse.json();
      
      // Find organization with chat capabilities
      const chatOrg = organizations.find(org => 
        org.capabilities && org.capabilities.includes('chat')
      );
      
      if (!chatOrg) {
        throw new Error('No organization with chat capabilities found');
      }
      
      console.log(`Found chat organization: ${chatOrg.name} (${chatOrg.uuid})`);
      
      // Step 2: Fetch all conversations with pagination
      let allConversations = [];
      let offset = 0;
      const limit = 50;
      let fetchStartTime = Date.now();
      
      while (true) {
        const conversationsUrl = `https://claude.ai/api/organizations/${chatOrg.uuid}/chat_conversations?limit=${limit}&offset=${offset}`;
        const conversationsResponse = await fetch(conversationsUrl);
        
        if (!conversationsResponse.ok) {
          throw new Error(`Failed to fetch conversations: ${conversationsResponse.status}`);
        }
        
        const conversations = await conversationsResponse.json();
        
        // If no more conversations, break the loop
        if (!conversations.length) {
          break;
        }
        
        allConversations = [...allConversations, ...conversations];
        console.log(`Fetched ${conversations.length} conversations, total: ${allConversations.length}`);
        
        offset += limit;
      }

      // Track which conversations we update and their timestamps
      const newBackupState = {};
      let updatedCount = 0;
      
    
      // Step 3: Fetch full details for each conversation that has been updated
      for (const conversation of allConversations) {
        const lastDownloaded = lastBackupState[conversation.uuid];
        const updatedAt = new Date(conversation.updated_at);
        
        // Skip if we've downloaded this conversation before and it hasn't changed
        if (lastDownloaded && new Date(lastDownloaded) >= updatedAt) {
          if (!forceFullBackup) {
            console.log(`Skipping unchanged conversation: ${conversation.name}`);
            newBackupState[conversation.uuid] = lastDownloaded;
            continue;
          }
        }
        
        // This conversation needs updating
        console.log(`Updating changed conversation: ${conversation.name}`);
        updatedCount++;
        
        // Only fetch details for conversations that need updating
        const detailUrl = `https://claude.ai/api/organizations/${chatOrg.uuid}/chat_conversations/${conversation.uuid}?tree=True&rendering_mode=messages&render_all_tools=true`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          console.error(`Failed to fetch conversation ${conversation.uuid}: ${detailResponse.status}`);
          continue;
        }
        
        const conversationDetail = await detailResponse.json();
        
        // Save updated conversation
        await saveConversationToFile(
          conversationDetail, 
          downloadDir, 
          `${(conversation.name || 'Untitled Conversation').replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${conversation.uuid}`
        );
        
        // Update our backup state with current timestamp
        newBackupState[conversation.uuid] = new Date().toISOString();
      }
      
      // Create the index as before
      const conversationIndex = allConversations.map(conv => ({
        uuid: conv.uuid,
        name: conv.name || 'Untitled Conversation',
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        is_starred: conv.is_starred,
        last_downloaded: newBackupState[conv.uuid] || null
      }));
      
      // Save the index
      await saveConversationToFile(
        conversationIndex,
        downloadDir,
        'conversation_index'
      );
      
      // Update our backup state in chrome storage
      chrome.storage.local.set({ lastBackupState: newBackupState });

      const message = `Backup complete. Updated ${updatedCount} of ${allConversations.length} conversations.`;
      console.log(message);
      backupResults.inProgress = false;
      backupResults.lastResult = 'success';
      backupResults.lastTime = new Date();
      backupResults.itemCount = updatedCount;
      backupResults.duration = Math.round((Date.now() - fetchStartTime) / 1000);
      backupResults.error = '';
      backupResults.message = message;
      updateBadge();
      
    } catch (error) {
      backupResults.inProgress = false;
      backupResults.lastResult = 'success';
      backupResults.lastTime = new Date();
      backupResults.itemCount = 0;
      backupResults.duration = 0;
      backupResults.error = error;
      backupResults.message = '';
      updateBadge();
      console.error('Error fetching Claude.ai conversations', error);
    }
  });
}

function updateBadge() {
  // Check if any backups are in progress
  const anyInProgress = backupResults.inProgress;
  
  if (anyInProgress) {
    // Show a badge indicating backup in progress
    chrome.action.setBadgeText({ text: "⏳" });
    chrome.action.setBadgeBackgroundColor({ color: "#0366d6" });
  } else {
    const success = backupResults.lastResult === 'success';
    const error = backupResults.lastResult === 'error';
    
    if (success) {
      // Show success badge
      chrome.action.setBadgeText({ text: "✓" });
      chrome.action.setBadgeBackgroundColor({ color: "#28a745" });
      
      // Clear badge after 30 seconds
      setTimeout(() => {
        chrome.action.setBadgeText({ text: "" });
      }, 30000);
    } else if (error) {
      // Show error badge
      chrome.action.setBadgeText({ text: "!" });
      chrome.action.setBadgeBackgroundColor({ color: "#dc3545" });
    } else {
      // Clear badge
      chrome.action.setBadgeText({ text: "" });
    }
  }
}

async function saveConversationToFile(conversationData, downloadDir, fileName) {
  try {
    await chrome.downloads.setUiOptions({ enabled: false });
    await chrome.downloads.setShelfEnabled(false);
    
    const conversationContent = JSON.stringify(conversationData, null, 2);
    const blobUrl = `data:application/json;charset=utf-8,${encodeURIComponent(conversationContent)}`;
    const filePath = `${downloadDir}/${fileName}.json`;
    
    await chrome.downloads.download({
      url: blobUrl,
      filename: filePath,
      saveAs: false,
      conflictAction: "overwrite",
    });
    
    // Clean up from download history
    await chrome.downloads.erase({ filenameRegex: filePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') });
    
  } catch (error) {
    console.error(`Error saving conversation ${fileName}:`, error);
  } finally {
    await chrome.downloads.setShelfEnabled(true);
    await chrome.downloads.setUiOptions({ enabled: true });
  }
}
