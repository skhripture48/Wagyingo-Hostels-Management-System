// Store events globally for filtering
let allEvents = [];
let selectedEventId = null;

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

// Load events
async function loadEvents() {
    try {
        console.log('Loading events...');
        const response = await fetch('/api/events/upcoming', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load events');
        }
        
        const events = await response.json();
        console.log('Loaded events:', events);
        
        // Store events globally
        allEvents = events;
        
        displayEvents(events);
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('eventsContainer').innerHTML = `
            <div class="col-12">
                <div class="alert alert-danger">
                    Error loading events. Please try refreshing the page.
                </div>
            </div>
        `;
    }
}

// Display events
function displayEvents(events) {
    const container = document.getElementById('eventsContainer');
    console.log('Displaying events:', events.length);
    
    if (!events || events.length === 0) {
        container.innerHTML = `
            <div class="col-12">
                <div class="alert alert-info">
                    No events found.
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = events.map(event => {
        const eventDate = new Date(event.event_date);
        const isPast = eventDate < new Date();
        const isFull = event.capacity && event.registered_count >= event.capacity;
        
        console.log('Event details:', {
            id: event.id,
            title: event.title,
            date: eventDate,
            isPast,
            isFull,
            registered: event.registered_count,
            capacity: event.capacity
        });
        
        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card event-card h-100 ${isPast ? 'registration-closed' : ''}" 
                     onclick="showEventDetails(${event.id})">
                    <div class="card-body">
                        <span class="badge bg-${getCapacityBadgeColor(event)} event-capacity">
                            ${event.registered_count || 0}/${event.capacity || '∞'}
                        </span>
                        <h5 class="card-title">${event.title}</h5>
                        <p class="event-date mb-2">
                            <i class="bi bi-calendar"></i> 
                            ${eventDate.toLocaleDateString()} ${event.event_time}
                        </p>
                        <p class="event-location mb-2">
                            <i class="bi bi-geo-alt"></i> ${event.location}
                        </p>
                        <p class="event-hostel mb-2">
                            <i class="bi bi-building"></i> ${event.hostel_name}
                        </p>
                        <p class="card-text">${event.description}</p>
                        ${event.is_registered ? '<div class="mt-2"><span class="badge bg-success">Registered</span></div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Handle event registration/deregistration
async function handleEventRegistration() {
    if (!selectedEventId) return;
    
    const event = allEvents.find(e => e.id === selectedEventId);
    if (!event) return;

    try {
        if (event.is_registered) {
            // Deregister
            const response = await fetch(`/api/events/${selectedEventId}/deregister`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to deregister from event');
            }
            
            showNotification('Successfully deregistered from event', 'success');
        } else {
            // Register
            const response = await fetch(`/api/events/${selectedEventId}/register`, {
                method: 'POST',
                credentials: 'include'
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to register for event');
            }
            
            showNotification('Successfully registered for event', 'success');
        }
        
        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('eventModal'));
        modal.hide();
        
        // Reload events to update UI
        await loadEvents();
    } catch (error) {
        console.error('Error handling event registration:', error);
        showNotification(error.message || 'Failed to process your request', 'error');
    }
}

// Show event details
async function showEventDetails(eventId) {
    try {
        const event = allEvents.find(e => e.id === eventId);
        if (!event) {
            throw new Error('Event not found');
        }
        
        selectedEventId = eventId;
        const isPast = new Date(event.event_date) < new Date();
        const isFull = event.max_participants && event.registered_count >= event.max_participants;
        const isRegistrationClosed = isPast || isFull || (event.registration_deadline && new Date(event.registration_deadline) < new Date());
        
        const content = document.getElementById('eventContent');
        content.innerHTML = `
            <div class="mb-4">
                <h4>${event.title}</h4>
                <div class="d-flex gap-3 mb-3">
                    <span class="badge bg-${getCapacityBadgeColor(event)}">
                        ${event.registered_count || 0}/${event.max_participants || '∞'} Registered
                    </span>
                    <span class="badge bg-secondary">
                        ${event.hostel_name === 'all' ? 'All Hostels' : event.hostel_name}
                    </span>
                </div>
                <p class="event-date mb-2">
                    <i class="bi bi-calendar"></i> ${new Date(event.event_date).toLocaleDateString()}
                </p>
                <p class="event-location mb-3">
                    <i class="bi bi-geo-alt"></i> ${event.location}
                </p>
                <div class="event-description mb-4">
                    ${event.description}
                </div>
                ${event.registration_deadline ? `
                    <p class="text-muted">
                        <i class="bi bi-clock"></i> Registration closes: 
                        ${new Date(event.registration_deadline).toLocaleDateString()}
                    </p>
                ` : ''}
            </div>
        `;
        
        // Update register button
        const registerButton = document.getElementById('registerButton');
        if (event.is_registered) {
            if (isPast) {
                registerButton.textContent = 'Event Ended';
                registerButton.disabled = true;
                registerButton.classList.remove('btn-danger');
                registerButton.classList.add('btn-secondary');
            } else {
                registerButton.textContent = 'Deregister';
                registerButton.disabled = false;
                registerButton.classList.remove('btn-primary');
                registerButton.classList.add('btn-danger');
            }
        } else if (isRegistrationClosed) {
            registerButton.textContent = isPast ? 'Event Ended' : isFull ? 'Event Full' : 'Registration Closed';
            registerButton.disabled = true;
            registerButton.classList.remove('btn-danger', 'btn-primary');
            registerButton.classList.add('btn-secondary');
        } else {
            registerButton.textContent = 'Register';
            registerButton.disabled = false;
            registerButton.classList.remove('btn-danger', 'btn-secondary');
            registerButton.classList.add('btn-primary');
        }
        
        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('eventModal'));
        modal.show();
    } catch (error) {
        console.error('Error showing event details:', error);
        showNotification('Error loading event details', 'error');
    }
}

// Filter events
function filterEvents() {
    const hostelFilter = document.getElementById('hostelFilter').value;
    const statusFilter = document.getElementById('statusFilter').value;
    const searchQuery = document.getElementById('searchInput').value.toLowerCase();
    
    const filtered = allEvents.filter(event => {
        const matchesHostel = !hostelFilter || event.hostel_name === hostelFilter || event.hostel_name === 'all';
        const matchesSearch = !searchQuery || 
            event.title.toLowerCase().includes(searchQuery) || 
            event.description.toLowerCase().includes(searchQuery);
        
        let matchesStatus = true;
        if (statusFilter) {
            const now = new Date();
            const eventDate = new Date(event.event_date);
            
            switch (statusFilter) {
                case 'upcoming':
                    matchesStatus = eventDate > now;
                    break;
                case 'registered':
                    matchesStatus = event.is_registered;
                    break;
                case 'past':
                    matchesStatus = eventDate < now;
                    break;
            }
        }
        
        return matchesHostel && matchesSearch && matchesStatus;
    });
    
    displayEvents(filtered);
}

// Search events
function searchEvents() {
    filterEvents();
}

// Get badge color based on capacity
function getCapacityBadgeColor(event) {
    if (!event.capacity) return 'secondary';
    const ratio = event.registered_count / event.capacity;
    if (ratio >= 1) return 'danger';
    if (ratio >= 0.8) return 'warning';
    return 'success';
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
        
        const badge = document.getElementById('notificationCount');
        const list = document.getElementById('notificationsList');
        
        badge.textContent = notifications.length;
        badge.style.display = notifications.length > 0 ? 'block' : 'none';
        
        if (notifications.length === 0) {
            list.innerHTML = '<li><a class="dropdown-item" href="#">No new notifications</a></li>';
            return;
        }
        
        list.innerHTML = notifications.map(notification => `
            <li>
                <a class="dropdown-item" href="${notification.link || '#'}">
                    <small class="text-muted d-block">
                        ${new Date(notification.created_at).toLocaleDateString()}
                    </small>
                    ${notification.message}
                </a>
            </li>
        `).join('<li><hr class="dropdown-divider"></li>');
    } catch (error) {
        console.error('Error loading notifications:', error);
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
    
    await Promise.all([
        loadEvents(),
        loadNotifications()
    ]);
    
    // Add event listener for search input
    document.getElementById('searchInput').addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            searchEvents();
        }
    });
}

// Start the application
document.addEventListener('DOMContentLoaded', initPage); 