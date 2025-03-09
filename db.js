// IndexedDB database manager for Claude Backup

// Database configuration
const DB_NAME = 'ClaudeBackups';
const DB_VERSION = 1;
const CONVERSATIONS_STORE = 'conversations';
const MESSAGES_STORE = 'messages';

// DB connection singleton
let dbConnection = null;

/**
 * Initialize the database connection
 * @returns {Promise<IDBDatabase>} Database connection
 */
function getDB() {
  return new Promise((resolve, reject) => {
    if (dbConnection) {
      resolve(dbConnection);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create conversations store - for metadata
      if (!db.objectStoreNames.contains(CONVERSATIONS_STORE)) {
        const conversationsStore = db.createObjectStore(CONVERSATIONS_STORE, { keyPath: 'uuid' });
        conversationsStore.createIndex('byName', 'name');
        conversationsStore.createIndex('byCreatedAt', 'created_at');
        conversationsStore.createIndex('byUpdatedAt', 'updated_at');
        conversationsStore.createIndex('byStarred', 'is_starred');
      }
      
      // Create messages store - for individual messages
      if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
        const messagesStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id', autoIncrement: true });
        messagesStore.createIndex('byConversationId', 'conversation_uuid');
        messagesStore.createIndex('byText', 'text');
        messagesStore.createIndex('bySender', 'sender');
        messagesStore.createIndex('byType', 'content_type');
        messagesStore.createIndex('byTimestamp', 'timestamp');
      }
    };

    request.onsuccess = (event) => {
      dbConnection = event.target.result;
      resolve(dbConnection);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Store a conversation and its messages
 * @param {Object} conversation - Conversation data
 * @returns {Promise<void>}
 */
async function storeConversation(conversation) {
  try {
    const db = await getDB();
    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    const conversationsStore = tx.objectStore(CONVERSATIONS_STORE);
    const messagesStore = tx.objectStore(MESSAGES_STORE);
    
    // Extract basic conversation metadata
    const conversationMeta = {
      uuid: conversation.uuid,
      name: conversation.name || 'Untitled Conversation',
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      is_starred: conversation.is_starred || false,
      message_count: 0,
      summary: conversation.summary || '',
      last_message_at: null,
      last_download: new Date().toISOString()
    };
    
    // Process messages
    if (conversation.chat_messages && Array.isArray(conversation.chat_messages)) {
      conversationMeta.message_count = conversation.chat_messages.length;
      
      // Track timestamps for all messages to find earliest and latest
      let earliestMessageTime = null;
      let latestMessageTime = null;
      
      // Extract and store each message
      for (const message of conversation.chat_messages) {
        const messageTimestamp = message.created_at || message.updated_at;
        
        // Update earliest/latest message timestamps
        if (messageTimestamp) {
          if (!earliestMessageTime || new Date(messageTimestamp) < new Date(earliestMessageTime)) {
            earliestMessageTime = messageTimestamp;
          }
          if (!latestMessageTime || new Date(messageTimestamp) > new Date(latestMessageTime)) {
            latestMessageTime = messageTimestamp;
          }
        }
        
        const messageEntries = extractMessageContent(message, conversation.uuid);
        
        // Store each message entry
        for (const entry of messageEntries) {
          await messagesStore.put(entry);
        }
      }
      
      // Set the first and last message timestamps
      conversationMeta.first_message_at = earliestMessageTime;
      conversationMeta.last_message_at = latestMessageTime;
    }
    
    // Store the conversation metadata
    await conversationsStore.put(conversationMeta);
    
    // Wait for transaction to complete
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('Error storing conversation:', error);
    throw error;
  }
}

/**
 * Extract and normalize message content, handling various formats
 * @param {Object} message - Message object
 * @param {string} conversationUuid - Conversation ID
 * @returns {Array} Array of message entries for the messages store
 */
function extractMessageContent(message, conversationUuid) {
  const entries = [];
  const baseTimestamp = message.created_at || message.updated_at;
  const sender = message.sender || 'unknown';
  
  // Handle different message content formats
  try {
    // Format 1: Content array with text/thinking objects
    if (message.content && Array.isArray(message.content)) {
      message.content.forEach((contentItem, index) => {
        // Skip empty content
        if (!contentItem) return;
        
        let entry = {
          conversation_uuid: conversationUuid,
          message_uuid: message.uuid,
          sender: sender,
          timestamp: baseTimestamp,
          position_index: index,
          content_type: contentItem.type || 'unknown'
        };
        
        // Handle different content types
        if (contentItem.type === 'text' && contentItem.text) {
          entry.text = contentItem.text;
        } 
        else if (contentItem.type === 'thinking' && contentItem.thinking) {
          entry.text = contentItem.thinking;
          entry.content_type = 'thinking';
        }
        
        // Only add entry if it has text content
        if (entry.text) {
          entries.push(entry);
        }
      });
    }
    
    // Format 2: Direct text field
    else if (message.text && typeof message.text === 'string') {
      entries.push({
        conversation_uuid: conversationUuid,
        message_uuid: message.uuid,
        sender: sender,
        timestamp: baseTimestamp,
        position_index: 0,
        content_type: 'text',
        text: message.text
      });
    }
    
    // Handle attachments if present
    if (message.attachments && Array.isArray(message.attachments)) {
      message.attachments.forEach((attachment, index) => {
        if (attachment && attachment.extracted_content) {
          entries.push({
            conversation_uuid: conversationUuid,
            message_uuid: message.uuid,
            sender: sender,
            timestamp: baseTimestamp,
            position_index: 100 + index, // Offset to separate from main content
            content_type: 'attachment',
            text: attachment.extracted_content,
            attachment_info: `${attachment.file_name || 'unnamed'} (${attachment.file_type || 'unknown type'})`
          });
        }
      });
    }
  } catch (error) {
    console.warn('Error extracting message content:', error);
    // Add a fallback entry if extraction fails
    entries.push({
      conversation_uuid: conversationUuid,
      message_uuid: message.uuid || 'unknown',
      sender: sender,
      timestamp: baseTimestamp || new Date().toISOString(),
      position_index: 0,
      content_type: 'unknown',
      text: 'Content extraction failed'
    });
  }
  
  return entries;
}

/**
 * Get all conversations from the database
 * @returns {Promise<Array>} Array of conversation objects
 */
async function getAllConversations() {
  try {
    const db = await getDB();
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const store = tx.objectStore(CONVERSATIONS_STORE);
    
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting all conversations:', error);
    throw error;
  }
}

/**
 * Search conversations by title and message content 
 * @param {string} query - Search term
 * @param {Object} options - Search options (contentTypes, senders, etc.)
 * @returns {Promise<Array>} Matching conversations
 */
async function searchConversations(query, options = {}) {
  if (!query || query.trim() === '') {
    return getAllConversations();
  }
  
  try {
    query = query.toLowerCase().trim();
    
    // Split query into individual terms for multi-term search
    const searchTerms = query.split(/\s+/).filter(term => term.length > 1);
    
    const db = await getDB();
    
    // First, find conversations with matching titles
    const titleMatches = await searchByTitle(db, query);
    
    // Then, find conversations with matching message content
    const contentMatches = await searchByContent(db, searchTerms, options);
    
    // Combine results, removing duplicates
    const allResults = [...titleMatches];
    const titleUuids = new Set(titleMatches.map(c => c.uuid));
    
    for (const conversation of contentMatches) {
      if (!titleUuids.has(conversation.uuid)) {
        allResults.push(conversation);
      }
    }
    
    return allResults;
  } catch (error) {
    console.error('Error searching conversations:', error);
    throw error;
  }
}

/**
 * Search conversations by title
 */
async function searchByTitle(db, query) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CONVERSATIONS_STORE, 'readonly');
    const store = tx.objectStore(CONVERSATIONS_STORE);
    const request = store.getAll();
    
    request.onsuccess = () => {
      // Filter conversations with matching titles
      const results = request.result.filter(conversation => 
        (conversation.name || '').toLowerCase().includes(query)
      );
      resolve(results);
    };
    
    request.onerror = () => reject(request.error);
  });
}


