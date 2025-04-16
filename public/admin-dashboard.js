document.addEventListener('DOMContentLoaded', function() {
    // Check admin session
    checkAdminSession();

    // Initialize navigation
    initializeNavigation();

    // Load initial data
    loadBookings();
    loadRooms();
    loadUsers();
    loadPayments();

    // Initialize form submissions
    initializeFormSubmissions();

    // Initialize residents portal
    initializeResidentsPortal();

    // Add event listeners to all filter dropdowns
    document.getElementById('hostelFilter')?.addEventListener('change', () => filterRooms(document.getElementById('roomSearch')?.value || ''));
    document.getElementById('roomTypeFilter')?.addEventListener('change', () => filterRooms(document.getElementById('roomSearch')?.value || ''));
    document.getElementById('statusFilter')?.addEventListener('change', () => filterRooms(document.getElementById('roomSearch')?.value || ''));
    document.getElementById('bookingStatusFilter')?.addEventListener('change', loadBookings);

    // Add search input event listeners
    document.getElementById('bookingSearch')?.addEventListener('input', function(e) {
        loadBookings();
    });

    document.getElementById('roomSearch')?.addEventListener('input', function(e) {
        filterRooms(e.target.value);
    });

    document.getElementById('userSearch').addEventListener('input', function(e) {
        filterUsers();
    });

    document.getElementById('paymentSearch').addEventListener('input', function(e) {
        filterPayments(e.target.value);
    });

    // Add event listeners for filter dropdowns
    const filterElements = ['hostelFilter', 'roomTypeFilter', 'statusFilter'];
    filterElements.forEach(filterId => {
        const element = document.getElementById(filterId);
        if (element) {
            element.addEventListener('change', () => {
                const searchInput = document.getElementById('roomSearchInput');
                filterRooms(searchInput ? searchInput.value : '');
            });
        }
    });

    // Add event listener to status field to show/hide gender occupancy
    const statusSelect = document.querySelector('#editRoomForm [name="status"]');
    const genderField = document.getElementById('genderOccupancyField');

    if (statusSelect && genderField) {
        statusSelect.addEventListener('change', function() {
            if (this.value === 'available') {
                genderField.style.display = 'none';
            } else {
                genderField.style.display = 'block';
            }
        });
    }

    // Load chat settings when community tab is shown
    document.querySelector('[data-tab="community"]').addEventListener('click', loadChatSettings);
    
    // Update retention period
    document.getElementById('updateRetention').addEventListener('click', updateRetentionPeriod);
    
    // Update backup settings
    document.getElementById('backupEnabled').addEventListener('change', updateBackupSettings);
    
    // Create backup now
    document.getElementById('createBackup').addEventListener('click', createBackupNow);

    // Add hostel filter buttons event listeners
    document.querySelectorAll('[data-hostel]').forEach(button => {
        button.addEventListener('click', function() {
            // Update active state
            document.querySelectorAll('[data-hostel]').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Update filter and refresh display
            currentHostelFilter = this.dataset.hostel;
            filterUsers();
        });
    });

    // Add search field dropdown event listeners
    document.querySelectorAll('[data-search-field]').forEach(item => {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            // Update active state
            document.querySelectorAll('[data-search-field]').forEach(i => 
                i.classList.remove('active'));
            this.classList.add('active');
            
            // Update search field and refresh display
            currentSearchField = this.dataset.searchField;
            filterUsers();
        });
    });

    // Add verification filter event listener
    document.getElementById('verificationFilter').addEventListener('change', function() {
        currentVerificationFilter = this.value;
        filterUsers();
    });

    // Add event listeners for status filter buttons
    document.querySelectorAll('.btn-group button[data-status]').forEach(button => {
        button.addEventListener('click', function() {
            const status = this.dataset.status;
            loadBookings(status);
            
            // Update active button state
            document.querySelectorAll('.btn-group button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');

            // Reset the status dropdown when using buttons
            document.getElementById('bookingStatusFilter').value = '';
        });
    });

    // Add event listeners for search and filters
    document.getElementById('bookingHostelFilter')?.addEventListener('change', function() {
        loadBookings();
    });
});

// Session Management
function checkAdminSession() {
    fetch('/api/check-admin-session', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            window.location.href = '/login.html';
        }
    })
    .catch(() => {
        window.location.href = '/login.html';
    });
}

// Navigation
function initializeNavigation() {
    const navLinks = document.querySelectorAll('.nav-link[data-section]');
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetSection = this.dataset.section;
            showSection(targetSection);
        });
    });

    document.getElementById('logoutBtn').addEventListener('click', function(e) {
        e.preventDefault();
        logout();
    });
}

function showSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
        section.classList.add('d-none');
    });
    
    // Show selected section
    const selectedSection = document.getElementById(sectionId + 'Section');
    if (selectedSection) {
        selectedSection.classList.remove('d-none');
    }
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    // Load section data
    switch (sectionId) {
        case 'bookings':
            loadBookings();
            break;
        case 'rooms':
            loadRooms();
            break;
        case 'users':
            loadUsers();
            break;
        case 'payments':
            loadPayments();
            break;
    }
}

// Bookings Management
async function loadBookings(status = 'all') {
    try {
        const response = await fetch('/api/admin/bookings', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch bookings');
        }

        const bookings = await response.json();
        displayBookings(bookings, status);
    } catch (error) {
        console.error('Error loading bookings:', error);
        showNotification('Failed to load bookings', 'error');
    }
}

