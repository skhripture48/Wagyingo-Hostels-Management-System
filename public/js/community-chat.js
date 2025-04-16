// WebSocket connection
let ws = null;
let selectedMessageId = null;
let replyToMessageId = null;
let userInfo = null;
let typingTimer = null;
let emojiPicker = null;
let originalMessages = [];
let isTyping = false;
let typingTimeout = null;
let selectedFile = null;

// DOM Elements
let messageTemplate;
let chatMessages;
let messageInput;
let sendButton;
let editModal;
let deleteModal;
let replyPreview;

// Initialize chat
async function initializeChat() {
    try {
        // Initialize DOM elements
        messageTemplate = document.querySelector('#message-template');
        chatMessages = document.querySelector('#chatMessages');
        messageInput = document.querySelector('#messageInput');
        sendButton = document.querySelector('#sendButton');
        replyPreview = document.querySelector('#replyPreview');
        
        if (!chatMessages) {
            throw new Error('Chat messages container not found');
        }

        // Initialize Bootstrap modals
        const editModalElement = document.getElementById('editModal');
        const deleteModalElement = document.getElementById('deleteModal');
        
        if (editModalElement && deleteModalElement) {
            editModal = new bootstrap.Modal(editModalElement);
            deleteModal = new bootstrap.Modal(deleteModalElement);
        }
        
        // Get user info and resident status
        const response = await fetch('/api/check-resident-status', {
            credentials: 'include'
        });
        if (!response.ok) throw new Error('Not authenticated');
        const data = await response.json();
        
        if (!data.isResident) {
            document.getElementById('chatContainer').innerHTML = '<div class="alert alert-warning">Only residents can access the chat.</div>';
            return;
        }

        userInfo = {
            id: data.id,
            username: data.username,
            hostel: data.hostel_name
        };

        console.log('User info:', userInfo);

        // Set up WebSocket connection
        connectWebSocket();

        // Set up event listeners for modals
        const saveEditButton = document.getElementById('saveEditButton');
        const confirmDeleteButton = document.getElementById('confirmDeleteButton');
        
        if (saveEditButton) {
            saveEditButton.addEventListener('click', async () => {
                const editInput = document.getElementById('editMessageInput');
                if (!editInput) return;
                
                const newText = editInput.value.trim();
                if (newText && selectedMessageId) {
                    await editMessage(selectedMessageId, newText);
                    editModal.hide();
                }
            });
        }
        
        if (confirmDeleteButton) {
            confirmDeleteButton.addEventListener('click', async () => {
                if (selectedMessageId) {
                    await deleteMessage(selectedMessageId);
                    deleteModal.hide();
                }
            });
        }

        // Initialize file upload
        initializeFileUpload();

        // Set up event listeners for chat input
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        sendButton.addEventListener('click', sendMessage);

        // Initialize emoji button
        const emojiButton = document.getElementById('emojiButton');
        if (emojiButton) {
            emojiButton.addEventListener('click', () => {
                const emojiPicker = document.querySelector('emoji-picker');
                if (emojiPicker) {
                    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        // Add event listener for reply cancel button
        const cancelReplyButton = document.querySelector('#cancelReply');
        if (cancelReplyButton) {
            cancelReplyButton.addEventListener('click', cancelReply);
        }

    } catch (error) {
        console.error('Error initializing chat:', error);
        showError('Failed to initialize chat: ' + error.message);
    }
}

// Connect WebSocket
function connectWebSocket() {
    if (!userInfo || !userInfo.id || !userInfo.hostel || !userInfo.username) {
        console.error('Missing user info:', userInfo);
        showError('Missing user information. Please try refreshing the page.');
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = window.location.port;
    const wsUrl = `${protocol}//${host}:${port}`;
    
    console.log('Connecting to WebSocket:', wsUrl);
    
    if (ws) {
        console.log('Closing existing WebSocket connection');
        ws.close();
    }
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('Connected to chat server');
        // Join chat room
        const joinData = {
            type: 'join',
            hostel: userInfo.hostel,
            username: userInfo.username,
            userId: userInfo.id
        };
        console.log('Sending join data:', joinData);
        ws.send(JSON.stringify(joinData));
    };
    
    ws.onmessage = async (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('Received message:', data);
            
            switch (data.type) {
                case 'message':
                    // Create and append the new message element
                    const messageElement = createMessageElement(data);
                    chatMessages.appendChild(messageElement);
                    
                    // Ensure event listeners are attached
                    attachMessageEventListeners(messageElement, data);
                    
                    // Scroll to the new message
                    messageElement.scrollIntoView({ behavior: 'smooth' });
                    break;
                
                case 'history':
                    if (Array.isArray(data.messages)) {
                        loadChatHistory(data.messages);
                    } else {
                        console.error('Invalid message history format:', data);
                    }
                    break;
                
                case 'typing':
                    updateTypingIndicator(data);
                    break;
                
                case 'reaction':
                    updateMessageReactions(data);
                    break;
                
                case 'message_edited':
                    console.log('Handling edited message:', data);
                    updateEditedMessage(data);
                    break;
                
                case 'message_deleted':
                    console.log('Handling deleted message:', data);
                    handleDeletedMessage(data);
                    break;
                
                case 'users':
                    updateOnlineUsers(data);
                    break;
                
                case 'error':
                    showError(data.message);
                    break;
                
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
            showError('Failed to process message');
        }
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showError('Connection error. Please try refreshing the page.');
    };
    
    ws.onclose = () => {
        console.log('Disconnected from chat server');
        // Attempt to reconnect after 5 seconds
        setTimeout(connectWebSocket, 5000);
    };
}

// Function to attach event listeners to message elements
function attachMessageEventListeners(element, message) {
    if (message.is_deleted) return;

    console.log('Attaching event listeners to message:', message.id);

    const replyBtn = element.querySelector('.reply-btn');
    const reactionBtn = element.querySelector('.reaction-btn');
    const editBtn = element.querySelector('.edit-btn');
    const deleteBtn = element.querySelector('.delete-btn');
    
    if (replyBtn) {
        replyBtn.addEventListener('click', () => {
            console.log('Reply button clicked for message:', message.id);
            startReply(message.id);
        });
    } else {
        console.log('Reply button not found');
    }
    
    if (reactionBtn) {
        reactionBtn.addEventListener('click', () => {
            console.log('Reaction button clicked for message:', message.id);
            showReactionPicker(message.id);
        });
    }
    
    if (message.user_id === userInfo.id) {
        if (editBtn) {
            editBtn.addEventListener('click', () => {
                console.log('Edit button clicked for message:', message.id);
                startEditMessage(message.id);
            });
        }
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => {
                console.log('Delete button clicked for message:', message.id);
                confirmDeleteMessage(message.id);
            });
        }
    }
}

// Set up event listeners
function setupEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('sendButton');
    const fileInput = document.getElementById('fileInput');
    const clearFileSelection = document.getElementById('clearFileSelection');
    const searchInput = document.getElementById('searchInput');

    // Message input handling
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Send button handling
    sendButton.addEventListener('click', sendMessage);

    // File handling
    fileInput.addEventListener('change', handleFileSelect);
    clearFileSelection.addEventListener('click', clearFileSelection);

    // Search handling
    searchInput.addEventListener('input', handleSearch);

    // Message action buttons
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('edit-message-btn')) {
            handleEditMessage(e.target.closest('.message'));
        } else if (e.target.classList.contains('delete-message-btn')) {
            handleDeleteMessage(e.target.closest('.message'));
        } else if (e.target.classList.contains('add-reaction-btn')) {
            handleAddReaction(e.target.closest('.message'));
        }
    });
}

