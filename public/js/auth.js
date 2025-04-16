// Check if user is logged in
function checkAuth() {
    return fetch('/api/check-session', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(data => {
        if (data.username) {
            // Update UI with user data
            document.getElementById('username').textContent = data.username;
            // Dispatch event with user data
            const event = new CustomEvent('userDataLoaded', { detail: data });
            document.dispatchEvent(event);
            return data;
        } else {
            window.location.href = '/login.html';
        }
    })
    .catch(error => {
        console.error('Auth check failed:', error);
        window.location.href = '/login.html';
    });
}

// Logout function
function logout() {
    fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
    })
    .then(() => {
        window.location.href = '/login.html';
    })
    .catch(error => {
        console.error('Logout failed:', error);
    });
}

// Check auth when page loads
document.addEventListener('DOMContentLoaded', checkAuth); 