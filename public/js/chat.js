let ws;
let currentUser;
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendMessage');
const chatMessages = document.getElementById('chatMessages');
const hostelNameSpan = document.getElementById('hostelName');
const onlineUsersList = document.getElementById('onlineUsersList');

// Store user data when it's loaded
document.addEventListener('userDataLoaded', (event) => {
    currentUser = event.detail;
    initializeChat(currentUser);
});

function initializeChat(user) {
    if (!user || !user.preferred_hostel) {
        console.error('User or hostel information missing');
        return;
    }

    hostelNameSpan.textContent = user.preferred_hostel;

    // Create WebSocket connection
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
        console.log('Connected to chat server');
        // Join the hostel's chat room
        ws.send(JSON.stringify({
            type: 'join',
            hostel: user.preferred_hostel,
            userId: user.id,
            username: user.username
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.type === 'history') {
            // Display chat history
            chatMessages.innerHTML = ''; // Clear existing messages
            data.messages.forEach(message => {
                appendMessage(message, user.id);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else if (data.type === 'message') {
            // Display new message
            appendMessage(data, user.id);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else if (data.type === 'users') {
            // Update online users list
            updateOnlineUsers(data.users);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        showToast('Error connecting to chat server', 'error');
    };

    ws.onclose = () => {
        console.log('Disconnected from chat server');
        showToast('Chat connection lost. Please refresh the page.', 'warning');
    };
}

function appendMessage(message, currentUserId) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${message.user_id === currentUserId ? 'sent' : 'received'}`;

    const usernameDiv = document.createElement('div');
    usernameDiv.className = 'username';
    usernameDiv.textContent = message.username;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.textContent = message.message;

    const timestampDiv = document.createElement('div');
    timestampDiv.className = 'timestamp';
    timestampDiv.textContent = new Date(message.created_at || Date.now()).toLocaleTimeString();

    messageDiv.appendChild(usernameDiv);
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timestampDiv);

    chatMessages.appendChild(messageDiv);
}

function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    
    if (!users || users.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'text-muted text-center p-3';
        emptyState.textContent = 'No users online';
        onlineUsersList.appendChild(emptyState);
        return;
    }

    users.forEach(user => {
        const userDiv = document.createElement('div');
        userDiv.className = 'user mb-2';
        
        const statusDiv = document.createElement('div');
        statusDiv.className = 'user-status';
        
        const nameDiv = document.createElement('div');
        nameDiv.className = 'user-name';
        nameDiv.textContent = user.username;
        
        if (user.userId === currentUser.id) {
            nameDiv.textContent += ' (You)';
            nameDiv.className += ' fw-bold';
        }
        
        userDiv.appendChild(statusDiv);
        userDiv.appendChild(nameDiv);
        onlineUsersList.appendChild(userDiv);
    });

    // Update the total count
    const countDiv = document.createElement('div');
    countDiv.className = 'mt-3 text-muted small';
    countDiv.textContent = `${users.length} user${users.length !== 1 ? 's' : ''} online`;
    onlineUsersList.appendChild(countDiv);
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'message',
            message: message,
            hostel: currentUser.preferred_hostel,
            userId: currentUser.id,
            username: currentUser.username
        }));
        messageInput.value = '';
    }
}

// Send message when button is clicked
sendButton.addEventListener('click', sendMessage);

// Send message when Enter key is pressed
messageInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        sendMessage();
    }
});

// Show toast messages
function showToast(message, type = 'info') {
    // You can implement your preferred toast notification here
    console.log(`${type.toUpperCase()}: ${message}`);
} 