function createBookingRow(booking) {
    const row = document.createElement('tr');
    
    // Add status class to the row based on booking status
    const statusClasses = {
        'pending': 'table-warning',
        'approved': 'table-success',
        'rejected': 'table-danger',
        'cancelled': 'table-secondary' // Added for consistency
    };
    const statusClass = statusClasses[booking.status.toLowerCase()] || '';
    
    if (statusClass) {
        row.classList.add(statusClass);
    }
    
    row.innerHTML = `
        <td>${booking.id}</td>
        <td>${booking.username}</td>
        <td>${booking.room_number}</td>
        <td>${booking.hostel_name}</td>
        <td>${booking.room_type}</td>
        <td>
            <span class="badge ${statusClass}">${booking.status}</span>
        </td>
        <td>
            <button class="btn btn-primary btn-sm" onclick="viewBookingDetails(${booking.id})">
                <i class="fas fa-eye"></i> View
            </button>
            ${booking.status.toLowerCase() === 'pending' ? `
                <button class="btn btn-success btn-sm" onclick="updateBookingStatus(${booking.id}, 'approved')">
                    <i class="fas fa-check"></i> Approve
                </button>
                <button class="btn btn-danger btn-sm" onclick="updateBookingStatus(${booking.id}, 'rejected')">
                    <i class="fas fa-times"></i> Reject
                </button>
                <button class="btn btn-secondary btn-sm" onclick="updateBookingStatus(${booking.id}, 'cancelled')">
                    <i class="fas fa-ban"></i> Cancel
                </button>
            ` : booking.status.toLowerCase() === 'approved' ? `
                <button class="btn btn-warning btn-sm" onclick="updateBookingStatus(${booking.id}, 'pending')">
                    <i class="fas fa-clock"></i> Set Pending
                </button>
                <button class="btn btn-danger btn-sm" onclick="updateBookingStatus(${booking.id}, 'rejected')">
                    <i class="fas fa-times"></i> Reject
                </button>
                 <button class="btn btn-secondary btn-sm" onclick="updateBookingStatus(${booking.id}, 'cancelled')">
                    <i class="fas fa-ban"></i> Cancel
                </button>
            ` : ''}
        </td>
    `;

    return row;
}

// Add a function to check server connection
async function checkServerConnection() {
    try {
        const response = await fetch('/api/check-admin-session', {
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error('Server is not responding properly');
        }
        return true;
    } catch (error) {
        console.error('Server connection check failed:', error);
        showNotification('Cannot connect to server. Please make sure the server is running on port 3000', 'error');
        return false;
    }
}

// Add notification function
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} position-fixed top-0 end-0 m-3`;
    notification.style.zIndex = '1000';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Rooms Management
function loadRooms() {
    const roomsTableBody = document.getElementById('roomsTableBody');
    if (!roomsTableBody) {
        console.error('Rooms table body element not found');
        return;
    }

    // Show loading state
    roomsTableBody.innerHTML = '<tr><td colspan="6" class="text-center">Loading rooms...</td></tr>';

    fetch('/api/admin/rooms', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch rooms');
        }
        return response.json();
    })
    .then(rooms => {
        if (!Array.isArray(rooms)) {
            throw new Error('Invalid response format from server');
        }
        roomsData = rooms;
        displayRooms(rooms);
    })
    .catch(error => {
        console.error('Error loading rooms:', error);
        roomsTableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading rooms. Please try again.</td></tr>';
        showNotification(error.message, 'error');
    });
}

function displayRooms(rooms) {
    const roomsTableBody = document.getElementById('roomsTableBody');
    roomsTableBody.innerHTML = '';

    rooms.forEach(room => {
        const statusClass = {
            'available': 'text-success',
            'partially_occupied': 'text-warning',
            'fully_occupied': 'text-danger'
        }[room.status] || '';

        const statusText = {
            'available': 'Available',
            'partially_occupied': 'Partially Occupied',
            'fully_occupied': 'Fully Occupied'
        }[room.status] || room.status;

        const genderText = room.gender_occupancy ? 
            ` (${room.gender_occupancy.charAt(0).toUpperCase() + room.gender_occupancy.slice(1)} Only)` : '';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${room.room_number}</td>
            <td>${room.hostel_name}</td>
            <td>${room.room_type}</td>
            <td>${room.price}</td>
            <td class="${statusClass}">${statusText}${genderText}</td>
            <td>
                <button class="btn btn-primary btn-sm" onclick="editRoom(${room.id})">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteRoom(${room.id})">Delete</button>
            </td>
        `;
        roomsTableBody.appendChild(row);
    });
}

function deleteRoom(roomId) {
    if (confirm('Are you sure you want to delete this room?')) {
        fetch(`/api/rooms/${roomId}`, {
            method: 'DELETE',
            credentials: 'include'
        })
        .then(response => {
            if (response.ok) {
                loadRooms();
                alert('Room deleted successfully');
            } else {
                throw new Error('Failed to delete room');
            }
        })
        .catch(error => {
            alert(error.message);
        });
    }
}

// Edit room functionality
function editRoom(roomId) {
    const room = roomsData.find(r => r.id === roomId);
    if (!room) {
        showNotification('Room not found', 'error');
        return;
    }

    const form = document.getElementById('editRoomForm');
    form.querySelector('[name="room_number"]').value = room.room_number;
    form.querySelector('[name="hostel_name"]').value = room.hostel_name;
    form.querySelector('[name="room_type"]').value = room.room_type;
    form.querySelector('[name="price"]').value = room.price;
    form.querySelector('[name="status"]').value = room.status.toLowerCase();
    
    // Handle gender occupancy
    const genderField = document.getElementById('genderOccupancyField');
    const genderSelect = form.querySelector('[name="gender_occupancy"]');
    
    if (genderSelect) {
        genderSelect.value = room.gender_occupancy || '';
    }
    
    if (genderField) {
        genderField.style.display = room.status.toLowerCase() === 'available' ? 'none' : 'block';
    }

    // Add event listener for status changes
    const statusSelect = form.querySelector('[name="status"]');
    if (statusSelect) {
        // Remove any existing listeners
        const newStatusSelect = statusSelect.cloneNode(true);
        statusSelect.parentNode.replaceChild(newStatusSelect, statusSelect);
        
        newStatusSelect.addEventListener('change', function() {
            if (genderField) {
                genderField.style.display = this.value === 'available' ? 'none' : 'block';
                if (this.value === 'available') {
                    genderSelect.value = ''; // Clear gender when room becomes available
                }
            }
        });
    }

    currentEditRoomId = roomId;
    const editRoomModal = new bootstrap.Modal(document.getElementById('editRoomModal'));
    editRoomModal.show();
}

