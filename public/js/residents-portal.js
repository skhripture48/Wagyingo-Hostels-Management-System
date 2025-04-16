// Check if user is logged in and has an approved payment
async function checkResidentAccess() {
    try {
        const response = await fetch('/api/check-resident-status', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            window.location.href = '/index.html';
            return false;
        }
        
        const data = await response.json();
        if (!data.isResident) {
            alert('Access denied. Only approved residents can access this portal.');
            window.location.href = '/index.html';
            return false;
        }
        
        // Update UI with user info
        document.getElementById('username').textContent = data.username;

        // Set background based on hostel
        if (data.hostel_name) {
            const backgroundImage = getHostelBackground(data.hostel_name);
            document.body.style.backgroundImage = `url('/assets/${backgroundImage}')`;
            document.body.style.backgroundSize = 'cover';
            document.body.style.backgroundPosition = 'center';
            document.body.style.backgroundAttachment = 'fixed';
            document.body.style.backgroundRepeat = 'no-repeat';
            
            // Add a semi-transparent overlay to ensure content readability
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
            overlay.style.zIndex = '-1';
            document.body.insertBefore(overlay, document.body.firstChild);

            // Add a subtle gradient overlay for better text contrast
            const gradientOverlay = document.createElement('div');
            gradientOverlay.style.position = 'fixed';
            gradientOverlay.style.top = '0';
            gradientOverlay.style.left = '0';
            gradientOverlay.style.width = '100%';
            gradientOverlay.style.height = '100%';
            gradientOverlay.style.background = 'linear-gradient(135deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.1) 100%)';
            gradientOverlay.style.zIndex = '-1';
            document.body.insertBefore(gradientOverlay, document.body.firstChild);
        }
        
        return true;
    } catch (error) {
        console.error('Error checking resident status:', error);
        window.location.href = '/index.html';
        return false;
    }
}

// Helper function to get the correct background image based on hostel name
function getHostelBackground(hostelName) {
    const hostelMap = {
        'Wagyingo Main Hostel': 'main-slider.jpg',
        'Wagyingo Onyx Hostel': 'onyx-slider.jpg',
        'Wagyingo Opal Hostel': 'opal-slider.jpg'
    };
    return hostelMap[hostelName] || 'main-slider.jpg'; // Default to main if hostel not found
}