/**
 * Search conversations by message content with improved term handling
 */
async function searchByContent(db, searchTerms, options = {}) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MESSAGES_STORE, CONVERSATIONS_STORE], 'readonly');
    const messagesStore = tx.objectStore(MESSAGES_STORE);
    const conversationsStore = tx.objectStore(CONVERSATIONS_STORE);
    
    // Get all messages
    const request = messagesStore.getAll();
    
    request.onsuccess = async () => {
      try {
        // Find messages containing all search terms
        let matchingMessages = request.result.filter(message => {
          if (!message.text) return false;
          const messageText = message.text.toLowerCase();
          // Check if all terms exist in the message text
          return searchTerms.every(term => messageText.includes(term));
        });
        
        // Apply filters if provided
        if (options.contentTypes && options.contentTypes.length > 0) {
          matchingMessages = matchingMessages.filter(message => 
            options.contentTypes.includes(message.content_type)
          );
        }
        
        if (options.senders && options.senders.length > 0) {
          matchingMessages = matchingMessages.filter(message => 
            options.senders.includes(message.sender)
          );
        }
        
        // Get unique conversation IDs
        const conversationIds = [...new Set(matchingMessages.map(message => message.conversation_uuid))];
        
        // Fetch the corresponding conversations
        const matchingConversations = [];
        
        for (const uuid of conversationIds) {
          const getRequest = conversationsStore.get(uuid);
          const conversation = await new Promise((resolve, reject) => {
            getRequest.onsuccess = () => resolve(getRequest.result);
            getRequest.onerror = () => reject(getRequest.error);
          });
          
          if (conversation) {
            matchingConversations.push(conversation);
          }
        }
        
        resolve(matchingConversations);
      } catch (error) {
        reject(error);
      }
    };
    
    request.onerror = () => reject(request.error);
  });
}