function saveRoomChanges() {
    const form = document.getElementById('editRoomForm');
    const status = form.querySelector('[name="status"]').value;
    const gender = form.querySelector('[name="gender_occupancy"]').value;

    // Validate gender occupancy for non-available rooms
    if (status !== 'available' && !gender) {
        showNotification('Please select a gender occupancy for partially or fully occupied rooms', 'error');
        return;
    }

    const formData = {
        room_number: form.querySelector('[name="room_number"]').value,
        hostel_name: form.querySelector('[name="hostel_name"]').value,
        room_type: form.querySelector('[name="room_type"]').value,
        price: parseFloat(form.querySelector('[name="price"]').value),
        status: status,
        gender_occupancy: status === 'available' ? null : gender
    };

    fetch(`/api/rooms/${currentEditRoomId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData),
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.error || 'Failed to update room');
            });
        }
        return response.json();
    })
    .then(data => {
        showNotification('Room updated successfully', 'success');
        const editRoomModal = bootstrap.Modal.getInstance(document.getElementById('editRoomModal'));
        editRoomModal.hide();
        loadRooms(); // Refresh the rooms list
    })
    .catch(error => {
        console.error('Error in edit room:', error);
        showNotification(error.message, 'error');
    });
}

// Users Management
function loadUsers() {
    fetch('/api/admin/users', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        return response.json();
    })
    .then(users => {
        usersData = users;
        displayUsers(users);
    })
    .catch(error => {
        console.error('Error loading users:', error);
        showNotification(error.message, 'error');
    });
}

function displayUsers(users) {
    const tbody = document.querySelector('#usersTable tbody');
    tbody.innerHTML = '';

    users.forEach(user => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.full_name}</td>
            <td>${user.email}</td>
            <td>${user.role}</td>
            <td>${user.preferred_hostel || 'N/A'}</td>
            <td><span class="status-${user.status.toLowerCase()}">${user.status}</span></td>
            <td>
                <span class="badge ${user.is_verified ? 'bg-success' : 'bg-warning'}">
                    <i class="bi ${user.is_verified ? 'bi-check-circle' : 'bi-exclamation-circle'}"></i>
                    ${user.is_verified ? 'Verified' : 'Not Verified'}
                </span>
            </td>
            <td>
                <button class="btn btn-warning btn-sm btn-action" onclick="editUser(${user.id})">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-danger btn-sm btn-action" onclick="deleteUser(${user.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function deleteUser(userId) {
    if (confirm('Are you sure you want to delete this user?')) {
        fetch(`/api/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || 'Failed to delete user');
                });
            }
            return response.json();
        })
        .then(data => {
            loadUsers();
            showNotification('User deleted successfully', 'success');
        })
        .catch(error => {
            console.error('Error deleting user:', error);
            showNotification(error.message, 'error');
        });
    }
}

// Edit user functionality
function editUser(userId) {
    fetch(`/api/admin/users/${userId}`, {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch user details');
        }
        return response.json();
    })
    .then(user => {
        // Create edit modal dynamically
        const modalHtml = `
            <div class="modal fade" id="editUserModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit User</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="editUserForm">
                                <input type="hidden" name="userId" value="${user.id}">
                                <div class="mb-3">
                                    <label class="form-label">Full Name</label>
                                    <input type="text" class="form-control" name="full_name" value="${user.full_name}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Email</label>
                                    <input type="email" class="form-control" name="email" value="${user.email}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">New Password</label>
                                    <input type="password" class="form-control" name="password" placeholder="Leave blank to keep current password">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Role</label>
                                    <select class="form-select" name="role" required>
                                        <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
                                        <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Status</label>
                                    <select class="form-select" name="status" required>
                                        <option value="ACTIVE" ${user.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                                        <option value="INACTIVE" ${user.status === 'INACTIVE' ? 'selected' : ''}>Inactive</option>
                                        <option value="SUSPENDED" ${user.status === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>
                                    </select>
                                </div>
                            </form>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" form="editUserForm" class="btn btn-primary">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if any
        const existingModal = document.getElementById('editUserModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
        modal.show();

        // Handle form submission
        document.getElementById('editUserForm').addEventListener('submit', function(e) {
            e.preventDefault();
            const formData = new FormData(this);
            const userData = Object.fromEntries(formData.entries());
            const userId = userData.userId;
            delete userData.userId;

            // Remove password if empty
            if (!userData.password) {
                delete userData.password;
            }

            fetch(`/api/users/${userId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(userData)
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to update user');
                }
                return response.json();
            })
            .then(() => {
                loadUsers();
                modal.hide();
                alert('User updated successfully');
            })
            .catch(error => {
                console.error('Error updating user:', error);
                alert(error.message);
            });
        });
    })
    .catch(error => {
        console.error('Error loading user details:', error);
        alert('Error loading user details: ' + error.message);
    });
}

// Form Submissions
function initializeFormSubmissions() {
    // Add Room Form
    document.getElementById('addRoomForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const roomData = Object.fromEntries(formData.entries());

        fetch('/api/rooms', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(roomData)
        })
        .then(response => {
            if (!response.ok) {
                return response.json().then(err => {
                    throw new Error(err.error || 'Failed to add room');
                });
            }
            return response.json();
        })
        .then(data => {
            loadRooms();
            this.reset();
            bootstrap.Modal.getInstance(document.getElementById('addRoomModal')).hide();
            alert('Room added successfully');
        })
        .catch(error => {
            alert(error.message);
        });
    });

    // Add User Form
    document.getElementById('addUserForm').addEventListener('submit', function(e) {
        e.preventDefault();
        const formData = new FormData(this);
        const userData = Object.fromEntries(formData.entries());

        fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(userData)
        })
        .then(response => {
            if (response.ok) {
                loadUsers();
                this.reset();
                bootstrap.Modal.getInstance(document.getElementById('addUserModal')).hide();
                alert('User added successfully');
            } else {
                throw new Error('Failed to add user');
            }
        })
        .catch(error => {
            alert(error.message);
        });
    });

    // Status Filter Buttons
    document.querySelectorAll('.btn-group button[data-status]').forEach(button => {
        button.addEventListener('click', function() {
            const status = this.dataset.status;
            loadBookings(status);
            
            // Update active button state
            document.querySelectorAll('.btn-group button').forEach(btn => {
                btn.classList.remove('active');
            });
            this.classList.add('active');
        });
    });
}

// Logout
function logout() {
    fetch('/api/logout', {
        method: 'POST',
        credentials: 'include'
    })
    .then(() => {
        window.location.href = '/login.html';
    })
    .catch(() => {
        window.location.href = '/login.html';
    });
}

function viewBookingDetails(bookingId) {
    window.location.href = `/booking-details.html?id=${bookingId}`;
}