// Send message
async function sendMessage() {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket not connected, attempting to reconnect...');
            connectWebSocket();
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket connection failed');
            }
        }

        const messageText = messageInput.value.trim();
        const fileMessageInput = document.getElementById('fileMessageInput');
        const fileMessage = fileMessageInput ? fileMessageInput.value.trim() : '';

        console.log('Sending message with:', {
            messageText,
            fileMessage,
            selectedFile: selectedFile ? selectedFile.name : null
        });

        if (!messageText && !selectedFile) return;

        if (selectedFile) {
            // Show loading indicator
            const loadingIndicator = document.createElement('div');
            loadingIndicator.className = 'alert alert-info';
            loadingIndicator.textContent = 'Uploading file...';
            document.getElementById('chatContainer').insertBefore(loadingIndicator, chatMessages);

            try {
                const formData = new FormData();
                formData.append('file', selectedFile);

                const response = await fetch('/api/chat/upload', {
                    method: 'POST',
                    credentials: 'include',
                    body: formData
                });

                // Remove loading indicator
                loadingIndicator.remove();

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Upload failed');
                }

                const data = await response.json();
                
                // Prepare file message data
                const messageData = {
                    type: 'message',
                    message_type: 'file',
                    file_url: data.url,
                    file_name: selectedFile.name,
                    file_type: selectedFile.type,
                    hostel: userInfo.hostel,
                    message: selectedFile.name,
                    file_message: fileMessage,
                    reply_to: replyToMessageId
                };

                console.log('Sending file message data:', messageData);
                
                // Send file message through WebSocket
                ws.send(JSON.stringify(messageData));

                // Clear the file input, selected file, and preview
                const fileInput = document.getElementById('fileInput');
                const filePreviewContainer = document.getElementById('filePreviewContainer');
                if (fileInput) fileInput.value = '';
                if (filePreviewContainer) {
                    filePreviewContainer.classList.add('d-none');
                    if (fileMessageInput) fileMessageInput.value = '';
                }
                selectedFile = null;
            } catch (error) {
                // Remove loading indicator if still present
                if (loadingIndicator.parentNode) {
                    loadingIndicator.remove();
                }
                throw error;
            }
        } else {
            // Send text message
            const messageData = {
                type: 'message',
                message: messageText,
                reply_to: replyToMessageId,
                hostel: userInfo.hostel
            };

            ws.send(JSON.stringify(messageData));
        }

        // Clear input and reply preview
        messageInput.value = '';
        cancelReply();
    } catch (error) {
        console.error('Error sending message:', error);
        showError('Failed to send message: ' + error.message);
    }
}