/**
 * Get message snippets for a conversation that match a search query
 * @param {string} conversationUuid - Conversation ID
 * @param {string} query - Search term
 * @returns {Promise<Array>} Matching message snippets
 */
async function getSearchSnippets(conversationUuid, query, options = {}) {
  if (!query || !conversationUuid) {
    return [];
  }
  
  try {
    query = query.toLowerCase().trim();
    // Split query into individual terms
    const searchTerms = query.split(/\s+/).filter(term => term.length > 1);
    
    const db = await getDB();
    const tx = db.transaction(MESSAGES_STORE, 'readonly');
    const store = tx.objectStore(MESSAGES_STORE);
    const index = store.index('byConversationId');
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(conversationUuid);
      
      request.onsuccess = () => {
        let messages = request.result;
        const matchingSnippets = [];

        if (options.contentTypes && options.contentTypes.length > 0) {
          messages = messages.filter(message =>
            options.contentTypes.includes(message.content_type)
          );
        }

        if (options.senders && options.senders.length > 0) {
          messages = messages.filter(message => 
            options.senders.includes(message.sender)
          );
        }        

        // Find messages containing all search terms
        messages.forEach(message => {
          if (!message.text) return;
          
          const messageText = message.text.toLowerCase();
          // Make sure all terms exist in the message
          if (!searchTerms.every(term => messageText.includes(term))) {
            return;
          }

          // Create a snippet based on the first term
          const firstTerm = searchTerms[0];
          const text = message.text;
          const index = text.toLowerCase().indexOf(firstTerm);
          const start = Math.max(0, index - 40);
          const end = Math.min(text.length, index + firstTerm.length + 40);
          let snippet = text.substring(start, end);
          
          // Add ellipsis if truncated
          if (start > 0) snippet = '...' + snippet;
          if (end < text.length) snippet = snippet + '...';
          
          matchingSnippets.push({
            snippet,
            sender: message.sender,
            content_type: message.content_type,
            timestamp: message.timestamp
          });
        });
        
        resolve(matchingSnippets);
      };
      
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Error getting search snippets:', error);
    throw error;
  }
}

/**
 * Get statistics about the database
 * @returns {Promise<Object>} Database statistics
 */
async function getDBStats() {
  try {
    const db = await getDB();
    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readonly');
    const conversationsStore = tx.objectStore(CONVERSATIONS_STORE);
    const messagesStore = tx.objectStore(MESSAGES_STORE);
    
    const conversationCount = await new Promise((resolve, reject) => {
      const request = conversationsStore.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    const messageCount = await new Promise((resolve, reject) => {
      const request = messagesStore.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    
    // Get most recent update
    const conversations = await getAllConversations();
    let latestUpdate = null;
    
    if (conversations.length > 0) {
      latestUpdate = conversations.reduce((latest, conv) => {
        const convDate = new Date(conv.last_download || 0);
        return convDate > latest ? convDate : latest;
      }, new Date(0));
    }
    
    return {
      conversationCount,
      messageCount,
      latestUpdate,
      dbName: DB_NAME,
      dbVersion: DB_VERSION
    };
  } catch (error) {
    console.error('Error getting database stats:', error);
    throw error;
  }
}

/**
 * Clear all data from the database
 * @returns {Promise<void>}
 */
async function clearDatabase() {
  try {
    const db = await getDB();
    const tx = db.transaction([CONVERSATIONS_STORE, MESSAGES_STORE], 'readwrite');
    const conversationsStore = tx.objectStore(CONVERSATIONS_STORE);
    const messagesStore = tx.objectStore(MESSAGES_STORE);
    
    conversationsStore.clear();
    messagesStore.clear();
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (event) => reject(event.target.error);
    });
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}

export const ClaudeDB = {
  storeConversation,
  getAllConversations,
  searchConversations,
  getSearchSnippets,
  getDBStats,
  clearDatabase
};
