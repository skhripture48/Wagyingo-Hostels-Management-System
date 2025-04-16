// Store announcements globally for filtering
let allAnnouncements = [];

// Check resident access
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
        return true;
    } catch (error) {
        console.error('Error checking resident status:', error);
        window.location.href = '/index.html';
        return false;
    }
}

// Load announcements
async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error(await response.text());
        }
        
        const announcements = await response.json();
        
        // Store announcements globally
        allAnnouncements = announcements;
        
        displayAnnouncements(announcements);
    } catch (error) {
        console.error('Error loading announcements:', error);
        document.getElementById('announcementsContainer').innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle-fill"></i>
                    Error loading announcements. Please try refreshing the page.
                    <br><small class="text-muted">${error.message}</small>
                </div>
            </div>
        `;
    }
}

// Display announcements
function displayAnnouncements(announcements) {
    const container = document.getElementById('announcementsContainer');
    
    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    <i class="bi bi-info-circle"></i>
                    No announcements found.
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = announcements.map(announcement => `
        <div class="col-md-6 col-lg-4 mb-4">
            <div class="card announcement-card h-100 shadow-sm priority-${announcement.priority.toLowerCase()}" 
                 data-priority="${announcement.priority.toLowerCase()}"
                 onclick="showAnnouncementDetails(${announcement.id})">
                <div class="card-body">
                    <h5 class="card-title">${announcement.title}</h5>
                    <div class="mb-3">
                        <span class="badge bg-${getPriorityBadgeColor(announcement.priority)}">
                            ${announcement.priority}
                        </span>
                        <span class="badge bg-secondary ms-2">
                            ${announcement.hostel_name === 'all' ? 'All Hostels' : announcement.hostel_name}
                        </span>
                    </div>
                    <p class="card-text">${truncateText(announcement.content, 150)}</p>
                    <div class="card-text mt-auto">
                        <small class="text-muted">
                            <i class="bi bi-calendar"></i> Posted: ${formatDate(announcement.created_at)}
                            ${announcement.end_date ? `<br><i class="bi bi-clock"></i> Expires: ${formatDate(announcement.end_date)}` : ''}
                        </small>
                        ${announcement.created_by_name ? `
                            <br><small class="text-muted">
                                <i class="bi bi-person"></i> Posted by: ${announcement.created_by_name}
                            </small>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Show announcement details
async function showAnnouncementDetails(announcementId) {
    try {
        // Fetch the announcement details from the API
        const response = await fetch(`/api/announcements/${announcementId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load announcement');
        }
        
        const announcement = await response.json();
        
        const modalContent = document.getElementById('announcementContent');
        modalContent.innerHTML = `
            <div class="mb-4">
                <h4>${announcement.title}</h4>
                <div class="d-flex gap-3 mb-3">
                    <span class="badge bg-${getPriorityBadgeColor(announcement.priority)}">
                        ${announcement.priority}
                    </span>
                    <span class="badge bg-secondary">
                        ${announcement.hostel_name === 'all' ? 'All Hostels' : announcement.hostel_name}
                    </span>
                </div>
                <div class="text-muted mb-3">
                    <small>
                        <i class="bi bi-calendar"></i> Posted: ${formatDate(announcement.created_at)}
                        ${announcement.end_date ? `<br><i class="bi bi-clock"></i> Expires: ${formatDate(announcement.end_date)}` : ''}
                        ${announcement.created_by_name ? `<br><i class="bi bi-person"></i> Posted by: ${announcement.created_by_name}` : ''}
                    </small>
                </div>
                <div class="announcement-content">
                    ${announcement.content}
                </div>
            </div>
        `;
        
        // Show modal
        const modalElement = document.getElementById('announcementModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // Add event listener for modal close
        modalElement.addEventListener('hidden.bs.modal', function () {
            modalContent.innerHTML = '';
        });
    } catch (error) {
        console.error('Error showing announcement details:', error);
        showNotification('Error loading announcement details. Please try again.', 'error');
    }
}

// Filter announcements
function filterAnnouncements() {
    const priorityFilter = document.getElementById('priorityFilter').value.toLowerCase();
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();

    const filtered = allAnnouncements.filter(announcement => {
        const matchesPriority = !priorityFilter || announcement.priority.toLowerCase() === priorityFilter;
        const matchesSearch = !searchQuery || 
            announcement.title.toLowerCase().includes(searchQuery) || 
            announcement.content.toLowerCase().includes(searchQuery);

        return matchesPriority && matchesSearch;
    });
    
    displayAnnouncements(filtered);
}

// Search announcements
function searchAnnouncements() {
    filterAnnouncements();
}

// Helper function to get badge color based on priority
function getPriorityBadgeColor(priority) {
    switch (priority.toLowerCase()) {
        case 'urgent':
            return 'danger';
        case 'important':
            return 'warning';
        case 'normal':
            return 'info';
        default:
            return 'secondary';
    }
}

// Helper function to truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Helper function to format date
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Show notification
function showNotification(message, type = 'info') {
    const alertClass = {
        'success': 'alert-success',
        'error': 'alert-danger',
        'info': 'alert-info',
        'warning': 'alert-warning'
    }[type];

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert ${alertClass} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
    alertDiv.style.zIndex = '1050';
    alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    document.body.appendChild(alertDiv);
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
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

// Logout function
function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    }).then(() => {
        window.location.href = '/index.html';
    }).catch(error => {
        console.error('Error logging out:', error);
        window.location.href = '/index.html';
    });
}

// Initialize the page
async function initPage() {
    const hasAccess = await checkResidentAccess();
    if (!hasAccess) return;
    
    // Check for specific announcement ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const announcementId = urlParams.get('id');
    
    if (announcementId) {
        await showAnnouncementDetails(announcementId);
    }
    
    await Promise.all([
        loadAnnouncements(),
        loadNotifications()
    ]);
    
    // Add event listener for search input
    document.getElementById('searchInput').addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchAnnouncements();
        }
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', initPage); 