// Handle file upload
async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await fetch('/api/chat/upload', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        
        // Send file message through WebSocket
        ws.send(JSON.stringify({
            type: 'message',
            message_type: 'file',
            file_url: data.url,
            file_name: file.name,
            file_type: file.type,
            hostel: userInfo.hostel,
            message: file.name
        }));
    } catch (error) {
        console.error('Error uploading file:', error);
        showError('Failed to upload file');
    }
}

// Append a message to the chat
function appendMessage(messageData) {
    const template = document.querySelector('#message-template');
    const message = template.content.cloneNode(true).querySelector('.message');
    
    // Set message ID
    message.dataset.messageId = messageData.id;
    
    // Add own-message class if the message is from the current user
    if (messageData.user_id === userInfo.id) {
        message.classList.add('own-message');
    }

    // Set header content
    const header = message.querySelector('.message-header');
    header.querySelector('.message-author').textContent = messageData.username;
    header.querySelector('.message-time').textContent = formatTimestamp(messageData.created_at);
    
    if (messageData.is_edited) {
        header.querySelector('.edited-indicator').style.display = 'inline';
    }

    // Handle message content based on type
    const content = message.querySelector('.message-content');
    const filePreview = message.querySelector('.file-preview');
    
    if (messageData.is_deleted) {
        content.classList.add('deleted');
        content.textContent = 'This message has been deleted';
        filePreview.style.display = 'none';
    } else if (messageData.message_type === 'file' || messageData.messageType === 'file') {
        // Show file preview
        filePreview.style.display = 'block';
        content.textContent = ''; // Clear text content
        
        const imgPreview = filePreview.querySelector('.img-preview');
        const docPreview = filePreview.querySelector('.document-preview');
        const fileLink = filePreview.querySelector('.file-name');
        const fileNameText = fileLink.querySelector('.file-name-text');
        
        // Get file information using both possible formats
        const fileUrl = messageData.file_url || messageData.fileUrl;
        const fileName = messageData.file_name || messageData.fileName || messageData.message;
        const fileType = messageData.file_type || messageData.fileType;
        
        // Set file name and download link
        fileNameText.textContent = fileName;
        fileLink.href = fileUrl;
        fileLink.download = fileName;
        
        // Handle different file types
        if (fileType && fileType.startsWith('image/')) {
            imgPreview.style.display = 'block';
            docPreview.style.display = 'none';
            imgPreview.src = fileUrl;
            imgPreview.alt = fileName;
            
            // Add click handler to open image in new tab
            imgPreview.onclick = () => window.open(fileUrl, '_blank');
        } else {
            imgPreview.style.display = 'none';
            docPreview.style.display = 'flex';
            
            // Set appropriate icon and type based on file type
            const icon = docPreview.querySelector('i');
            const typeSpan = docPreview.querySelector('.document-type');
            
            icon.className = getFileIcon(fileType);
            typeSpan.textContent = getFileTypeName(fileType);
        }
    } else {
        // Regular text message
        content.textContent = messageData.message;
        filePreview.style.display = 'none';
    }

    // Handle message actions
    const actionsDiv = message.querySelector('.message-actions');
    if (!messageData.is_deleted && messageData.user_id === userInfo.id) {
        actionsDiv.style.display = 'flex';
        
        // Add event listeners for edit and delete buttons
        const editBtn = actionsDiv.querySelector('.edit-message-btn');
        const deleteBtn = actionsDiv.querySelector('.delete-message-btn');
        
        editBtn.onclick = () => editMessage(messageData.id);
        deleteBtn.onclick = () => deleteMessage(messageData.id);
    }

    // Add message to chat
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show error message
function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    if (!errorAlert) {
        console.error('Error alert element not found');
        return;
    }
    
    errorAlert.textContent = message;
    errorAlert.classList.remove('d-none');
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorAlert.classList.add('d-none');
    }, 5000);
}

