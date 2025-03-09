document.addEventListener('DOMContentLoaded', () => {
  // DOM elements
  const searchInput = document.getElementById('searchInput');
  const refreshButton = document.getElementById('refreshButton');
  const conversationsGrid = document.getElementById('conversationsGrid');
  const loading = document.getElementById('loading');
  const emptyState = document.getElementById('emptyState');
  const emptyStateBackupButton = document.getElementById('emptyStateBackupButton');
  const backupNowButton = document.getElementById('backupNowButton');
  const conversationCount = document.getElementById('conversationCount');
  const messageCount = document.getElementById('messageCount');
  const lastBackupTime = document.getElementById('lastBackupTime');
  const searchResultCount = document.getElementById('searchResultCount');
  const searchControls = document.getElementById('searchControls');
  
  // Modal elements
  const confirmModal = document.getElementById('confirmModal');
  const closeModalButton = document.getElementById('closeModalButton');
  const cancelModalButton = document.getElementById('cancelModalButton');
  const confirmModalButton = document.getElementById('confirmModalButton');
  const modalMessage = document.getElementById('modalMessage');
  
  // Filter checkboxes
  const contentTypeCheckboxes = document.querySelectorAll('input[name="contentType"]');
  const senderCheckboxes = document.querySelectorAll('input[name="sender"]');
  
  // State variables
  let allConversations = [];
  let currentSearchTerm = '';
  let modalCallback = null;
  
  // Initialize
  init();
  
  // Event listeners
  searchInput.addEventListener('input', debounce(() => {
    currentSearchTerm = searchInput.value.trim();
    
    // Show search controls when searching
    if (currentSearchTerm) {
      searchControls.classList.remove('hidden');
    } else {
      searchControls.classList.add('hidden');
    }
    
    performSearch();
  }, 300));
  
  refreshButton.addEventListener('click', refreshData);
  emptyStateBackupButton.addEventListener('click', runBackup);
  backupNowButton.addEventListener('click', runBackup);
  
  closeModalButton.addEventListener('click', closeModal);
  cancelModalButton.addEventListener('click', closeModal);
  confirmModalButton.addEventListener('click', () => {
    if (modalCallback) {
      modalCallback();
    }
    closeModal();
  });
  
  // Add filter change listeners
  contentTypeCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', performSearch);
  });
  
  senderCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', performSearch);
  });
  
  // Initialize the browser
  async function init() {
    showLoading();
    await loadData();
    hideLoading();
  }
  
  // Load conversations data
  async function loadData() {
    try {
      // Get database stats
      const statsResponse = await sendMessage({ action: 'getDBStats' });
      if (statsResponse && statsResponse.success) {
        updateStats(statsResponse.stats);
      }
      
      // Get conversations
      const response = await sendMessage({ action: 'getAllConversations' });
      if (!response || !response.success) {
        showEmptyState('Error loading conversations');
        return;
      }
      
      allConversations = response.conversations || [];
      
      if (allConversations.length === 0) {
        showEmptyState();
        return;
      }
      
      renderConversations(allConversations);
    } catch (error) {
      console.error('Error loading data:', error);
      showEmptyState('Error loading conversations');
    }
  }
  
  // Refresh data
  async function refreshData() {
    showLoading();
    await loadData();
    hideLoading();
  }
  
  // Run a backup
  function runBackup() {
    showConfirmModal(
      'This will run an incremental backup of all your recently-updated Claude conversations. Continue?',
      async () => {
        showLoading();
        try {
          const response = await sendMessage({ action: 'backupNow' });
          if (response && response.success) {
            // Wait for backup to complete (approximately)
            setTimeout(async () => {
              await loadData();
              hideLoading();
            }, 3000);
          } else {
            throw new Error('Backup failed');
          }
        } catch (error) {
          console.error('Error running backup:', error);
          hideLoading();
          alert('Error running backup: ' + error.message);
        }
      }
    );
  }
  
  // Get selected search filters
  function getSearchOptions() {
    // Get selected content types
    const contentTypes = Array.from(contentTypeCheckboxes)
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
    
    // Get selected senders
    const senders = Array.from(senderCheckboxes)
      .filter(checkbox => checkbox.checked)
      .map(checkbox => checkbox.value);
    
    return { contentTypes, senders };
  }
  
  // Perform search with current filters
  function performSearch() {
    const query = currentSearchTerm;
    if (!query) {
      // If no search term, show all conversations
      renderConversations(allConversations);
      searchResultCount.classList.add('hidden');
      
      // Remove any search snippets
      const snippetsContainer = document.getElementById('searchSnippets');
      if (snippetsContainer) {
        snippetsContainer.remove();
      }
      
      return;
    }
    
    const options = getSearchOptions();
    searchConversations(query, options);
  }
  
  // Search conversations
  async function searchConversations(query, options) {
    showLoading();
    
    try {
      const response = await sendMessage({ 
        action: 'searchConversations',
        query: query,
        options: options
      });
      
      if (!response || !response.success) {
        throw new Error('Search failed');
      }
      
      const results = response.conversations || [];
      
      if (results.length === 0) {
        showEmptyState('No conversations match your search');
        
        // Remove any search snippets
        const snippetsContainer = document.getElementById('searchSnippets');
        if (snippetsContainer) {
          snippetsContainer.remove();
        }
      } else {
        renderConversations(results);

        // Get snippets for the first few results to show context
        if (query && results.length > 0) {
          const snippetsResponse = await sendMessage({
            action: 'getSearchSnippets',
            conversationUuid: results[0].uuid,
            query: query,
            options: options,
          });
          
          if (snippetsResponse && snippetsResponse.success && snippetsResponse.snippets && snippetsResponse.snippets.length > 0) {
            // Display snippets if we have them
            showSearchSnippets(snippetsResponse.snippets, results[0].name);
          } else {
            // Remove any search snippets if none found
            const snippetsContainer = document.getElementById('searchSnippets');
            if (snippetsContainer) {
              snippetsContainer.remove();
            }
          }
        }
        
        // Show search result count
        if (query) {
          searchResultCount.textContent = `Found ${results.length} conversation${results.length !== 1 ? 's' : ''} matching "${query}"`;
          searchResultCount.classList.remove('hidden');
        } else {
          searchResultCount.classList.add('hidden');
        }
      }
    } catch (error) {
      console.error('Error searching:', error);
      showEmptyState('Error searching conversations');
    }
    
    hideLoading();
  }
  
  // Function to display search snippets
  function showSearchSnippets(snippets, conversationName) {
    // Create or get snippets container
    let snippetsContainer = document.getElementById('searchSnippets');
    if (!snippetsContainer) {
      snippetsContainer = document.createElement('div');
      snippetsContainer.id = 'searchSnippets';
      snippetsContainer.className = 'search-snippets';
      // Insert after search result count
      searchResultCount.parentNode.insertBefore(snippetsContainer, searchResultCount.nextSibling);
    } else {
      snippetsContainer.innerHTML = '';
    }
    
    // Create header
    const header = document.createElement('h3');
    header.textContent = `Matching content in "${conversationName}"`;
    snippetsContainer.appendChild(header);
    
    // Add each snippet
    snippets.slice(0, 3).forEach(snippet => {
      const snippetDiv = document.createElement('div');
      snippetDiv.className = 'search-snippet';
      
      const senderSpan = document.createElement('span');
      senderSpan.className = 'snippet-sender';
      senderSpan.textContent = snippet.sender === 'human' ? 'You: ' : 'Claude: ';
      
      const contentTypeIndicator = document.createElement('small');
      contentTypeIndicator.style.color = 'var(--text-secondary)';
      contentTypeIndicator.style.marginLeft = '5px';
      
      if (snippet.content_type === 'thinking') {
        contentTypeIndicator.textContent = '[thinking]';
      } else if (snippet.content_type === 'attachment') {
        contentTypeIndicator.textContent = '[attachment]';
      }
      
      const contentSpan = document.createElement('span');
      // Bold the search term in the snippet
      const regex = new RegExp(`(${currentSearchTerm})`, 'gi');
      contentSpan.innerHTML = snippet.snippet.replace(regex, '<strong style="background-color: #fff7c0">$1</strong>');
      
      snippetDiv.appendChild(senderSpan);
      if (snippet.content_type !== 'text') {
        snippetDiv.appendChild(contentTypeIndicator);
      }
      snippetDiv.appendChild(document.createElement('br'));
      snippetDiv.appendChild(contentSpan);
      snippetsContainer.appendChild(snippetDiv);
    });
    
    if (snippets.length > 3) {
      const more = document.createElement('div');
      more.className = 'more-snippets';
      more.textContent = `...and ${snippets.length - 3} more matches`;
      snippetsContainer.appendChild(more);
    }
  }
  
  // Render conversations to the grid
  function renderConversations(conversations) {
    conversationsGrid.innerHTML = '';
    emptyState.classList.add('hidden');
    
    conversations.sort((a, b) => {
      if (a.updated_at > b.updated_at) {
        return -1;
      } else if (a.updated_at < b.updated_at) {
        return 1;
      } else {
        return 0;
      }
    }).forEach(conversation => {
      const card = createConversationCard(conversation);
      conversationsGrid.appendChild(card);
    });
    
    conversationsGrid.classList.remove('hidden');
  }
  
  function createConversationCard(conversation) {
    const card = document.createElement('div');
    card.className = 'conversation-card';
    
    // Format dates using message timestamps instead of conversation timestamps
    const firstMessageDate = conversation.first_message_at ? new Date(conversation.first_message_at) : new Date(conversation.created_at);
    const lastMessageDate = conversation.last_message_at ? new Date(conversation.last_message_at) : new Date(conversation.updated_at);
    
    // Get message count
    let messageCount = conversation.message_count || 0;
    
    card.innerHTML = `
      <h2>${conversation.name || 'Untitled Conversation'}</h2>
      <div class="conversation-meta">
        Started: ${formatDate(firstMessageDate)}<br>
        Last activity: ${formatDate(lastMessageDate)}
      </div>
      <div class="message-count">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        ${messageCount} message${messageCount !== 1 ? 's' : ''}
      </div>
      ${conversation.is_starred ? '<div class="star-icon">★</div>' : ''}
    `;
    
    // Add click handler to open the conversation on claude.ai
    card.addEventListener('click', () => {
      const claudeUrl = `https://claude.ai/chat/${conversation.uuid}`;
      window.open(claudeUrl, '_blank');
    });
    
    return card;
  }
  
  // Update stats display
  function updateStats(stats) {
    if (!stats) return;
    
    conversationCount.textContent = stats.conversationCount || 0;
    messageCount.textContent = stats.messageCount || 0;
    
    if (stats.latestUpdate) {
      lastBackupTime.textContent = formatDate(new Date(stats.latestUpdate));
    } else {
      lastBackupTime.textContent = 'Never';
    }
  }
  
  // Show empty state
  function showEmptyState(message) {
    conversationsGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');

    searchResultCount.textContent = '';
    searchResultCount.classList.add('hidden');
    
    if (message) {
      const heading = emptyState.querySelector('h2');
      const paragraph = emptyState.querySelector('p');
      
      if (heading) heading.textContent = 'Nothing to show';
      if (paragraph) paragraph.textContent = message;
    }
  }
  
  // Show loading state
  function showLoading() {
    loading.classList.remove('hidden');
  }
  
  // Hide loading state
  function hideLoading() {
    loading.classList.add('hidden');
  }
  
  // Show confirmation modal
  function showConfirmModal(message, callback) {
    modalMessage.textContent = message;
    modalCallback = callback;
    confirmModal.classList.add('active');
  }
  
  // Close modal
  function closeModal() {
    confirmModal.classList.remove('active');
    modalCallback = null;
  }
  
  // Format date
  function formatDate(date) {
    if (!date || isNaN(date.getTime())) {
      return 'Unknown';
    }
    
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    
    // Less than a minute
    if (diffSec < 60) {
      return 'Just now';
    }
    
    // Less than an hour
    if (diffSec < 3600) {
      const mins = Math.floor(diffSec / 60);
      return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
    }
    
    // Less than a day
    if (diffSec < 86400) {
      const hours = Math.floor(diffSec / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
    
    // Less than a week
    if (diffSec < 604800) {
      const days = Math.floor(diffSec / 86400);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
    
    // Regular date
    return date.toLocaleString();
  }
  
  // Helper function to send a message to the background script
  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response);
        }
      });
    });
  }
  
  // Debounce function for search
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
});