// Submit new maintenance request
async function submitRequest() {
    const form = document.getElementById('newRequestForm');
    const formData = new FormData(form);
    const requestData = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch('/api/maintenance', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(requestData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to submit request');
        }
        
        // Close modal using Bootstrap's modal API
        const modalElement = document.getElementById('newRequestModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
        }
        
        // Reset form
        form.reset();
        
        // Show success message
        showNotification('Maintenance request submitted successfully', 'success');
        
        // Reload recent maintenance requests
        await loadRecentMaintenance();
    } catch (error) {
        console.error('Error submitting request:', error);
        showNotification(error.message, 'error');
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'info': 'alert-info',
        'warning': 'alert-warning'
    }[type];

    const alert = document.createElement('div');
    alert.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alert.style.zIndex = '1050';
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alert);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Load recent maintenance requests
async function loadRecentMaintenance() {
    try {
        const response = await fetch('/api/maintenance/recent', {
            credentials: 'include'
        });
        const requests = await response.json();
        
        const container = document.getElementById('recentMaintenance');
        if (requests.length === 0) {
            container.innerHTML = '<p class="text-muted">No recent maintenance requests</p>';
            return;
        }
        
        container.innerHTML = requests.slice(0, 3).map(request => `
            <div class="mb-3 p-2">
                <h6 class="mb-1">${request.title}</h6>
                <p class="mb-1 small">
                    <span class="badge bg-${getStatusBadgeColor(request.status)}">${request.status}</span>
                    <span class="text-muted ms-2">${new Date(request.created_at).toLocaleDateString()}</span>
                </p>
                <p class="mb-0">${request.description.substring(0, 100)}...</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading maintenance requests:', error);
        document.getElementById('recentMaintenance').innerHTML = 
            '<p class="text-danger">Error loading maintenance requests</p>';
    }
}

// Helper function to get badge color based on status
function getStatusBadgeColor(status) {
    const colors = {
        'pending': 'warning',
        'in_progress': 'info',
        'completed': 'success',
        'cancelled': 'danger'
    };
    return colors[status] || 'secondary';
}

// Load recent announcements
async function loadRecentAnnouncements() {
    try {
        const response = await fetch('/api/announcements/recent', {
            credentials: 'include'
        });
        const announcements = await response.json();
        
        const container = document.getElementById('recentAnnouncements');
        if (announcements.length === 0) {
            container.innerHTML = '<p class="text-muted">No recent announcements</p>';
            return;
        }
        
        container.innerHTML = announcements.map(announcement => `
            <div class="mb-3 p-2">
                <h6 class="mb-1">${announcement.title}</h6>
                <p class="mb-1 small text-muted">
                    ${new Date(announcement.created_at).toLocaleDateString()}
                </p>
                <p class="mb-0">${announcement.content.substring(0, 100)}...</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading announcements:', error);
        document.getElementById('recentAnnouncements').innerHTML = 
            '<p class="text-danger">Error loading announcements</p>';
    }
}

// Load upcoming events
async function loadUpcomingEvents() {
    try {
        const response = await fetch('/api/events/upcoming', {
            credentials: 'include'
        });
        const events = await response.json();
        
        const container = document.getElementById('upcomingEvents');
        if (events.length === 0) {
            container.innerHTML = '<p class="text-muted">No upcoming events</p>';
            return;
        }
        
        container.innerHTML = events.map(event => `
            <div class="mb-3 p-2">
                <h6 class="mb-1">${event.title}</h6>
                <p class="mb-1 small text-muted">
                    <i class="bi bi-calendar"></i> ${new Date(event.event_date).toLocaleDateString()}
                    <span class="ms-2">
                        <i class="bi bi-people"></i> ${event.registered_count}/${event.max_participants || '∞'}
                    </span>
                </p>
                <p class="mb-0">${event.description.substring(0, 100)}...</p>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('upcomingEvents').innerHTML = 
            '<p class="text-danger">Error loading events</p>';
    }
}

// Load notifications
async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications', {
            credentials: 'include'
        });
        const notifications = await response.json();
        
        const countElement = document.getElementById('notificationCount');
        const listElement = document.getElementById('notificationsList');
        
        // Filter unread notifications
        const unreadNotifications = notifications.filter(n => !n.viewed);
        
        // Update notification count
        countElement.textContent = unreadNotifications.length;
        countElement.style.display = unreadNotifications.length > 0 ? 'inline' : 'none';
        
        if (notifications.length === 0) {
            listElement.innerHTML = '<li><a class="dropdown-item" href="#">No new notifications</a></li>';
            return;
        }
        
        // Create notification list items with click handlers
        listElement.innerHTML = notifications.map(notification => {
            // Construct the proper link based on notification type
            let itemLink = '';
            if (notification.type === 'maintenance') {
                itemLink = `/maintenance.html?id=${notification.notification_id}#request-${notification.notification_id}`;
            } else if (notification.type === 'announcement') {
                itemLink = `/announcements.html?id=${notification.notification_id}#announcement-${notification.notification_id}`;
            }
            
            return `
                <li>
                    <a class="dropdown-item ${notification.viewed ? 'text-muted' : ''}" 
                       href="javascript:void(0)"
                       onclick="handleNotificationClick(event, '${notification.type}', ${notification.notification_id}, '${itemLink}')">
                        <div class="small text-muted">${new Date(notification.created_at).toLocaleDateString()}</div>
                        ${notification.message}
                    </a>
                </li>
            `;
        }).join('');
    } catch (error) {
        console.error('Error loading notifications:', error);
        document.getElementById('notificationCount').style.display = 'none';
        document.getElementById('notificationsList').innerHTML = 
            '<li><a class="dropdown-item" href="#">Error loading notifications</a></li>';
    }
}

// Handle notification click
async function handleNotificationClick(event, type, id, link) {
    event.preventDefault();
    
    try {
        // Mark notification as viewed
        const response = await fetch(`/api/notifications/${type}/${id}/viewed`, {
            method: 'POST',
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to mark notification as viewed');
        }

        // Update the notification's appearance immediately
        event.currentTarget.classList.add('text-muted');
        
        // Update notification count immediately
        const countElement = document.getElementById('notificationCount');
        const currentCount = parseInt(countElement.textContent);
        if (currentCount > 0) {
            countElement.textContent = currentCount - 1;
            if (currentCount - 1 === 0) {
                countElement.style.display = 'none';
            }
        }
        
        // Navigate to the link
        window.location.href = link;
    } catch (error) {
        console.error('Error handling notification click:', error);
        // If there's an error, still try to navigate
        window.location.href = link;
    }
}

// Initialize the portal
async function initPortal() {
    const hasAccess = await checkResidentAccess();
    if (!hasAccess) return;
    
    await Promise.all([
        loadRecentAnnouncements(),
        loadRecentMaintenance(),
        loadUpcomingEvents(),
        loadNotifications()
    ]);
}

// Start the application
document.addEventListener('DOMContentLoaded', initPortal); 