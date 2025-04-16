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

// Load maintenance requests
async function loadMaintenanceRequests() {
    try {
        const response = await fetch('/api/maintenance/recent', {
            credentials: 'include'
        });
        const requests = await response.json();
        
        const container = document.getElementById('requestsContainer');
        if (requests.length === 0) {
            container.innerHTML = `
                <div class="col-12">
                    <div class="alert alert-info">
                        No maintenance requests found. Click "New Request" to submit one.
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = requests.map(request => `
            <div class="col-md-6 col-lg-4">
                <div class="card request-card h-100" onclick="showRequestDetails(${request.id})">
                    <div class="card-body">
                        <span class="badge bg-${getStatusBadgeColor(request.status)} status-badge">
                            ${request.status}
                        </span>
                        <h5 class="card-title mb-3">${request.title}</h5>
                        <p class="card-text">
                            <small class="text-muted">
                                <i class="bi bi-tag"></i> ${request.category}
                                <span class="ms-2">
                                    <i class="bi bi-exclamation-triangle"></i> ${request.priority}
                                </span>
                            </small>
                        </p>
                        <p class="card-text">${request.description.substring(0, 100)}...</p>
                        <p class="card-text">
                            <small class="text-muted">
                                <i class="bi bi-calendar"></i> ${new Date(request.created_at).toLocaleDateString()}
                            </small>
                        </p>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading maintenance requests:', error);
        document.getElementById('requestsContainer').innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    Error loading maintenance requests. Please try refreshing the page.
                </div>
            </div>
        `;
    }
}

// Submit new request
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
        
        // Close modal and reload requests
        const modal = bootstrap.Modal.getInstance(document.getElementById('newRequestModal'));
        modal.hide();
        form.reset();
        
        // Show success message
        showNotification('Maintenance request submitted successfully', 'success');
        
        // Reload requests
        await loadMaintenanceRequests();
    } catch (error) {
        console.error('Error submitting request:', error);
        showNotification(error.message, 'error');
    }
}

// Show request details
async function showRequestDetails(requestId) {
    try {
        const response = await fetch(`/api/maintenance/${requestId}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load request details');
        }
        
        const request = await response.json();
        
        const content = document.getElementById('requestDetailsContent');
        content.innerHTML = `
            <div class="mb-4">
                <h4>${request.title}</h4>
                <div class="d-flex gap-3 mb-3">
                    <span class="badge bg-${getStatusBadgeColor(request.status)}">
                        ${request.status}
                    </span>
                    <span class="badge bg-secondary">${request.category}</span>
                    <span class="badge bg-info">${request.priority}</span>
                </div>
                <p>${request.description}</p>
            </div>
            <div class="mb-4">
                <h5>Location</h5>
                <p>
                    Room ${request.room_number}<br>
                    ${request.hostel_name}
                </p>
            </div>
            <div class="mb-4">
                <h5>Update Status</h5>
                <form id="statusUpdateForm" onsubmit="updateRequestStatus(event, ${request.id})">
                    <div class="mb-3">
                        <label for="newStatus" class="form-label">New Status</label>
                        <select class="form-select" id="newStatus" name="status" required>
                            <option value="">Select status...</option>
                            <option value="pending">Pending</option>
                            <option value="completed">Completed</option>
                        </select>
                    </div>
                    <div class="mb-3">
                        <label for="statusComment" class="form-label">Comment (optional)</label>
                        <textarea class="form-control" id="statusComment" name="comment" rows="2" 
                            placeholder="Add a comment about why you're updating the status..."></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Update Status</button>
                </form>
            </div>
            <div>
                <h5>Status Updates</h5>
                <div class="timeline">
                    ${request.updates ? request.updates.map(update => `
                        <div class="timeline-item">
                            <div class="timeline-date">
                                ${new Date(update.created_at).toLocaleDateString()}
                            </div>
                            <div class="timeline-content">
                                <div class="badge bg-${getStatusBadgeColor(update.status)}">
                                    ${update.status}
                                </div>
                                ${update.comment ? `<p class="mt-2">${update.comment}</p>` : ''}
                            </div>
                        </div>
                    `).join('') : '<p class="text-muted">No updates yet</p>'}
                </div>
            </div>
        `;
        
        // Get the modal element
        const modalElement = document.getElementById('requestDetailsModal');
        
        // Remove any existing event listeners
        const newModalElement = modalElement.cloneNode(true);
        modalElement.parentNode.replaceChild(newModalElement, modalElement);
        
        // Show modal
        const modal = new bootstrap.Modal(newModalElement);
        modal.show();
        
        // Add event listener for modal close
        newModalElement.addEventListener('hidden.bs.modal', function () {
            // Clean up the modal instance
            modal.dispose();
            // Reset the content
            document.getElementById('requestDetailsContent').innerHTML = '';
        });
    } catch (error) {
        console.error('Error loading request details:', error);
        showNotification('Failed to load maintenance request details. Please try again.', 'error');
    }
}

// Update request status
async function updateRequestStatus(event, requestId) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    try {
        const response = await fetch(`/api/maintenance/${requestId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update status');
        }
        
        // Show success message
        showNotification('Status updated successfully', 'success');
        
        // Refresh the request details
        await showRequestDetails(requestId);
        
        // Reload the main requests list
        await loadMaintenanceRequests();
        
    } catch (error) {
        console.error('Error updating status:', error);
        showNotification(error.message || 'Failed to update status', 'error');
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
    
    // Check for specific request ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const requestId = urlParams.get('id');
    
    if (requestId) {
        await showRequestDetails(requestId);
        const modal = new bootstrap.Modal(document.getElementById('requestDetailsModal'));
        modal.show();
    }
    
    await Promise.all([
        loadMaintenanceRequests(),
        loadNotifications()
    ]);
}

// Start the application
document.addEventListener('DOMContentLoaded', initPage); 