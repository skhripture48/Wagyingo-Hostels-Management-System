// Initialize Bootstrap components
const successToast = new bootstrap.Toast(document.getElementById('successToast'));

// DOM Elements
const profilePicture = document.getElementById('profilePicture');
const profilePictureInput = document.getElementById('profilePictureInput');
const personalInfoForm = document.getElementById('personalInfoForm');
const displayUsername = document.getElementById('displayUsername');
const userEmail = document.getElementById('userEmail');
const recentActivity = document.getElementById('recentActivity');

// Load user data when page loads
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadUserProfile();
        await loadUserStats();
        await loadRecentActivity();
        loadNotificationSettings();
    } catch (error) {
        console.error('Error initializing profile:', error);
        showError('Failed to load profile data');
    }
});

// Handle profile picture upload
profilePictureInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showError('Please select an image file');
        return;
    }

    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
        showError('Image size should be less than 5MB');
        return;
    }

    try {
        const formData = new FormData();
        formData.append('profilePicture', file);

        const response = await fetch('/api/profile/upload-picture', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to upload profile picture');

        const data = await response.json();
        profilePicture.src = data.imageUrl;
        showSuccess('Profile picture updated successfully');
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        showError('Failed to upload profile picture');
    }
});

// Handle personal information form submission
personalInfoForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(personalInfoForm);
    const data = Object.fromEntries(formData.entries());

    try {
        const response = await fetch('/api/profile/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data),
            credentials: 'include'
        });

        if (!response.ok) throw new Error('Failed to update profile');

        const result = await response.json();
        displayUsername.textContent = result.username;
        showSuccess('Profile updated successfully');
    } catch (error) {
        console.error('Error updating profile:', error);
        showError('Failed to update profile');
    }
});

// Handle notification settings changes
document.querySelectorAll('.form-check-input').forEach(input => {
    input.addEventListener('change', async (e) => {
        const setting = e.target.id;
        const enabled = e.target.checked;

        try {
            const response = await fetch('/api/profile/notifications', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    setting,
                    enabled
                }),
                credentials: 'include'
            });

            if (!response.ok) throw new Error('Failed to update notification settings');

            showSuccess('Notification settings updated');
        } catch (error) {
            console.error('Error updating notification settings:', error);
            showError('Failed to update notification settings');
            e.target.checked = !enabled; // Revert the change
        }
    });
});

// Load user profile data
async function loadUserProfile() {
    const response = await fetch('/api/profile', {
        credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load profile');
    
    const data = await response.json();
    
    // Update profile picture if exists
    if (data.profile_picture) {
        profilePicture.src = data.profile_picture;
    }
    
    // Update form fields
    displayUsername.textContent = data.username;
    userEmail.textContent = data.email;
    document.getElementById('username').value = data.username;
    document.getElementById('email').value = data.email;
    document.getElementById('phone').value = data.phone || '';
    document.getElementById('preferredHostel').value = data.preferred_hostel || '';
}

// Load user statistics
async function loadUserStats() {
    const response = await fetch('/api/profile/stats', {
        credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load stats');
    
    const data = await response.json();
    
    document.getElementById('bookingsCount').textContent = data.roomNumber;
    document.getElementById('bookingsCount').parentElement.querySelector('.stat-label').textContent = 'Room Number';
    document.getElementById('messagesCount').textContent = data.messages || 0;
    document.getElementById('daysActive').textContent = data.daysActive || 0;
}

// Load notification settings
async function loadNotificationSettings() {
    const response = await fetch('/api/profile/notifications', {
        credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load notification settings');
    
    const data = await response.json();
    
    document.getElementById('emailNotifications').checked = data.emailNotifications || false;
    document.getElementById('chatNotifications').checked = data.chatNotifications || false;
    document.getElementById('communityNotifications').checked = data.communityNotifications || false;
}

// Load recent activity
async function loadRecentActivity() {
    const response = await fetch('/api/profile/activity', {
        credentials: 'include'
    });
    
    if (!response.ok) throw new Error('Failed to load activity');
    
    const activities = await response.json();
    
    recentActivity.innerHTML = activities.map(activity => `
        <div class="activity-item">
            <div class="activity-icon">
                <i class="bi ${getActivityIcon(activity.type)}"></i>
            </div>
            <div class="activity-details">
                <div>${activity.description}</div>
                <small class="activity-time">${formatTimestamp(activity.timestamp)}</small>
            </div>
        </div>
    `).join('');
}

// Helper function to get activity icon
function getActivityIcon(type) {
    const icons = {
        booking: 'bi-calendar-check',
        message: 'bi-chat',
        login: 'bi-box-arrow-in-right',
        profile: 'bi-person',
        payment: 'bi-credit-card',
        default: 'bi-clock-history'
    };
    return icons[type] || icons.default;
}

// Format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Show success message
function showSuccess(message) {
    const toast = document.getElementById('successToast');
    toast.querySelector('.toast-body').textContent = message;
    successToast.show();
}

// Show error message
function showError(message) {
    // You can implement your preferred error display method here
    alert(message); // For now, using a simple alert
} 