// Add the displayBookings function
function displayBookings(bookings, status = 'all') {
    const tbody = document.querySelector('#bookingsTable tbody');
    tbody.innerHTML = '';

    // Get filter values
    const statusFilter = document.getElementById('bookingStatusFilter').value;
    const hostelFilter = document.getElementById('bookingHostelFilter')?.value || '';
    const searchTerm = document.getElementById('bookingSearch').value.toLowerCase();

    // Filter bookings based on selected criteria
    const filteredBookings = bookings.filter(booking => {
        // Handle status filter from both dropdown and button
        const matchesStatus = status === 'all' || 
            (statusFilter === '' && booking.status.toLowerCase() === status) ||
            (statusFilter !== '' && booking.status.toLowerCase() === statusFilter.toLowerCase());
        
        const matchesHostel = !hostelFilter || booking.hostel_name === hostelFilter;
        
        const searchString = `${booking.full_name} ${booking.username} ${booking.room_number} ${booking.hostel_name}`.toLowerCase();
        const matchesSearch = !searchTerm || searchString.includes(searchTerm);
        
        return matchesStatus && matchesHostel && matchesSearch;
    });

    filteredBookings.forEach(booking => {
        const tr = createBookingRow(booking);
        tbody.appendChild(tr);
    });

    // Update the count in the status buttons
    updateStatusCounts(bookings);
}

// Add function to update status counts
function updateStatusCounts(bookings) {
    const counts = {
        all: bookings.length,
        pending: bookings.filter(b => b.status.toLowerCase() === 'pending').length,
        approved: bookings.filter(b => b.status.toLowerCase() === 'approved').length,
        cancelled: bookings.filter(b => b.status.toLowerCase() === 'cancelled').length
    };

    // Update the count in each status button
    Object.entries(counts).forEach(([status, count]) => {
        const button = document.querySelector(`button[data-status="${status}"]`);
        if (button) {
            const badge = button.querySelector('.badge') || document.createElement('span');
            badge.className = 'badge bg-secondary ms-1';
            badge.textContent = count;
            if (!button.querySelector('.badge')) {
                button.appendChild(badge);
            }
        }
    });
}

// Payments Management
function viewReceipt(bookingId) {
    // Open the booking details page in a new tab
    window.open(`/booking-details.html?id=${bookingId}&admin=true`, '_blank');
}

let currentPaymentFilter = 'all';
let currentPaymentHostelFilter = 'all';

function loadPayments() {
    fetch('/api/admin/payments', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(payments => {
        displayPayments(payments);
        
        // Add click handlers for payment status filter buttons
        document.querySelectorAll('[data-payment-status]').forEach(button => {
            if (!button.hasPaymentHandler) {
                button.hasPaymentHandler = true;
                button.addEventListener('click', function() {
                    document.querySelectorAll('[data-payment-status]').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    this.classList.add('active');
                    currentPaymentFilter = this.dataset.paymentStatus;
                    displayPayments(payments);
                });
            }
        });

        // Add click handlers for hostel filter buttons
        document.querySelectorAll('[data-payment-hostel]').forEach(button => {
            if (!button.hasHostelHandler) {
                button.hasHostelHandler = true;
                button.addEventListener('click', function() {
                    document.querySelectorAll('[data-payment-hostel]').forEach(btn => {
                        btn.classList.remove('active');
                    });
                    this.classList.add('active');
                    currentPaymentHostelFilter = this.dataset.paymentHostel;
                    displayPayments(payments);
                });
            }
        });
    })
    .catch(error => {
        console.error('Error loading payments:', error);
        showNotification('Failed to load payments', 'error');
    });
}

function displayPayments(payments) {
    const tbody = document.querySelector('#paymentsTable tbody');
    tbody.innerHTML = '';
    
    // Apply status filter
    const statusFilteredPayments = payments.filter(payment => {
        if (currentPaymentFilter === 'all') return true;
        return payment.payment_status === currentPaymentFilter;
    });
    
    // Apply hostel filter
    const hostelFilteredPayments = statusFilteredPayments.filter(payment => {
        if (currentPaymentHostelFilter === 'all') return true;
        return payment.hostel_name === currentPaymentHostelFilter;
    });
    
    // Apply search filter
    const searchTerm = document.getElementById('paymentSearch')?.value?.toLowerCase() || '';
    const filteredPayments = hostelFilteredPayments.filter(payment => {
        const searchString = `${payment.id || ''} ${payment.booking_id || ''} ${payment.user_full_name || ''} ${payment.room_number || ''} ${payment.hostel_name || ''}`.toLowerCase();
        return !searchTerm || searchString.includes(searchTerm);
    });
    
    filteredPayments.forEach(payment => {
        const tr = document.createElement('tr');
        const statusClass = {
            'pending': 'text-warning',
            'paid': 'text-success',
            'rejected': 'text-danger'
        }[payment.payment_status] || '';

        tr.innerHTML = `
            <td>${payment.id || 'N/A'}</td>
            <td>${payment.booking_id || 'N/A'}</td>
            <td>${payment.user_full_name || 'N/A'}</td>
            <td>${payment.room_number || 'N/A'}</td>
            <td>${payment.hostel_name || 'N/A'}</td>
            <td>GHS ${payment.amount || '0.00'}</td>
            <td class="${statusClass}">${(payment.payment_status || 'pending').toUpperCase()}</td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-primary btn-sm" onclick="viewReceipt(${payment.booking_id})">
                        <i class="fas fa-eye"></i> View
                    </button>
                    <button class="btn btn-success btn-sm" onclick="updatePaymentStatus(${payment.booking_id}, 'paid')" 
                        ${payment.payment_status === 'paid' ? 'disabled' : ''}>
                        <i class="fas fa-check"></i> Approve
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="updatePaymentStatus(${payment.booking_id}, 'rejected')"
                        ${payment.payment_status === 'rejected' ? 'disabled' : ''}>
                        <i class="fas fa-times"></i> Reject
                    </button>
                </div>
            </td>
        `;

        tbody.appendChild(tr);
    });
}

async function updatePaymentStatus(bookingId, status) {
    try {
        const response = await fetch(`/api/admin/payments/${bookingId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status }),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to update payment status');
        }

        // Show local notification
        showLocalNotification(
            'Payment Status Updated',
            `Payment for booking #${bookingId} has been ${status}`,
            { url: `/admin-dashboard.html#payments` }
        );

        loadPayments();
    } catch (error) {
        console.error('Error updating payment status:', error);
        showNotification(error.message, 'error');
    }
}

// Residents Portal Management
function initializeResidentsPortal() {
    // Load initial data
    loadMaintenanceRequests();
    loadAnnouncements();
    loadCommunityEvents();
    
    // Set up tab switching
    const tabButtons = document.querySelectorAll('[data-tab]');
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
    
    // Set up form submissions
    document.getElementById('submitMaintenanceRequest').addEventListener('click', submitMaintenanceRequest);
    document.getElementById('submitAnnouncement').addEventListener('click', submitAnnouncement);
    document.getElementById('submitEvent').addEventListener('click', submitEvent);
    
    // Set up search functionality
    document.getElementById('maintenanceSearch').addEventListener('input', function(e) {
        filterMaintenanceRequests(e.target.value);
    });
    
    document.getElementById('announcementSearch').addEventListener('input', function(e) {
        filterAnnouncements(e.target.value);
    });
    
    document.getElementById('eventSearch').addEventListener('input', function(e) {
        filterEvents(e.target.value);
    });
    
    // Load students for maintenance request form
    loadStudentsForMaintenance();
}

function switchTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected tab
    document.getElementById(`${tabName}Tab`).classList.add('active');
    
    // Update button styles
    document.querySelectorAll('[data-tab]').forEach(button => {
        if (button.getAttribute('data-tab') === tabName) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });
}

