document.addEventListener('DOMContentLoaded', () => {
  const backupButton = document.getElementById('backupNow');
  const forceBackupButton = document.getElementById('forceBackupNow');
  const openSettingsLink = document.getElementById('openSettings');
  const status = document.getElementById('status');
  const configStatus = document.getElementById('configStatus');
  const backupOptions = document.getElementById('backupOptions');
  const resultsContainer = document.getElementById('resultsContainer');
  
  // Load settings and update UI
  checkConfiguration();
  updateBackupResults();
  
  // Poll for backup status updates
  const statusInterval = setInterval(updateBackupResults, 2000);
  
  // Clear interval when popup closes
  window.addEventListener('unload', () => {
    clearInterval(statusInterval);
  });
  
  // Open settings page
  openSettingsLink.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
  
  // Backup (incremental)
  backupButton.addEventListener('click', () => {
    startBackup(false);
  });
  
  // Force full backup 
  forceBackupButton.addEventListener('click', () => {
    startBackup(true);
  });

  const openBrowserButton = document.getElementById('openBrowserButton');
  if (openBrowserButton) {
    openBrowserButton.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('browser.html') });
    });
  }
  
  // Function to start backup and show status
  function startBackup(forceFullBackup) {
    const action = forceFullBackup ? 'forceFullBackup' : 'backupNow';
    const backupType = forceFullBackup ? 'Full' : 'Incremental';
    
    showStatus(`Starting ${backupType.toLowerCase()} backup of conversations...`, 'info');
    
    // Start the backup
    chrome.runtime.sendMessage({ 
      action: action, 
    }, (backupResponse) => {
      if (chrome.runtime.lastError) {
        console.error("Error starting backup:", chrome.runtime.lastError);
        showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
      } else {
        console.log("Successfully started backup");
        showStatus(`${backupType} backup of conversations in progress...`, 'info');
        
        // Immediately check status
        updateBackupResults();
      }
    });
  }
  
  // Helper function to update backup results in the UI
  function updateBackupResults() {
    chrome.runtime.sendMessage({ action: 'getBackupResults' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.results) {
        console.error("Error getting backup results:", chrome.runtime.lastError);
        return;
      }
      
      const results = response.results;
      
      // Update results display
      if (resultsContainer) {
        if (results.inProgress) {
          resultsContainer.querySelector('.result-item').innerHTML = `
            <span class="badge in-progress">In Progress</span>
          `;
        } else if (results.lastResult === 'success') {
          resultsContainer.querySelector('.result-item').innerHTML = `          
            <span class="badge success">Success</span>
            <span class="result-details">${results.itemCount} items in ${results.duration}s
          `;
          if (results.lastTime) {
            resultsContainer.querySelector('.result-item').innerHTML += ` (${formatTimeAgo(results.lastTime)})`;
          }
        } else if (results.lastResult === 'error') {
          resultsContainer.querySelector('.result-item').innerHTML = `                    
            <span class="badge error">Error</span> ';
            <span class="result-details">${results.error}
          `;
          if (results.lastTime) {
            resultsContainer.querySelector('.result-item').innerHTML += ` (${formatTimeAgo(results.lastTime)})`;
          }
        } else {
          resultsContainer.querySelector('.result-item').innerHTML = `
            <span class="result-details">No recent backups</span>
          `;
        }
      }
    });
  }
  
  // Helper function to format time ago
  function formatTimeAgo(timeStr) {
    const date = new Date(timeStr);
    const now = new Date();
    const diffMs = now - date;
    
    // Convert to seconds
    const diffSec = Math.floor(diffMs / 1000);
    
    if (diffSec < 60) {
      return 'just now';
    } else if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      return `${mins} minute${mins > 1 ? 's' : ''} ago`;
    } else if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else {
      const days = Math.floor(diffSec / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    }
  }
  
  // Helper function to show status messages
  function showStatus(message, type) {
    status.textContent = message;
    status.className = 'status ' + type;
    status.style.display = 'block';
  }
  
  // Helper function to check configuration and update UI
  function checkConfiguration() {
    chrome.storage.local.get(['downloadDir', 'lastBackupState'], (data) => {
      // Check if the extension is properly configured
      if (!data.downloadDir) {
        configStatus.innerHTML = `
          <div class="status error">
            <strong>Extension not fully configured.</strong><br>
            Please open settings to set up your backup location.
          </div>
        `;
        backupOptions.style.display = 'none';
      } else {
        configStatus.innerHTML = '';
        backupOptions.style.display = 'block';
        
        // Update stats in the UI
        updateSyncStats(data.lastBackupState);
      }
    });
  }
  
  // Helper function to update sync stats in the UI
  function updateSyncStats(lastBackupState) {
    const statsElement = document.getElementById('stats');
    
    if (Object.keys(lastBackupState).length > 0) {
      // Find the most recent update time
      const mostRecent = new Date(Math.max(...Object.values(lastBackupState).map(o => Date.parse(o))));
      statsElement.textContent = `${Object.keys(lastBackupState).length} conversations cached (last updated: ${mostRecent.toLocaleString()})`;
    } else {
      statsElement.textContent = 'No conversations cached yet';
    }
  }
});