// Format message text
function formatMessageText(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

// Create reactions element
function createReactionsElement(reactions) {
    if (!reactions || reactions.length === 0) return '';
    
    const reactionCounts = reactions.reduce((acc, reaction) => {
        acc[reaction] = (acc[reaction] || 0) + 1;
        return acc;
    }, {});
    
    return Object.entries(reactionCounts)
        .map(([emoji, count]) => `
            <span class="reaction" data-emoji="${emoji}">
                ${emoji} ${count}
            </span>
        `)
        .join('');
}

// Add reaction to message
async function addReaction(messageId, emoji) {
    try {
        ws.send(JSON.stringify({
            type: 'reaction',
            messageId: messageId,
            emoji: emoji
        }));
    } catch (error) {
        console.error('Error adding reaction:', error);
        showError('Failed to add reaction');
    }
}

// Edit message
async function editMessage(messageId, newText) {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket connection not open');
        }
        
        console.log('Sending edit message:', { messageId, newText });
        ws.send(JSON.stringify({
            type: 'edit_message',
            messageId: parseInt(messageId),
            content: newText,
            hostel: userInfo.hostel
        }));
    } catch (error) {
        console.error('Error editing message:', error);
        showError('Failed to edit message: ' + error.message);
    }
}

// Delete message
async function deleteMessage(messageId) {
    try {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket connection not open');
        }
        
        // Ensure messageId is a number and hostel is included
        const deleteData = {
            type: 'delete_message',
            messageId: Number(messageId),
            hostel: userInfo.hostel,
            userId: userInfo.id
        };
        
        console.log('Sending delete message:', deleteData);
        ws.send(JSON.stringify(deleteData));
    } catch (error) {
        console.error('Error deleting message:', error);
        showError('Failed to delete message: ' + error.message);
    }
}