// Maintenance Requests
function loadMaintenanceRequests() {
    fetch('/api/admin/maintenance', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load maintenance requests');
        }
        return response.json();
    })
    .then(data => {
        const tableBody = document.getElementById('maintenanceTableBody');
        tableBody.innerHTML = '';
        
        if (data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="9" class="text-center">No maintenance requests found</td>';
            tableBody.appendChild(row);
            return;
        }
        
        data.forEach(request => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${request.id}</td>
                <td>${request.student_name}</td>
                <td>${request.room_number}</td>
                <td>${request.title}</td>
                <td>${request.category}</td>
                <td><span class="badge bg-${getPriorityBadgeClass(request.priority)}">${request.priority}</span></td>
                <td><span class="badge bg-${getStatusBadgeClass(request.status)}">${request.status}</span></td>
                <td>${formatDate(request.created_at)}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewMaintenanceRequest(${request.id})">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-primary" onclick="updateMaintenanceStatus(${request.id}, 'in_progress')">
                        <i class="bi bi-play"></i>
                    </button>
                    <button class="btn btn-sm btn-success" onclick="updateMaintenanceStatus(${request.id}, 'completed')">
                        <i class="bi bi-check-lg"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error loading maintenance requests:', error);
        const tableBody = document.getElementById('maintenanceTableBody');
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading maintenance requests</td></tr>';
    });
}

function loadStudentsForMaintenance() {
    fetch('/api/admin/residents', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load residents');
        }
        return response.json();
    })
    .then(data => {
        const select = document.getElementById('maintenanceStudent');
        select.innerHTML = '<option value="">Select a student</option>';
        
        data.forEach(student => {
            const option = document.createElement('option');
            option.value = student.id;
            option.textContent = `${student.full_name} (${student.room_number})`;
            select.appendChild(option);
        });
    })
    .catch(error => {
        console.error('Error loading students:', error);
    });
}

function submitMaintenanceRequest() {
    const studentId = document.getElementById('maintenanceStudent').value;
    const title = document.getElementById('maintenanceTitle').value;
    const category = document.getElementById('maintenanceCategory').value;
    const priority = document.getElementById('maintenancePriority').value;
    const description = document.getElementById('maintenanceDescription').value;
    
    if (!studentId || !title || !category || !priority || !description) {
        alert('Please fill in all required fields');
        return;
    }
    
    fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
            user_id: studentId,
            title,
            category,
            priority,
            description
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to submit maintenance request');
        }
        return response.json();
    })
    .then(data => {
        alert('Maintenance request submitted successfully');
        document.getElementById('addMaintenanceRequestForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('addMaintenanceRequestModal')).hide();
        loadMaintenanceRequests();
    })
    .catch(error => {
        console.error('Error submitting maintenance request:', error);
        alert('Failed to submit maintenance request. Please try again.');
    });
}

