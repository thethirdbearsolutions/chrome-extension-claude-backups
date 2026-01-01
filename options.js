document.addEventListener('DOMContentLoaded', () => {
  const downloadDirInput = document.getElementById('downloadDir');
  const prependDateCheckbox = document.getElementById('prependDate');
  const dateFormatSelect = document.getElementById('dateFormat');
  const dateFormatContainer = document.getElementById('dateFormatContainer');
  const migrationWarning = document.getElementById('migrationWarning');
  const form = document.getElementById('settingsForm');
  const status = document.getElementById('status');
  const backupNowButton = document.getElementById('backupNow');
  const forceFullBackupButton = document.getElementById('forceFullBackup');

  // Track initial values to detect changes
  let savedPrependDate = false;
  let savedDateFormat = 'YYYY-MM-DD';

  // Show/hide date format dropdown based on checkbox state
  function updateDateFormatVisibility() {
    dateFormatContainer.style.display = prependDateCheckbox.checked ? 'block' : 'none';
  }

  // Show warning if filename format settings have changed
  function updateMigrationWarning() {
    const hasChanges = prependDateCheckbox.checked !== savedPrependDate ||
      (prependDateCheckbox.checked && dateFormatSelect.value !== savedDateFormat);
    migrationWarning.style.display = hasChanges ? 'block' : 'none';
  }

  prependDateCheckbox.addEventListener('change', () => {
    updateDateFormatVisibility();
    updateMigrationWarning();
  });

  dateFormatSelect.addEventListener('change', updateMigrationWarning);

  // Load saved settings
  chrome.storage.local.get(['downloadDir', 'prependDate', 'dateFormat'], (data) => {
    if (data.downloadDir) {
      downloadDirInput.value = data.downloadDir;
    } else {
      // Set default value
      downloadDirInput.value = 'claude-conversations';
    }

    savedPrependDate = data.prependDate || false;
    savedDateFormat = data.dateFormat || 'YYYY-MM-DD';

    prependDateCheckbox.checked = savedPrependDate;
    dateFormatSelect.value = savedDateFormat;
    updateDateFormatVisibility();
  });

  // Save settings
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const downloadDir = downloadDirInput.value;
    const prependDate = prependDateCheckbox.checked;
    const dateFormat = dateFormatSelect.value;

    chrome.storage.local.set({ downloadDir, prependDate, dateFormat }, () => {
      // Update saved values so warning disappears
      savedPrependDate = prependDate;
      savedDateFormat = dateFormat;
      updateMigrationWarning();

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

  // Force full backup button
  forceFullBackupButton.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'forceFullBackup' });
    status.textContent = 'Force full backup started! All conversations will be re-downloaded.';
    status.className = 'status success';
    status.style.display = 'block';

    setTimeout(() => {
      status.style.display = 'none';
    }, 5000);
  });
});
