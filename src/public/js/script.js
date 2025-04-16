// DOM Elements
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginModal = document.getElementById('loginModal');
const registerModal = document.getElementById('registerModal');
const bookingModal = document.getElementById('bookingModal');
const closeButtons = document.getElementsByClassName('close');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const bookingForm = document.getElementById('bookingForm');
const roomsGrid = document.getElementById('roomsGrid');
const hostelFilter = document.getElementById('hostelFilter');
const roomTypeFilter = document.getElementById('roomTypeFilter');

// State
let currentUser = null;
let selectedRoom = null;

// Event Listeners
loginBtn.addEventListener('click', () => showModal(loginModal));
registerBtn.addEventListener('click', () => showModal(registerModal));
logoutBtn.addEventListener('click', handleLogout);

Array.from(closeButtons).forEach(button => {
    button.addEventListener('click', () => {
        loginModal.style.display = 'none';
        registerModal.style.display = 'none';
        bookingModal.style.display = 'none';
    });
});

loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
bookingForm.addEventListener('submit', handleBooking);

hostelFilter.addEventListener('change', filterRooms);
roomTypeFilter.addEventListener('change', filterRooms);

// Functions
function showModal(modal) {
    modal.style.display = 'block';
}

async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(loginForm);
    const data = {
        username: formData.get('username'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            currentUser = data.username;
            updateAuthUI();
            loginModal.style.display = 'none';
            loadRooms();
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('An error occurred during login');
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(registerForm);
    const data = {
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password')
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            alert('Registration successful! Please login.');
            registerModal.style.display = 'none';
            showModal(loginModal);
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('Registration error:', error);
        alert('An error occurred during registration');
    }
}

function handleLogout() {
    currentUser = null;
    updateAuthUI();
    roomsGrid.innerHTML = '';
}

function updateAuthUI() {
    if (currentUser) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
    } else {
        loginBtn.style.display = 'block';
        registerBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
}

async function loadRooms() {
    try {
        const response = await fetch('/api/rooms');
        if (!response.ok) {
            throw new Error('Failed to fetch rooms');
        }
        const rooms = await response.json();
        displayRooms(rooms);
    } catch (error) {
        console.error('Error loading rooms:', error);
        alert('Failed to load rooms');
    }
}

function displayRooms(rooms) {
    roomsGrid.innerHTML = '';
    rooms.forEach(room => {
        const roomCard = createRoomCard(room);
        roomsGrid.appendChild(roomCard);
    });
}

function createRoomCard(room) {
    const card = document.createElement('div');
    card.className = 'room-card';
    
    card.innerHTML = `
        <img src="https://images.unsplash.com/photo-1611892440504-42a792e24d32?ixlib=rb-1.2.1&auto=format&fit=crop&w=1950&q=80" alt="${room.room_type} Room">
        <div class="room-info">
            <h3>${room.hostel_name}</h3>
            <p>Room ${room.room_number} - ${room.room_type}</p>
            <p class="room-price">$${room.price}/month</p>
            <button class="btn" onclick="bookRoom(${room.id})">Book Now</button>
        </div>
    `;
    
    return card;
}

function bookRoom(roomId) {
    if (!currentUser) {
        alert('Please login to book a room');
        showModal(loginModal);
        return;
    }
    
    selectedRoom = roomId;
    showModal(bookingModal);
}

async function handleBooking(e) {
    e.preventDefault();
    const formData = new FormData(bookingForm);
    const data = {
        roomId: selectedRoom,
        checkInDate: formData.get('checkInDate'),
        checkOutDate: formData.get('checkOutDate')
    };

    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (response.ok) {
            alert('Booking successful!');
            bookingModal.style.display = 'none';
            loadRooms();
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('Booking error:', error);
        alert('An error occurred during booking');
    }
}

function filterRooms() {
    const hostelValue = hostelFilter.value;
    const roomTypeValue = roomTypeFilter.value;
    
    const roomCards = roomsGrid.getElementsByClassName('room-card');
    Array.from(roomCards).forEach(card => {
        const hostelName = card.querySelector('h3').textContent;
        const roomType = card.querySelector('p').textContent.split(' - ')[1];
        
        const hostelMatch = !hostelValue || hostelName === hostelValue;
        const roomTypeMatch = !roomTypeValue || roomType === roomTypeValue;
        
        card.style.display = hostelMatch && roomTypeMatch ? 'block' : 'none';
    });
}

// Initial load
updateAuthUI();
if (currentUser) {
    loadRooms();
} 