function updateMaintenanceStatus(requestId, status) {
    // Normalize status to lowercase
    const normalizedStatus = status.toLowerCase();
    
    fetch(`/api/admin/maintenance/${requestId}/status`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ 
            status: normalizedStatus,
            comment: `Status updated to ${normalizedStatus}`
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(data => {
        console.log('Maintenance status updated:', data);
        alert(`Maintenance request status updated to ${normalizedStatus}`);
        loadMaintenanceRequests();
    })
    .catch(error => {
        console.error('Error updating maintenance status:', error);
        alert(error.error || 'Failed to update maintenance status. Please try again.');
    });
}

function viewMaintenanceRequest(requestId) {
    fetch(`/api/admin/maintenance/${requestId}`, {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => Promise.reject(err));
        }
        return response.json();
    })
    .then(data => {
        console.log('Maintenance request details:', data);
        
        // Create and show a modal with the request details
        const modalHtml = `
            <div class="modal fade" id="viewMaintenanceModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Maintenance Request Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <h6>Request ID: ${data.id}</h6>
                                <p><strong>Student:</strong> ${data.student_name}</p>
                                <p><strong>Room:</strong> ${data.room_number}</p>
                                <p><strong>Title:</strong> ${data.title}</p>
                                <p><strong>Category:</strong> ${data.category}</p>
                                <p><strong>Priority:</strong> <span class="badge bg-${getPriorityBadgeClass(data.priority)}">${data.priority}</span></p>
                                <p><strong>Status:</strong> <span class="badge bg-${getStatusBadgeClass(data.status)}">${data.status}</span></p>
                                <p><strong>Created:</strong> ${formatDate(data.created_at)}</p>
                                <p><strong>Description:</strong></p>
                                <p>${data.description}</p>
                            </div>
                            <div class="mb-3">
                                <h6>Status Updates</h6>
                                <div class="list-group">
                                    ${data.updates && data.updates.length > 0 ? 
                                        data.updates.map(update => `
                                            <div class="list-group-item">
                                                <div class="d-flex justify-content-between">
                                                    <span class="badge bg-${getStatusBadgeClass(update.status)}">${update.status}</span>
                                                    <small>${formatDate(update.created_at)}</small>
                                                </div>
                                                <p class="mb-1">${update.comment || ''}</p>
                                            </div>
                                        `).join('') : 
                                        '<div class="list-group-item">No status updates yet</div>'
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <div class="btn-group" role="group">
                                <button type="button" class="btn btn-primary" onclick="updateMaintenanceStatus(${data.id}, 'in_progress')">
                                    Mark In Progress
                                </button>
                                <button type="button" class="btn btn-success" onclick="updateMaintenanceStatus(${data.id}, 'completed')">
                                    Mark Completed
                                </button>
                            </div>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existingModal = document.getElementById('viewMaintenanceModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add the new modal to the document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Initialize and show the modal using Bootstrap
        const modalElement = document.getElementById('viewMaintenanceModal');
        const modal = new bootstrap.Modal(modalElement);
        modal.show();
        
        // Add event listener for modal close
        modalElement.addEventListener('hidden.bs.modal', function () {
            this.remove();
        });
    })
    .catch(error => {
        console.error('Error loading maintenance request details:', error);
        alert(error.error || 'Failed to load maintenance request details. Please try again.');
    });
}

function filterMaintenanceRequests(searchTerm) {
    const rows = document.querySelectorAll('#maintenanceTableBody tr');
    searchTerm = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Announcements
function loadAnnouncements() {
    fetch('/api/admin/announcements', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load announcements');
        }
        return response.json();
    })
    .then(data => {
        const tableBody = document.getElementById('announcementsTableBody');
        tableBody.innerHTML = '';
        
        if (data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="8" class="text-center">No announcements found</td>';
            tableBody.appendChild(row);
            return;
        }
        
        data.forEach(announcement => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${announcement.id}</td>
                <td>${announcement.title}</td>
                <td>${truncateText(announcement.content, 50)}</td>
                <td>${announcement.hostel_name}</td>
                <td><span class="badge bg-${getPriorityBadgeClass(announcement.priority)}">${announcement.priority}</span></td>
                <td>${formatDate(announcement.start_date)}</td>
                <td>${announcement.end_date ? formatDate(announcement.end_date) : 'N/A'}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewAnnouncement(${announcement.id})">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${announcement.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error loading announcements:', error);
        const tableBody = document.getElementById('announcementsTableBody');
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error loading announcements</td></tr>';
    });
}

function submitAnnouncement() {
    const title = document.getElementById('announcementTitle').value;
    const content = document.getElementById('announcementContent').value;
    const hostel = document.getElementById('announcementHostel').value;
    const priority = document.getElementById('announcementPriority').value;
    const startDate = document.getElementById('announcementStartDate').value;
    const endDate = document.getElementById('announcementEndDate').value;
    
    if (!title || !content || !hostel || !priority || !startDate) {
        alert('Please fill in all required fields');
        return;
    }
    
    fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
            title,
            content,
            hostel_name: hostel,
            priority,
            start_date: startDate,
            end_date: endDate || null
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to submit announcement');
        }
        return response.json();
    })
    .then(data => {
        alert('Announcement submitted successfully');
        document.getElementById('addAnnouncementForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('addAnnouncementModal')).hide();
        loadAnnouncements();
    })
    .catch(error => {
        console.error('Error submitting announcement:', error);
        alert('Failed to submit announcement. Please try again.');
    });
}

function viewAnnouncement(announcementId) {
    fetch(`/api/admin/announcements/${announcementId}`, {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load announcement details');
        }
        return response.json();
    })
    .then(data => {
        // Create and show a modal with the announcement details
        const modalHtml = `
            <div class="modal fade" id="viewAnnouncementModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Announcement Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <h6>Announcement ID: ${data.id}</h6>
                                <p><strong>Title:</strong> ${data.title}</p>
                                <p><strong>Hostel:</strong> ${data.hostel_name}</p>
                                <p><strong>Priority:</strong> ${data.priority}</p>
                                <p><strong>Start Date:</strong> ${formatDate(data.start_date)}</p>
                                <p><strong>End Date:</strong> ${data.end_date ? formatDate(data.end_date) : 'N/A'}</p>
                                <p><strong>Content:</strong></p>
                                <div class="p-3 bg-light rounded">${data.content}</div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existingModal = document.getElementById('viewAnnouncementModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add the new modal to the document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('viewAnnouncementModal'));
        modal.show();
    })
    .catch(error => {
        console.error('Error loading announcement details:', error);
        alert('Failed to load announcement details. Please try again.');
    });
}

function deleteAnnouncement(announcementId) {
    if (!confirm('Are you sure you want to delete this announcement?')) {
        return;
    }
    
    fetch(`/api/admin/announcements/${announcementId}`, {
        method: 'DELETE',
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete announcement');
        }
        return response.json();
    })
    .then(data => {
        alert('Announcement deleted successfully');
        loadAnnouncements();
    })
    .catch(error => {
        console.error('Error deleting announcement:', error);
        alert('Failed to delete announcement. Please try again.');
    });
}

function filterAnnouncements(searchTerm) {
    const rows = document.querySelectorAll('#announcementsTableBody tr');
    searchTerm = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Community Events
function loadCommunityEvents() {
    fetch('/api/admin/events', {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load community events');
        }
        return response.json();
    })
    .then(data => {
        const tableBody = document.getElementById('eventsTableBody');
        tableBody.innerHTML = '';
        
        if (data.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = '<td colspan="8" class="text-center">No community events found</td>';
            tableBody.appendChild(row);
            return;
        }
        
        data.forEach(event => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${event.id}</td>
                <td>${event.title}</td>
                <td>${truncateText(event.description, 50)}</td>
                <td>${event.hostel_name}</td>
                <td>${formatDate(event.event_date)} ${event.event_time}</td>
                <td>${event.location}</td>
                <td>${event.capacity}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewEvent(${event.id})">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteEvent(${event.id})">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    })
    .catch(error => {
        console.error('Error loading community events:', error);
        const tableBody = document.getElementById('eventsTableBody');
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">Error loading community events</td></tr>';
    });
}

function submitEvent() {
    const title = document.getElementById('eventTitle').value;
    const description = document.getElementById('eventDescription').value;
    const hostel = document.getElementById('eventHostel').value;
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const location = document.getElementById('eventLocation').value;
    const capacity = document.getElementById('eventCapacity').value;
    
    if (!title || !description || !hostel || !date || !time || !location || !capacity) {
        alert('Please fill in all required fields');
        return;
    }

    // Validate hostel name
    const validHostels = ['wagyingo sapphire hostel', 'wagyingo onyx hostel', 'wagyingo opal hostel', 'all'];
    if (!validHostels.includes(hostel.toLowerCase())) {
        alert('Please select a valid hostel');
        return;
    }
    
    fetch('/api/admin/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
            title,
            description,
            hostel_name: hostel,
            event_date: date,
            event_time: time,
            location,
            capacity: parseInt(capacity)
        })
    })
    .then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                throw new Error(err.details || err.error || 'Failed to submit event');
            });
        }
        return response.json();
    })
    .then(data => {
        alert('Event submitted successfully');
        document.getElementById('addEventForm').reset();
        bootstrap.Modal.getInstance(document.getElementById('addEventModal')).hide();
        loadCommunityEvents();
    })
    .catch(error => {
        console.error('Error submitting event:', error);
        alert(error.message || 'Failed to submit event. Please try again.');
    });
}

