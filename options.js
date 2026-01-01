document.addEventListener('DOMContentLoaded', () => {
  const downloadDirInput = document.getElementById('downloadDir');
  const prependDateCheckbox = document.getElementById('prependDate');
  const dateFormatSelect = document.getElementById('dateFormat');
  const dateFormatContainer = document.getElementById('dateFormatContainer');
  const form = document.getElementById('settingsForm');
  const status = document.getElementById('status');
  const backupNowButton = document.getElementById('backupNow');

  // Show/hide date format dropdown based on checkbox state
  function updateDateFormatVisibility() {
    dateFormatContainer.style.display = prependDateCheckbox.checked ? 'block' : 'none';
  }

  prependDateCheckbox.addEventListener('change', updateDateFormatVisibility);

  // Load saved settings
  chrome.storage.local.get(['downloadDir', 'prependDate', 'dateFormat'], (data) => {
    if (data.downloadDir) {
      downloadDirInput.value = data.downloadDir;
    } else {
      // Set default value
      downloadDirInput.value = 'claude-conversations';
    }

    prependDateCheckbox.checked = data.prependDate || false;
    dateFormatSelect.value = data.dateFormat || 'YYYY-MM-DD';
    updateDateFormatVisibility();
  });

  // Save settings
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const downloadDir = downloadDirInput.value;
    const prependDate = prependDateCheckbox.checked;
    const dateFormat = dateFormatSelect.value;

    chrome.storage.local.set({ downloadDir, prependDate, dateFormat }, () => {
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