// Search messages
async function searchMessages(query) {
    if (!query) {
        loadChatHistory(originalMessages);
        return;
    }
    
    try {
        const response = await fetch(`/api/chat/search?query=${encodeURIComponent(query)}&hostel=${userInfo.hostel}`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Search failed');
        
        const messages = await response.json();
        displayMessages(messages);
    } catch (error) {
        console.error('Error searching messages:', error);
        showError('Failed to search messages');
    }
}

// UI Helper Functions
function createMessageElement(message) {
    console.log('Creating message element with data:', message);
    
    const div = document.createElement('div');
    div.className = `message ${message.user_id === userInfo.id ? 'sent' : 'received'}`;
    div.dataset.messageId = message.id;
    
    let content = '';
    
    // Add reply details if this is a reply
    if (message.reply_details) {
        content += `
            <div class="replied-message">
                <small class="text-muted">Replying to <span style="color: ${generateUsernameColor(message.reply_details.username)}">${message.reply_details.username}</span></small>
                <p class="mb-0" style="color: ${message.user_id === userInfo.id ? 'white' : 'black'}">${message.reply_details.message_type === 'file' 
                    ? `File: ${message.reply_details.file_name}${message.reply_details.file_message ? ` - ${message.reply_details.file_message}` : ''}`
                    : escapeHtml(message.reply_details.message)}</p>
            </div>
        `;
    }
    
    // Message header with colored username
    content += `
        <div class="message-header">
            <div class="d-flex align-items-center gap-2">
                <img src="${message.profile_picture}" alt="${escapeHtml(message.username)}" class="profile-picture" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <span class="username" style="color: ${generateUsernameColor(message.username)}">${escapeHtml(message.username)}</span>
            </div>
            <span class="timestamp">${formatTimestamp(message.created_at)}</span>
            ${message.is_edited ? '<span class="edited-indicator">(edited)</span>' : ''}
        </div>
    `;
    
    // Message content
    if (message.is_deleted) {
        content += '<div class="message-content deleted">This message has been deleted</div>';
    } else if (message.message_type === 'file') {
        content += '<div class="file-message-container">';
        
        // Add file message if it exists
        if (message.file_message && message.file_message.trim()) {
            content += `<div class="message-content">${formatMessageText(message.file_message)}</div>`;
        }
        
        // Add file preview
        content += createFilePreview(message);
        content += '</div>';
    } else {
        content += `<div class="message-content">${formatMessageText(message.message)}</div>`;
    }
    
    // Message footer with actions
    content += `
        <div class="message-footer">
            <div class="message-reactions"></div>
            ${!message.is_deleted ? `
                <div class="message-actions" style="display: flex;">
                    <button class="btn btn-sm btn-outline-secondary reply-btn" title="Reply">
                        <i class="bi bi-reply"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary reaction-btn" title="Add reaction">
                        <i class="bi bi-emoji-smile"></i>
                    </button>
                    ${message.user_id === userInfo.id ? `
                        <button class="btn btn-sm btn-outline-secondary edit-btn" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-btn" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            ` : ''}
        </div>
    `;
    
    div.innerHTML = content;
    console.log('Created message element:', div.outerHTML);
    
    // Attach event listeners
    attachMessageEventListeners(div, message);
    
    return div;
}

// Helper function to create file preview
function createFilePreview(message) {
    let content = `
        <div class="file-preview">
            ${message.file_type && message.file_type.startsWith('image/') ? `
                <img src="${message.file_url}" alt="${escapeHtml(message.file_name)}" class="img-preview" style="display: block; cursor: pointer" onclick="window.open('${message.file_url}', '_blank')">
            ` : `
                <div class="document-preview">
                    <i class="${getFileIcon(message.file_type)}"></i>
                    <span class="document-type">${getFileTypeName(message.file_type)}</span>
                </div>
            `}
            <a href="${message.file_url}" class="file-name" target="_blank" download="${message.file_name}">
                <i class="bi bi-download"></i>
                <span class="file-name-text">${escapeHtml(message.file_name)}</span>
            </a>
        </div>
    `;
    return content;
}

// Helper function to get appropriate file icon
function getFileIcon(fileType) {
    if (!fileType) return 'bi bi-file-earmark';
    if (fileType.includes('pdf')) return 'bi bi-file-pdf';
    if (fileType.includes('word') || fileType.includes('document')) return 'bi bi-file-word';
    if (fileType.includes('sheet') || fileType.includes('excel')) return 'bi bi-file-excel';
    return 'bi bi-file-earmark';
}

// Helper function to get file type name
function getFileTypeName(fileType) {
    if (!fileType) return 'File';
    if (fileType.includes('pdf')) return 'PDF Document';
    if (fileType.includes('word') || fileType.includes('document')) return 'Word Document';
    if (fileType.includes('sheet') || fileType.includes('excel')) return 'Excel Spreadsheet';
    return 'File';
}

// Utility Functions
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

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

// Initialize file upload
function initializeFileUpload() {
    const fileInput = document.getElementById('fileInput');
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    const filePreviewContainer = document.getElementById('filePreviewContainer');
    const selectedFileName = document.getElementById('selectedFileName');
    const clearFileSelection = document.getElementById('clearFileSelection');
    const fileMessageInput = document.getElementById('fileMessageInput');

    fileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            selectedFile = null;
            filePreviewContainer.classList.add('d-none');
            if (fileMessageInput) fileMessageInput.value = '';
            return;
        }

        if (file.size > maxFileSize) {
            showError('File size exceeds 10MB limit');
            fileInput.value = '';
            selectedFile = null;
            filePreviewContainer.classList.add('d-none');
            if (fileMessageInput) fileMessageInput.value = '';
            return;
        }

        // Update the preview
        selectedFile = file;
        selectedFileName.textContent = file.name;
        
        // Update icon based on file type
        const fileIcon = filePreviewContainer.querySelector('i');
        fileIcon.className = `${getFileIcon(file.type)} me-2`;
        
        // Show the preview container
        filePreviewContainer.classList.remove('d-none');
    });

    // Handle clear button click
    if (clearFileSelection) {
        clearFileSelection.addEventListener('click', () => {
            fileInput.value = '';
            selectedFile = null;
            filePreviewContainer.classList.add('d-none');
            if (fileMessageInput) fileMessageInput.value = '';
        });
    }
}

// Load chat history
function loadChatHistory(messages) {
    chatMessages.innerHTML = '';
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        chatMessages.appendChild(messageElement);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle message context menu
function handleMessageContextMenu(event) {
    const messageElement = event.target.closest('.message');
    if (!messageElement) return;

    const messageId = messageElement.dataset.messageId;
    const isOwnMessage = messageElement.classList.contains('own-message');
    
    // Show/hide appropriate action buttons
    const actionButtons = messageElement.querySelectorAll('.message-actions button');
    actionButtons.forEach(button => {
        if (button.classList.contains('reaction-btn')) {
            button.style.display = 'inline-block';
        } else {
            button.style.display = isOwnMessage ? 'inline-block' : 'none';
        }
    });
}

// Update typing indicator
function updateTypingIndicator(data) {
    const typingStatus = document.getElementById('typingStatus');
    if (data.isTyping && data.username !== userInfo.username) {
        typingStatus.textContent = `${data.username} is typing...`;
    } else {
        typingStatus.textContent = '';
    }
}

// Send typing indicator
function sendTypingIndicator(isTyping) {
    try {
        ws.send(JSON.stringify({
            type: 'typing',
            isTyping: isTyping
        }));
    } catch (error) {
        console.error('Error sending typing indicator:', error);
    }
}

// Update message reactions
function updateMessageReactions(data) {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    if (!messageElement) return;
    
    const reactionsContainer = messageElement.querySelector('.reactions');
    if (reactionsContainer) {
        reactionsContainer.innerHTML = createReactionsElement(data.reactions);
    } else {
        const newReactionsContainer = document.createElement('div');
        newReactionsContainer.className = 'reactions';
        newReactionsContainer.innerHTML = createReactionsElement(data.reactions);
        messageElement.querySelector('.message-content').after(newReactionsContainer);
    }
}

// Update edited message
function updateEditedMessage(data) {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found:', data.messageId);
        return;
    }
    
    const contentElement = messageElement.querySelector('.message-content');
    contentElement.innerHTML = formatMessageText(data.content);
    
    // Add edited indicator if not already present
    let editedIndicator = messageElement.querySelector('.edited-indicator');
    if (!editedIndicator) {
        editedIndicator = document.createElement('span');
        editedIndicator.className = 'edited-indicator';
        editedIndicator.textContent = '(edited)';
        const footer = messageElement.querySelector('.message-footer');
        footer.insertBefore(editedIndicator, footer.firstChild);
    }
}

// Handle deleted message
function handleDeletedMessage(data) {
    console.log('Handling deleted message:', data);
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found:', data.messageId);
        return;
    }
    
    const contentElement = messageElement.querySelector('.message-content');
    if (contentElement) {
        contentElement.className = 'message-content deleted';
        contentElement.textContent = 'This message has been deleted';
    }
    
    // Remove all action buttons
    const actionsElement = messageElement.querySelector('.message-actions');
    if (actionsElement) {
        actionsElement.remove();
    }
    
    // Add deleted indicator
    const footer = messageElement.querySelector('.message-footer');
    if (footer) {
        const deletedIndicator = document.createElement('span');
        deletedIndicator.className = 'deleted-indicator';
        deletedIndicator.textContent = '(deleted)';
        footer.insertBefore(deletedIndicator, footer.firstChild);
    }
}

// Handle moderated message
function handleModeratedMessage(data) {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    if (!messageElement) return;
    
    if (data.action === 'deleted') {
        handleDeletedMessage(data);
    }
    
    // Show moderation notice
    const notice = document.createElement('div');
    notice.className = 'moderation-notice';
    notice.textContent = `Message ${data.action} by moderator: ${data.reason}`;
    messageElement.appendChild(notice);
}

// Send read receipt
function sendReadReceipt(messageId) {
    try {
        ws.send(JSON.stringify({
            type: 'read_receipt',
            messageId: messageId
        }));
    } catch (error) {
        console.error('Error sending read receipt:', error);
    }
}

// Update read receipts
function updateReadReceipts(data) {
    const messageElement = document.querySelector(`.message[data-message-id="${data.messageId}"]`);
    if (!messageElement) return;
    
    const footer = messageElement.querySelector('.message-footer');
    const readBy = document.createElement('span');
    readBy.className = 'read-by';
    readBy.textContent = `Read by ${data.readBy.length} user${data.readBy.length !== 1 ? 's' : ''}`;
    footer.appendChild(readBy);
}

// Show reaction picker
function showReactionPicker(messageId) {
    selectedMessageId = messageId;
    
    if (!emojiPicker) {
        emojiPicker = document.createElement('emoji-picker');
        document.body.appendChild(emojiPicker);
        
        emojiPicker.addEventListener('emoji-click', event => {
            if (selectedMessageId) {
                addReaction(selectedMessageId, event.detail.unicode);
                hideEmojiPicker();
            }
        });
    }
    
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const button = messageElement.querySelector('.reaction-btn');
    const rect = button.getBoundingClientRect();
    
    emojiPicker.style.position = 'fixed';
    emojiPicker.style.top = `${rect.bottom + 5}px`;
    emojiPicker.style.left = `${rect.left}px`;
    emojiPicker.style.display = 'block';
    
    // Close picker when clicking outside
    document.addEventListener('click', hideEmojiPicker);
}

// Hide emoji picker
function hideEmojiPicker(event) {
    if (emojiPicker && (!event || !emojiPicker.contains(event.target))) {
        emojiPicker.style.display = 'none';
        document.removeEventListener('click', hideEmojiPicker);
        selectedMessageId = null;
    }
}

// Start editing a message
function startEditMessage(messageId) {
    selectedMessageId = messageId;
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    const messageContent = messageElement.querySelector('.message-content').textContent;
    
    const editInput = document.getElementById('editMessageInput');
    editInput.value = messageContent;
    editModal.show();
    
    const saveButton = document.getElementById('saveEditButton');
    saveButton.onclick = async () => {
        const newText = editInput.value.trim();
        if (newText && newText !== messageContent) {
            await editMessage(messageId, newText);
            editModal.hide();
        }
    };
}

// Confirm message deletion
function confirmDeleteMessage(messageId) {
    if (!messageId) {
        console.error('No message ID provided for deletion');
        return;
    }
    
    selectedMessageId = Number(messageId);
    
    // Get the message content
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found');
        return;
    }
    
    const messageContent = messageElement.querySelector('.message-content').textContent;
    
    // Update modal content
    const modalBody = document.querySelector('#deleteModal .modal-body');
    if (modalBody) {
        modalBody.innerHTML = `
            <p>Are you sure you want to delete this message?</p>
            <div class="message-preview">${messageContent}</div>
            <p class="text-danger mt-3">This action cannot be undone.</p>
        `;
    }
    
    // Get the confirm button
    const confirmButton = document.getElementById('confirmDeleteButton');
    if (!confirmButton) {
        console.error('Delete confirmation button not found');
        return;
    }
    
    // Show the modal
    if (deleteModal) {
        deleteModal.show();
        
        // Remove any existing click handlers
        confirmButton.onclick = null;
        
        // Add new click handler
        confirmButton.onclick = async () => {
            console.log('Deleting message:', selectedMessageId);
            await deleteMessage(selectedMessageId);
            deleteModal.hide();
        };
    } else {
        console.error('Delete modal not initialized');
    }
}

// Update online users count and list
function updateOnlineUsers(data) {
    console.log('Updating online users:', data);
    const onlineCount = document.getElementById('onlineCount');
    if (onlineCount) {
        onlineCount.textContent = data.count || 0;
    }
}

// Add reply functionality
function startReply(messageId) {
    console.log('Starting reply to message:', messageId);
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) {
        console.error('Message element not found');
        return;
    }

    replyToMessageId = messageId;
    
    // Show reply preview
    if (replyPreview) {
        const messageContent = messageElement.querySelector('.message-content');
        const username = messageElement.querySelector('.username').textContent;
        const isFile = messageElement.querySelector('.file-preview');
        
        let previewContent = '';
        if (isFile) {
            const fileName = messageElement.querySelector('.file-name-text').textContent;
            previewContent = `File: ${fileName}`;
        } else {
            previewContent = messageContent ? messageContent.textContent : '';
        }
            
        replyPreview.innerHTML = `
            <div class="reply-preview-content">
                <small class="text-muted">Replying to ${username}</small>
                <p class="mb-0">${escapeHtml(previewContent)}</p>
                <button type="button" class="btn-close" id="cancelReply" aria-label="Cancel reply"></button>
            </div>
        `;
        replyPreview.style.display = 'block';
        
        // Add event listener to the new cancel button
        const cancelButton = replyPreview.querySelector('#cancelReply');
        if (cancelButton) {
            cancelButton.addEventListener('click', cancelReply);
        }

        // Add class to chat messages container to adjust padding
        chatMessages.classList.add('with-reply');
    }
    
    // Focus the input field
    messageInput.focus();
}

function cancelReply() {
    replyToMessageId = null;
    if (replyPreview) {
        replyPreview.style.display = 'none';
        replyPreview.innerHTML = '';
        // Remove the class from chat messages container
        chatMessages.classList.remove('with-reply');
    }
}

// Generate a consistent color for a username
function generateUsernameColor(username) {
    // Use a hash function to generate a consistent number from the username
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    
    // Convert the hash to a hue value (0-360)
    const hue = Math.abs(hash % 360);
    
    // Use a fixed saturation and lightness for readable colors
    // For dark mode messages (sent), use lighter colors
    // For light mode messages (received), use darker colors
    return `hsl(${hue}, 70%, 45%)`;
}

// Initialize chat when page loads
document.addEventListener('DOMContentLoaded', initializeChat);