function viewEvent(eventId) {
    fetch(`/api/admin/events/${eventId}`, {
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to load event details');
        }
        return response.json();
    })
    .then(data => {
        // Create and show a modal with the event details
        const modalHtml = `
            <div class="modal fade" id="viewEventModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Event Details</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="mb-3">
                                <h6>Event ID: ${data.id}</h6>
                                <p><strong>Title:</strong> ${data.title}</p>
                                <p><strong>Hostel:</strong> ${data.hostel_name}</p>
                                <p><strong>Date:</strong> ${formatDate(data.event_date)}</p>
                                <p><strong>Time:</strong> ${data.event_time}</p>
                                <p><strong>Location:</strong> ${data.location}</p>
                                <p><strong>Capacity:</strong> ${data.capacity}</p>
                                <p><strong>Description:</strong></p>
                                <div class="p-3 bg-light rounded">${data.description}</div>
                            </div>
                            <div class="mb-3">
                                <h6>Registrations (${data.registrations ? data.registrations.length : 0})</h6>
                                <div class="list-group">
                                    ${data.registrations && data.registrations.length > 0 ? 
                                        data.registrations.map(reg => `
                                            <div class="list-group-item">
                                                <div class="d-flex justify-content-between">
                                                    <span>${reg.student_name}</span>
                                                    <small>${formatDate(reg.registered_at)}</small>
                                                </div>
                                            </div>
                                        `).join('') : 
                                        '<div class="list-group-item">No registrations yet</div>'
                                    }
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Remove any existing modal
        const existingModal = document.getElementById('viewEventModal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Add the new modal to the document
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById('viewEventModal'));
        modal.show();
    })
    .catch(error => {
        console.error('Error loading event details:', error);
        alert('Failed to load event details. Please try again.');
    });
}

function deleteEvent(eventId) {
    if (!confirm('Are you sure you want to delete this event?')) {
        return;
    }
    
    fetch(`/api/admin/events/${eventId}`, {
        method: 'DELETE',
        credentials: 'include'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to delete event');
        }
        return response.json();
    })
    .then(data => {
        alert('Event deleted successfully');
        loadCommunityEvents();
    })
    .catch(error => {
        console.error('Error deleting event:', error);
        alert('Failed to delete event. Please try again.');
    });
}

function filterEvents(searchTerm) {
    const rows = document.querySelectorAll('#eventsTableBody tr');
    searchTerm = searchTerm.toLowerCase();
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

// Helper functions
function getPriorityBadgeClass(priority) {
    switch (priority.toLowerCase()) {
        case 'high':
            return 'danger';
        case 'medium':
            return 'warning';
        case 'low':
            return 'info';
        default:
            return 'secondary';
    }
}

function getStatusBadgeClass(status) {
    switch (status.toLowerCase()) {
        case 'pending':
            return 'warning';
        case 'in_progress':
            return 'primary';
        case 'completed':
            return 'success';
        case 'cancelled':
            return 'danger';
        default:
            return 'secondary';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Notification handling
function handleNotificationClick(event) {
    event.notification.close();
    if (event.notification.data && event.notification.data.url) {
        event.waitUntil(
            clients.openWindow(event.notification.data.url)
        );
    }
}

// Request notification permission
async function requestNotificationPermission() {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted');
            return true;
        } else {
            console.log('Notification permission denied');
            return false;
        }
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        return false;
    }
}

// Show local notification
function showLocalNotification(title, body, data = {}) {
    if (!('Notification' in window)) {
        console.log('This browser does not support notifications');
        return;
    }

    if (Notification.permission === 'granted') {
        const options = {
            body: body,
            icon: '/assets/logo.png',
            data: data
        };
        new Notification(title, options);
    } else if (Notification.permission !== 'denied') {
        requestNotificationPermission().then(permission => {
            if (permission) {
                const options = {
                    body: body,
                    icon: '/assets/logo.png',
                    data: data
                };
                new Notification(title, options);
            }
        });
    }
}

// Add notification handling to existing functions
async function updateBookingStatus(bookingId, status) {
    try {
        const response = await fetch(`/api/admin/bookings/${bookingId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status }),
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to update booking status');
        }

        // Show local notification
        showLocalNotification(
            'Booking Status Updated',
            `Booking #${bookingId} has been ${status}`,
            { url: `/admin-dashboard.html#bookings` }
        );

        loadBookings();
    } catch (error) {
        console.error('Error updating booking status:', error);
        showNotification(error.message, 'error');
    }
}

// Chat Management Functions
async function loadChatSettings() {
    try {
        const response = await fetch('/api/chat/settings', {
            credentials: 'include'
        });
        const settings = await response.json();
        
        // Update UI with current settings
        document.getElementById('retentionPeriod').value = settings.retentionPeriod;
        document.getElementById('backupEnabled').checked = settings.backupEnabled;
        
        // Load backup history
        loadBackupHistory();
    } catch (error) {
        console.error('Error loading chat settings:', error);
        showNotification('Failed to load chat settings', 'danger');
    }
}

async function updateRetentionPeriod() {
    const retentionInput = document.getElementById('retentionPeriod');
    const newValue = parseInt(retentionInput.value);
    
    try {
        const response = await fetch('/api/chat/settings/retention', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ retentionPeriod: newValue })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update retention period');
        }

        // Get the actual updated value from the server response
        const result = await response.json();
        
        // Update the input with the confirmed value from server
        retentionInput.value = result.retentionPeriod;
        showNotification('Retention period updated successfully', 'success');
        
        // Force reload settings to ensure UI is in sync
        await loadChatSettings();
    } catch (error) {
        console.error('Error updating retention period:', error);
        showNotification('Failed to update retention period', 'danger');
        // Reload settings to restore the correct value
        await loadChatSettings();
    }
}

async function updateBackupSettings() {
    const backupEnabled = document.getElementById('backupEnabled').checked;
    
    try {
        const response = await fetch('/api/chat/settings/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ backupEnabled })
        });
        
        if (response.ok) {
            showNotification('Backup settings updated successfully', 'success');
        } else {
            throw new Error('Failed to update backup settings');
        }
    } catch (error) {
        console.error('Error updating backup settings:', error);
        showNotification('Failed to update backup settings', 'danger');
    }
}

