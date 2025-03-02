document.addEventListener('DOMContentLoaded', () => {
  const downloadDirInput = document.getElementById('downloadDir');
  const form = document.getElementById('settingsForm');
  const status = document.getElementById('status');
  const backupNowButton = document.getElementById('backupNow');

  // Load saved settings
  chrome.storage.local.get(['downloadDir'], (data) => {
    if (data.downloadDir) {
      downloadDirInput.value = data.downloadDir;
    } else {
      // Set default value
      downloadDirInput.value = 'claude-conversations';
    }
  });

  // Save settings
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const downloadDir = downloadDirInput.value;

    chrome.storage.local.set({ downloadDir }, () => {
      status.textContent = 'Settings saved!';
      status.className = 'status success';
      status.style.display = 'block';
      
      setTimeout(() => {
        status.style.display = 'none';
      }, 3000);
    });
  });
  
  // Backup now button
  backupNowButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'backupNow' });
    status.textContent = 'Backup started! Check your downloads folder when complete.';
    status.className = 'status success';
    status.style.display = 'block';
    
    setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  });
});