async function createBackupNow() {
    try {
        const response = await fetch('/api/chat/backup/create', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            showNotification('Backup created successfully', 'success');
            loadBackupHistory();
        } else {
            throw new Error('Failed to create backup');
        }
    } catch (error) {
        console.error('Error creating backup:', error);
        showNotification('Failed to create backup', 'danger');
    }
}

async function loadBackupHistory() {
    try {
        const response = await fetch('/api/chat/backup/history', {
            credentials: 'include'
        });
        const backups = await response.json();
        
        const tbody = document.querySelector('#backupHistoryTable tbody');
        tbody.innerHTML = '';
        
        backups.forEach(backup => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(backup.date).toLocaleString()}</td>
                <td>${formatFileSize(backup.size)}</td>
                <td>${backup.messageCount}</td>
                <td>${backup.fileCount}</td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="downloadBackup('${backup.id}')">
                        <i class="bi bi-download"></i> Download
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteBackup('${backup.id}')">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error('Error loading backup history:', error);
        showNotification('Failed to load backup history', 'danger');
    }
}

async function downloadBackup(backupId) {
    try {
        const response = await fetch(`/api/chat/backup/download/${backupId}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `chat_backup_${backupId}.zip`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } else {
            throw new Error('Failed to download backup');
        }
    } catch (error) {
        console.error('Error downloading backup:', error);
        showNotification('Failed to download backup', 'danger');
    }
}

async function deleteBackup(backupId) {
    if (!confirm('Are you sure you want to delete this backup?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/chat/backup/${backupId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showNotification('Backup deleted successfully', 'success');
            loadBackupHistory();
        } else {
            throw new Error('Failed to delete backup');
        }
    } catch (error) {
        console.error('Error deleting backup:', error);
        showNotification('Failed to delete backup', 'danger');
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Event Listeners for Chat Management
document.addEventListener('DOMContentLoaded', function() {
    // Load chat settings when community tab is shown
    document.querySelector('[data-tab="community"]').addEventListener('click', loadChatSettings);
    
    // Update retention period
    document.getElementById('updateRetention').addEventListener('click', updateRetentionPeriod);
    
    // Update backup settings
    document.getElementById('backupEnabled').addEventListener('change', updateBackupSettings);
    
    // Create backup now
    document.getElementById('createBackup').addEventListener('click', createBackupNow);
});

// Add these variables at the top of the file
let currentSearchField = 'all';
let currentHostelFilter = 'all';
let currentVerificationFilter = 'all';

// Replace the existing filterUsers function with this enhanced version
function filterUsers() {
    const searchTerm = document.getElementById('userSearch').value.toLowerCase();
    const tbody = document.querySelector('#usersTable tbody');
    const rows = tbody.getElementsByTagName('tr');

    Array.from(rows).forEach(row => {
        const user = {
            name: row.cells[0].textContent.toLowerCase(),
            email: row.cells[1].textContent.toLowerCase(),
            role: row.cells[2].textContent.toLowerCase(),
            hostel: row.cells[3].textContent.toLowerCase(),
            isVerified: row.cells[5].textContent.includes('Verified')
        };

        // Check hostel filter
        const matchesHostel = currentHostelFilter === 'all' || 
            user.hostel === currentHostelFilter.toLowerCase() ||
            (user.hostel === 'n/a' && currentHostelFilter === 'all');

        // Check verification filter
        const matchesVerification = currentVerificationFilter === 'all' ||
            (currentVerificationFilter === 'verified' && user.isVerified) ||
            (currentVerificationFilter === 'unverified' && !user.isVerified);

        // Check search term based on selected field
        let matchesSearch = true;
        if (searchTerm) {
            switch (currentSearchField) {
                case 'name':
                    matchesSearch = user.name.includes(searchTerm);
                    break;
                case 'email':
                    matchesSearch = user.email.includes(searchTerm);
                    break;
                case 'all':
                default:
                    matchesSearch = user.name.includes(searchTerm) ||
                        user.email.includes(searchTerm) ||
                        user.role.includes(searchTerm);
                    break;
            }
        }

        // Show/hide row based on all filters
        row.style.display = matchesHostel && matchesVerification && matchesSearch ? '' : 'none';
    });
}

function filterPayments(searchTerm) {
    searchTerm = searchTerm.toLowerCase();
    const tbody = document.querySelector('#paymentsTable tbody');
    const rows = tbody.getElementsByTagName('tr');

    Array.from(rows).forEach(row => {
        const paymentData = {
            id: row.cells[0].textContent,
            bookingId: row.cells[1].textContent,
            studentName: row.cells[2].textContent,
            room: row.cells[3].textContent,
            hostel: row.cells[4].textContent,
            amount: row.cells[5].textContent
        };

        const searchString = Object.values(paymentData).join(' ').toLowerCase();
        row.style.display = searchString.includes(searchTerm) ? '' : 'none';
    });
}

function filterRooms(searchTerm = '') {
    const hostelFilter = document.getElementById('hostelFilter')?.value || '';
    const roomTypeFilter = document.getElementById('roomTypeFilter')?.value || '';
    const statusFilter = document.getElementById('statusFilter')?.value || '';
    
    const tbody = document.querySelector('#roomsTableBody');
    if (!tbody) return;
    
    const rows = tbody.getElementsByTagName('tr');
    searchTerm = searchTerm.toLowerCase();
    
    Array.from(rows).forEach(row => {
        const roomData = {
            number: row.cells[0].textContent.toLowerCase(),
            hostel: row.cells[1].textContent.toLowerCase(),
            type: row.cells[2].textContent.toLowerCase(),
            price: row.cells[3].textContent.toLowerCase(),
            status: row.cells[4].textContent.toLowerCase()
        };
        
        // Normalize status text for comparison
        const normalizedStatus = roomData.status.split(' ')[0].toLowerCase();
        
        const matchesHostel = !hostelFilter || roomData.hostel === hostelFilter.toLowerCase();
        const matchesType = !roomTypeFilter || roomData.type === roomTypeFilter.toLowerCase();
        const matchesStatus = !statusFilter || normalizedStatus === statusFilter.toLowerCase();
        const matchesSearch = !searchTerm || 
            roomData.number.includes(searchTerm) ||
            roomData.hostel.includes(searchTerm) ||
            roomData.type.includes(searchTerm) ||
            roomData.price.includes(searchTerm);
        
        row.style.display = matchesHostel && matchesType && matchesStatus && matchesSearch ? '' : 'none';
    });
} 