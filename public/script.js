// DOM Elements
let loginBtn, registerBtn, logoutBtn, loginModal, registerModal, bookingModal;
let closeButtons, loginForm, registerForm, bookingForm, roomsGrid;
let hostelFilter, roomTypeFilter, menuBtn, navLinks;
let currentSlide = 0;
const slides = document.querySelectorAll('.hero-slider .slide');
const prevBtn = document.querySelector('.prev-slide');
const nextBtn = document.querySelector('.next-slide');

// State
let currentUser = null;
let selectedRoom = null;
let sessionCheckInterval;

// Room management variables
let allRooms = [];
let filteredRooms = [];
let currentPage = 1;
let itemsPerPage = 15;
let searchTimeout;

let sliderInterval;

// Initialize DOM elements and add event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Initialize DOM elements
    loginBtn = document.getElementById('loginBtn');
    registerBtn = document.getElementById('registerBtn');
    logoutBtn = document.getElementById('logoutBtn');
    loginModal = document.getElementById('loginModal');
    registerModal = document.getElementById('registerModal');
    bookingModal = document.getElementById('bookingModal');
    closeButtons = document.getElementsByClassName('close');
    loginForm = document.getElementById('loginForm');
    registerForm = document.getElementById('registerForm');
    bookingForm = document.getElementById('bookingForm');
    roomsGrid = document.getElementById('roomsGrid');
    hostelFilter = document.getElementById('hostelFilter');
    roomTypeFilter = document.getElementById('roomTypeFilter');
    menuBtn = document.getElementById('menuBtn');
    navLinks = document.querySelector('.nav-links');

    // Add mobile menu event listener
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        if (navLinks && navLinks.classList.contains('active') && 
            !navLinks.contains(e.target) && 
            !menuBtn.contains(e.target)) {
            navLinks.classList.remove('active');
        }
    });

    // Add event listeners for authentication
    if (loginBtn && !window.location.pathname.includes('explore.html')) {
loginBtn.addEventListener('click', () => showModal(loginModal));
    }
    if (registerBtn && !window.location.pathname.includes('explore.html')) {
registerBtn.addEventListener('click', () => showModal(registerModal));
    }
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Add event listeners for all modal close buttons
    document.querySelectorAll('.modal-close, .close, .modal-btn-secondary').forEach(button => {
        button.addEventListener('click', function() {
            const modal = this.closest('.modal');
            if (modal) {
                closeModal(modal.id);
            }
    });
});

    // Add event listeners for switching between modals
    const switchToRegister = document.getElementById('switchToRegister');
    const switchToLogin = document.getElementById('switchToLogin');
    
    if (switchToRegister) {
        switchToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('loginModal');
            openModal('registerModal');
        });
    }
    
    if (switchToLogin) {
        switchToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('registerModal');
            openModal('loginModal');
        });
    }

    // Add form submit event listeners
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (registerForm) registerForm.addEventListener('submit', handleRegister);
    if (bookingForm) bookingForm.addEventListener('submit', async function(e) {
        // First validate the form
        if (!validateBookingForm(e)) {
            return; // Stop if validation fails
        }
        
        // If validation passes, proceed with booking submission
        await handleBookingSubmit(e);
    });

    // Add filter event listeners
    if (hostelFilter) hostelFilter.addEventListener('change', applyFilters);
    if (roomTypeFilter) roomTypeFilter.addEventListener('change', applyFilters);

    // Add rooms navigation link handler
    const roomsNavLink = document.getElementById('roomsNavLink');
    if (roomsNavLink) {
        roomsNavLink.addEventListener('click', function(e) {
            e.preventDefault();
            if (!currentUser) {
                alert('Please login to view available rooms');
                showModal(loginModal);
                return;
            }
            
            const roomsSection = document.getElementById('rooms-section');
            if (roomsSection) {
                roomsSection.scrollIntoView({ behavior: 'smooth' });
            } else {
                // If we're not on the page with the rooms section, redirect to it
                window.location.href = 'index.html#rooms-section';
            }
        });
    }

    // Add tab switching for explore page
    const hostelTabs = document.querySelector('.hostel-tabs');
    if (hostelTabs) {
        console.log('Found hostel tabs, adding event listeners');
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.hostel-tab-content');
        
        console.log('Found tab buttons:', tabButtons.length);
        
        tabButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                e.preventDefault();
                console.log('Tab button clicked:', this.getAttribute('data-hostel'));
                
                // Remove active class from all buttons and contents
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabContents.forEach(content => content.classList.remove('active'));
                
                // Add active class to clicked button and corresponding content
                this.classList.add('active');
                const hostelId = this.getAttribute('data-hostel');
                const contentId = `${hostelId}-content`;
                
                const content = document.getElementById(contentId);
                if (content) {
                    content.classList.add('active');
                    console.log('Activated content for:', contentId);
                } else {
                    console.error('Content not found for:', contentId);
                }
            });
        });
    } else {
        console.log('No hostel tabs found on this page');
    }

    // Initial session check
    checkSession();
    
    // Start periodic session check if user is logged in
    if (currentUser) {
        sessionCheckInterval = setInterval(checkSession, 30000); // Check every 30 seconds
    }

    // Add this to the DOMContentLoaded event listener
    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', () => {
            if (!currentUser) {  // Only allow slider navigation if user is not logged in
                currentSlide = (currentSlide - 1 + slides.length) % slides.length;
                updateSlider();
            }
        });

        nextBtn.addEventListener('click', () => {
            if (!currentUser) {  // Only allow slider navigation if user is not logged in
                currentSlide = (currentSlide + 1) % slides.length;
                updateSlider();
            }
        });

        // Auto advance slides only if user is not logged in
        sliderInterval = setInterval(() => {
            if (!currentUser) {
                currentSlide = (currentSlide + 1) % slides.length;
                updateSlider();
            }
        }, 5000);
    }

    // Initialize room management
    initializeRoomManagement();

    // Initialize resend verification functionality
    const resendVerificationLink = document.getElementById('resendVerificationLink');
    const resendVerificationForm = document.getElementById('resendVerificationForm');
    const resendVerificationBtn = document.getElementById('resendVerificationBtn');
    const emailUpdateSection = document.getElementById('emailUpdateSection');
    const currentEmailSpan = document.getElementById('currentEmail');

    if (resendVerificationLink) {
        resendVerificationLink.addEventListener('click', (e) => {
            e.preventDefault();
            closeModal('loginModal');
            openModal('resendVerificationModal');
        });
    }

    if (resendVerificationForm) {
        resendVerificationForm.querySelector('#resendUsername').addEventListener('input', async function() {
            const username = this.value;
            if (username.length >= 3) {
                try {
                    const response = await fetch(`/api/check-user?username=${encodeURIComponent(username)}`);
                    const data = await response.json();
                    
                    if (data.exists && !data.is_verified) {
                        emailUpdateSection.style.display = 'block';
                        currentEmailSpan.textContent = data.email;
                    } else {
                        emailUpdateSection.style.display = 'none';
                    }
                } catch (error) {
                    console.error('Error checking username:', error);
                }
            }
        });
    }

    if (resendVerificationBtn) {
        resendVerificationBtn.addEventListener('click', async function() {
            const username = document.getElementById('resendUsername').value;
            const newEmail = document.getElementById('newEmail').value;

            if (!username) {
                showNotification('Please enter your username', 'error');
                return;
            }

            // Show loading state
            const btnText = this.querySelector('.btn-text');
            const btnLoader = this.querySelector('.btn-loader');
            this.disabled = true;
            btnText.style.display = 'none';
            btnLoader.style.display = 'inline-block';

            try {
                const response = await fetch('/api/resend-verification', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ username, new_email: newEmail })
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to resend verification code');
                }

                showNotification(data.message || 'Verification code sent successfully', 'success');
                closeModal('resendVerificationModal');
                resendVerificationForm.reset();
            } catch (error) {
                showNotification(error.message, 'error');
            } finally {
                // Restore button state
                this.disabled = false;
                btnText.style.display = 'inline-block';
                btnLoader.style.display = 'none';
            }
        });
    }

    // Add input event listeners for real-time validation
    const phoneInputs = document.querySelectorAll('#phone, #guardianPhone');
    phoneInputs.forEach(input => {
        input.addEventListener('input', function() {
            const isValid = validatePhoneNumber(this.value);
            this.classList.toggle('error', !isValid);
            if (isValid) {
                this.style.borderColor = 'rgba(52, 152, 219, 0.3)';
                this.style.backgroundColor = '';
            } else {
                this.style.borderColor = '#dc3545';
                this.style.backgroundColor = '#fff8f8';
            }
        });
    });

    const nameInputs = document.querySelectorAll('#fullName, #guardianName');
    nameInputs.forEach(input => {
        input.addEventListener('input', function() {
            const isValid = validateFullName(this.value);
            this.classList.toggle('error', !isValid);
            if (isValid) {
                this.style.borderColor = 'rgba(52, 152, 219, 0.3)';
                this.style.backgroundColor = '';
            } else {
                this.style.borderColor = '#dc3545';
                this.style.backgroundColor = '#fff8f8';
            }
        });
    });

    const nationalityInput = document.querySelector('#nationality');
    if (nationalityInput) {
        nationalityInput.addEventListener('input', function() {
            const isValid = validateNationality(this.value);
            this.classList.toggle('error', !isValid);
            if (isValid) {
                this.style.borderColor = 'rgba(52, 152, 219, 0.3)';
                this.style.backgroundColor = '';
            } else {
                this.style.borderColor = '#dc3545';
                this.style.backgroundColor = '#fff8f8';
            }
        });
    }

    const programInput = document.querySelector('#program');
    if (programInput) {
        programInput.addEventListener('input', function() {
            const isValid = validateProgram(this.value);
            this.classList.toggle('error', !isValid);
            if (isValid) {
                this.style.borderColor = 'rgba(52, 152, 219, 0.3)';
                this.style.backgroundColor = '';
            } else {
                this.style.borderColor = '#dc3545';
                this.style.backgroundColor = '#fff8f8';
            }
        });
    }

    const relationshipInput = document.querySelector('#guardianRelationship');
    if (relationshipInput) {
        relationshipInput.addEventListener('input', function() {
            const isValid = validateRelationship(this.value);
            this.classList.toggle('error', !isValid);
            if (isValid) {
                this.style.borderColor = 'rgba(52, 152, 219, 0.3)';
                this.style.backgroundColor = '';
            } else {
                this.style.borderColor = '#dc3545';
                this.style.backgroundColor = '#fff8f8';
            }
        });
    }

    // Call updateFooterLinks when the page loads
    updateFooterLinks();
});

// Modal Functions - Moving these outside DOMContentLoaded
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
    modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
        
        // Reset any forms inside the modal
        const form = modal.querySelector('form');
        if (form) {
            form.reset();
        }
        
        // Hide any error messages
        const errorMessages = modal.querySelectorAll('.error-message');
        errorMessages.forEach(msg => msg.style.display = 'none');

        // Reset email update section in resend verification modal
        const emailUpdateSection = document.getElementById('emailUpdateSection');
        if (emailUpdateSection) {
            emailUpdateSection.style.display = 'none';
        }
    }
}

function showModal(modal) {
    if (typeof modal === 'string') {
        openModal(modal);
    } else if (modal && modal.id) {
        openModal(modal.id);
    }
}

// Add click outside handler for modals
window.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
        closeModal(event.target.id);
    }
});

// Notification function - Moving outside DOMContentLoaded
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notificationMessage');
    if (!notification) {
        // Create notification element if it doesn't exist
        const newNotification = document.createElement('div');
        newNotification.id = 'notificationMessage';
        document.body.appendChild(newNotification);
    }
    
    const notificationElement = document.getElementById('notificationMessage');
    const icon = type === 'success' ? 'check-circle' : 'exclamation-circle';
    
    notificationElement.innerHTML = `<i class="fas fa-${icon}"></i>${message}`;
    notificationElement.className = `notification-message ${type}`;
    notificationElement.classList.add('visible');

    // Auto-hide after 5 seconds
    setTimeout(() => {
        notificationElement.classList.remove('visible');
    }, 5000);
}

// Update handleLogin function
async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
        username: formData.get('username'),
        password: formData.get('password')
    };

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const btnText = submitBtn.querySelector('.btn-text');
    const btnLoader = submitBtn.querySelector('.btn-loader');
    if (btnText && btnLoader) {
        submitBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
    }

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (response.ok) {
            showNotification('Login successful! Redirecting...', 'success');
            
            // Update UI state
            currentUser = result;
            
            // Close the modal first
            closeModal('loginModal');
            
            // Update UI and load rooms
            await updateAuthUI();
            if (typeof loadRooms === 'function') {
                await loadRooms(currentUser.preferred_hostel);
            }
            
            // Redirect after a short delay
            setTimeout(() => {
                window.location.href = result.redirect || '/index.html';
            }, 1000);
        } else {
            // Check if the error is due to unverified email
            if (result.error === 'Please verify your email address before logging in') {
                throw new Error('Please verify your email address before logging in. Check your email/spam folder for the verification link');
            }
            throw new Error(result.error || 'Invalid credentials');
        }
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'An error occurred during login', 'error');
    } finally {
        // Restore button state
        if (btnText && btnLoader) {
            submitBtn.disabled = false;
            btnText.style.display = 'inline-block';
            btnLoader.style.display = 'none';
        }
    }

    // Call updateFooterLinks after login
    updateFooterLinks();
}

// Password visibility toggle
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Password strength checker
function checkPasswordStrength(password) {
    let strength = 0;
    
    // Length check
    if (password.length >= 8) strength++;
    
    // Contains number
    if (/\d/.test(password)) strength++;
    
    // Contains lowercase
    if (/[a-z]/.test(password)) strength++;
    
    // Contains uppercase
    if (/[A-Z]/.test(password)) strength++;
    
    // Contains special char
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    return strength;
}

function updatePasswordStrengthMeter(password) {
    const strength = checkPasswordStrength(password);
    const meter = document.querySelector('.strength-meter-fill');
    
    meter.classList.remove('strength-weak', 'strength-medium', 'strength-strong');
    
    if (strength <= 2) {
        meter.classList.add('strength-weak');
    } else if (strength <= 4) {
        meter.classList.add('strength-medium');
    } else {
        meter.classList.add('strength-strong');
    }
}

// Enhanced form validation
function validateForm(formData) {
    const errors = {};
    
    // Username validation
    const username = formData.get('username');
    if (username.length < 3) {
        errors.username = 'Username must be at least 3 characters long';
    }
    
    // Email validation
    const email = formData.get('email');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        errors.email = 'Please enter a valid email address';
    }
    
    // Password validation
    const password = formData.get('password');
    const confirmPassword = formData.get('confirm_password');
    
    if (password.length < 8) {
        errors.password = 'Password must be at least 8 characters long';
    }
    
    if (password !== confirmPassword) {
        errors.confirm_password = 'Passwords do not match';
    }
    
    return errors;
}

async function handleRegister(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);
    
    // Clear previous errors
    form.querySelectorAll('.error-message').forEach(el => el.remove());
    form.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
    
    // Validate form
    const errors = validateForm(formData);
    
    if (Object.keys(errors).length > 0) {
        // Display errors
        Object.entries(errors).forEach(([field, message]) => {
            const input = form.querySelector(`[name="${field}"]`);
            input.classList.add('error');
            
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message visible';
            errorDiv.textContent = message;
            input.parentNode.appendChild(errorDiv);
        });
        return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.classList.add('loading');
    
    const data = {
        full_name: formData.get('full_name'),
        username: formData.get('username'),
        email: formData.get('email'),
        password: formData.get('password'),
        preferred_hostel: formData.get('preferred_hostel')
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(data)
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || 'Registration failed');
        }

        // Show success message
        const successMessage = document.createElement('div');
        successMessage.className = 'verification-message success';
        successMessage.textContent = 'Registration successful! Please check your email for verification.';
        form.appendChild(successMessage);
        
        // Reset form and hide modal after delay
        setTimeout(() => {
            registerModal.style.display = 'none';
            showModal(loginModal);
        }, 3000);
        
    } catch (error) {
        console.error('Registration error:', error);
        
        // Show error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'verification-message error';
        errorMessage.textContent = error.message || 'An error occurred during registration';
        form.appendChild(errorMessage);
    } finally {
        // Remove loading state
        submitBtn.classList.remove('loading');
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
    currentUser = null;
    updateAuthUI();
            // Clear any session check intervals
            if (sessionCheckInterval) {
                clearInterval(sessionCheckInterval);
                sessionCheckInterval = null;
            }
            // Redirect to home page
            window.location.href = 'index.html';
        }
    } catch (error) {
        console.error('Logout error:', error);
    }

    // Call updateFooterLinks after logout
    updateFooterLinks();
}

async function updateAuthUI() {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const roomsNavLink = document.getElementById('roomsNavLink');
    const roomsSection = document.getElementById('rooms');
    const bookingDetailsLink = document.getElementById('bookingDetailsLink');
    const residentsPortalLink = document.getElementById('residentsPortalLink');
    const heroTitle = document.querySelector('.hero h1');
    const heroSubtitle = document.querySelector('.hero-subtitle');
    const heroDescription = document.querySelector('.hero-description');
    const heroCta = document.querySelector('.hero-cta');
    const sliderNav = document.querySelector('.slider-nav');
    const hostelsSection = document.getElementById('hostels');

    if (currentUser) {
        loginBtn.style.display = 'none';
        registerBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        roomsNavLink.style.display = 'block';
        if (roomsSection) roomsSection.classList.remove('hidden');
        if (hostelsSection) hostelsSection.style.display = 'none';
        
        // Update hero section with user's preferred hostel
        if (heroTitle) {
            heroTitle.textContent = `Welcome to ${currentUser.preferred_hostel}`;
        }
        if (heroSubtitle) {
            heroSubtitle.textContent = 'YOUR HOME AWAY FROM HOME';
        }
        if (heroDescription) {
            heroDescription.textContent = 'Experience comfort and convenience in your chosen accommodation';
        }
        if (heroCta) {
            heroCta.innerHTML = `
                <button class="btn btn-primary" onclick="document.getElementById('rooms-section').scrollIntoView({behavior: 'smooth'})">View Available Rooms</button>
                <button class="btn btn-outline" onclick="location.href='booking-details.html'">View My Booking</button>
            `;
        }
        if (sliderNav) {
            sliderNav.style.display = 'none';
        }
        
        // Show only the first slide and hide others
        if (slides.length > 0) {
            slides.forEach((slide, index) => {
                if (index === 0) {
                    slide.classList.add('active');
                    slide.style.display = '';
                    slide.style.visibility = 'visible';
                    slide.style.opacity = '1';
                    // Extract just the hostel name (Opal, Main, or Onyx) from the full name
                    if (currentUser && currentUser.preferred_hostel) {
                        const hostelName = currentUser.preferred_hostel.split(' ')[1]?.toLowerCase() || 'main';
                        slide.style.backgroundImage = `url('assets/${hostelName}-slider.jpg')`;
                    } else {
                        slide.style.backgroundImage = "url('assets/main-slider.jpg')";
                    }
                    slide.style.backgroundSize = 'cover';
                    slide.style.backgroundPosition = 'center';
                } else {
                    slide.classList.remove('active');
                    slide.style.display = 'none';
                    slide.style.visibility = 'hidden';
                    slide.style.opacity = '0';
                }
            });
        }
        
        // Clear the slider interval
        if (sliderInterval) {
            clearInterval(sliderInterval);
            sliderInterval = null;
        }
    } else {
        loginBtn.style.display = 'block';
        registerBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
        roomsNavLink.style.display = 'none';
        if (roomsSection) roomsSection.classList.add('hidden');
        if (hostelsSection) hostelsSection.style.display = 'block';
        if (bookingDetailsLink) bookingDetailsLink.style.display = 'none';
        if (residentsPortalLink) residentsPortalLink.style.display = 'none';
        
        // Reset hero section to default state
        if (heroTitle) {
            heroTitle.textContent = 'Premium Student Living\nNear KNUST';
        }
        if (heroSubtitle) {
            heroSubtitle.textContent = 'WELCOME TO WAGYINGO HOSTELS';
        }
        if (heroDescription) {
            heroDescription.textContent = 'Experience comfort, security, and academic excellence in our modern accommodations';
        }
        if (heroCta) {
            heroCta.innerHTML = `
                <button class="btn btn-primary" onclick="document.getElementById('hostels').scrollIntoView({behavior: 'smooth'})">View Our Hostels</button>
                <button class="btn btn-outline" onclick="showModal(loginModal)">Take a Tour</button>
            `;
        }
        if (sliderNav) {
            sliderNav.style.display = 'flex';
        }
        
        // Reset slides to default state
        if (slides.length > 0) {
            slides.forEach((slide, index) => {
                slide.style.display = '';
                if (index === 0) {
                    slide.classList.add('active');
                    slide.style.backgroundImage = "url('assets/main-slider.jpg')";
                } else {
                    slide.classList.remove('active');
                }
            });
        }
        
        // Restart the slider interval
        if (!sliderInterval) {
            sliderInterval = setInterval(() => {
                currentSlide = (currentSlide + 1) % slides.length;
                updateSlider();
            }, 5000);
        }
    }
    
    // Check if user has an active booking and payment status
    try {
        const response = await fetch('/api/bookings/user', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const bookingData = await response.json();
            if (bookingData && bookingData.status !== 'cancelled') {
                // User has an active booking
                if (bookingDetailsLink) bookingDetailsLink.style.display = 'block';
                
                // Check payment status for residents portal
                try {
                    const paymentResponse = await fetch(`/api/bookings/${bookingData.id}/payment-status`, {
                        credentials: 'include'
                    });
                    
                    if (paymentResponse.ok) {
                        const paymentData = await paymentResponse.json();
                        if (bookingData.status === 'APPROVED' && paymentData && paymentData.payment_status === 'paid') {
                            if (residentsPortalLink) residentsPortalLink.style.display = 'inline';
                        } else {
                            if (residentsPortalLink) residentsPortalLink.style.display = 'none';
                        }
                    }
                } catch (error) {
                    console.error('Error checking payment status:', error);
                    if (residentsPortalLink) residentsPortalLink.style.display = 'none';
                }
            } else {
                // User has no active booking
                if (bookingDetailsLink) bookingDetailsLink.style.display = 'none';
                if (residentsPortalLink) residentsPortalLink.style.display = 'none';
            }
        } else {
            // Error or no booking found
            if (bookingDetailsLink) bookingDetailsLink.style.display = 'none';
            if (residentsPortalLink) residentsPortalLink.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking booking status:', error);
        if (bookingDetailsLink) bookingDetailsLink.style.display = 'none';
        if (residentsPortalLink) residentsPortalLink.style.display = 'none';
    }
}

async function loadRooms(hostelName = null) {
    try {
        const roomsSection = document.getElementById('rooms-section');
        if (!roomsSection) return;

        showLoadingSpinner();

        // Check session first
        const sessionResponse = await fetch('/api/check-session', {
            credentials: 'include'
        });
        
        if (!sessionResponse.ok) {
            hideLoadingSpinner();
            roomsSection.classList.add('hidden');
            throw new Error('Please login to view rooms');
        }

        const userData = await sessionResponse.json();
        currentUser = userData;
        
        // Update UI including hero section
        updateAuthUI();

        // Use the user's preferred hostel if no specific hostel is provided
        const targetHostel = hostelName || currentUser.preferred_hostel;

        // Construct URL for rooms API
        const url = `/api/rooms?hostel=${encodeURIComponent(targetHostel)}`;

        const response = await fetch(url, {
            credentials: 'include',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch rooms');
        }

        const rooms = await response.json();
        
        if (!Array.isArray(rooms)) {
            throw new Error('Invalid response format from server');
        }

        // Filter out rooms that don't belong to the user's preferred hostel
        allRooms = rooms.filter(room => room.hostel_name === targetHostel);
        filteredRooms = [...allRooms];

        // Show rooms section
        roomsSection.classList.remove('hidden');
        
        // Update UI
        updatePagination();
        displayRooms();

    } catch (error) {
        console.error('Error loading rooms:', error);
        if (error.message === 'Please login to view rooms') {
            showModal(loginModal);
        } else {
            alert('Failed to load rooms. Please try again later.');
        }
    } finally {
        hideLoadingSpinner();
    }
}

function displayRooms() {
    const roomsGrid = document.getElementById('rooms-grid');
    if (!roomsGrid) return;

    roomsGrid.innerHTML = '';
    
    if (filteredRooms.length === 0) {
        roomsGrid.innerHTML = '<div class="no-rooms">No rooms available matching your criteria</div>';
        return;
    }

    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const roomsToShow = filteredRooms.slice(start, end);

    roomsToShow.forEach(room => {
        const roomCard = createRoomCard(room);
        roomsGrid.appendChild(roomCard);
    });
}

function createRoomCard(room) {
    const roomImages = {
        'single': 'assets/room_images/single.jpg',
        'double': 'assets/room_images/double.jpg',
        'triple': 'assets/room_images/double.jpg', // Use double room image for triple
        'quad': 'assets/room_images/double.jpg', // Use double room image for quad
        'default': 'assets/room_images/single.jpg'
    };

    const roomType = room.room_type.toLowerCase();
    const imageUrl = roomImages[roomType] || roomImages.default;

    // Determine availability status and text
    let availabilityStatus = '';
    let availabilityClass = '';
    let availabilityText = '';

    const status = room.status.toLowerCase();

    if (status === 'fully_occupied' || status === 'booked') {
        availabilityStatus = 'unavailable';
        availabilityClass = 'status-unavailable';
        availabilityText = 'Fully Occupied';
        if (room.gender_occupancy) {
            availabilityText += ` (${room.gender_occupancy.charAt(0).toUpperCase() + room.gender_occupancy.slice(1)} Only)`;
        }
    } else if (status === 'partially_occupied') {
        availabilityStatus = 'available';
        availabilityClass = 'status-partial';
        const slotsLeft = room.max_occupants - room.current_occupants;
        availabilityText = `${slotsLeft} ${slotsLeft === 1 ? 'Slot' : 'Slots'} Available`;
        if (room.gender_occupancy) {
            availabilityText += ` (${room.gender_occupancy.charAt(0).toUpperCase() + room.gender_occupancy.slice(1)} Only)`;
        }
    } else if (status === 'available') {
        availabilityStatus = 'available';
        availabilityClass = 'status-available';
        availabilityText = 'Available';
    }

    // Create the room card element
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.dataset.roomId = room.id;

    // Create the room image container
    const roomImage = document.createElement('div');
    roomImage.className = 'room-image';

    // Create and set up the image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = `${room.room_number}`;
    img.loading = 'lazy';
    roomImage.appendChild(img);

    // Create and set up the status badge
    const statusBadge = document.createElement('div');
    statusBadge.className = `room-status ${availabilityClass}`;
    statusBadge.textContent = availabilityText;
    roomImage.appendChild(statusBadge);

    // Create the room info container
    const roomInfo = document.createElement('div');
    roomInfo.className = 'room-info';

    // Add room number as the most prominent element
    const roomNumber = document.createElement('h2');
    roomNumber.className = 'room-number';
    roomNumber.textContent = `${room.room_number}`;
    roomInfo.appendChild(roomNumber);

    // Add room type below room number
    const roomTypeHeading = document.createElement('h3');
    roomTypeHeading.className = 'room-type';
    roomTypeHeading.textContent = room.room_type;
    roomInfo.appendChild(roomTypeHeading);

    // Add room price in Ghana Cedis
    const roomPrice = document.createElement('p');
    roomPrice.className = 'room-price';
    roomPrice.textContent = `GH₵ ${room.price.toLocaleString()}`;
    roomInfo.appendChild(roomPrice);

    // Add booking button based on room status
    if (status === 'available' || status === 'partially_occupied') {
        const bookButton = document.createElement('button');
        bookButton.className = 'btn btn-primary book-btn';
        bookButton.textContent = 'Book Now';
        bookButton.onclick = () => bookRoom(room.id);
        roomInfo.appendChild(bookButton);
    } else {
        const unavailableButton = document.createElement('button');
        unavailableButton.className = 'btn btn-secondary book-btn';
        unavailableButton.disabled = true;
        unavailableButton.textContent = 'Fully Occupied';
        roomInfo.appendChild(unavailableButton);
    }

    // Append all elements to the room card
    roomCard.appendChild(roomImage);
    roomCard.appendChild(roomInfo);

    return roomCard;
}

function bookRoom(roomId) {
    if (!currentUser) {
        alert('Please login to book a room');
        showModal(loginModal);
        return;
    }
    
    // Find the room details
    const room = allRooms.find(r => r.id === roomId);
    if (!room) {
        showNotification('Room not found', 'error');
        return;
    }

    // Check gender compatibility for partially occupied rooms
    if (room.status === 'partially_occupied' && room.gender_occupancy) {
        showModal(bookingModal);
        const genderSelect = document.getElementById('gender');
        if (genderSelect) {
            // Pre-select the required gender
            genderSelect.value = room.gender_occupancy;
            // Disable changing the gender
            genderSelect.disabled = true;
            // Add a note about gender restriction
            const note = document.createElement('small');
            note.className = 'text-muted';
            note.textContent = `This room is restricted to ${room.gender_occupancy} students only`;
            genderSelect.parentNode.appendChild(note);
        }
    } else {
        // For available rooms, just show the modal normally
    showModal(bookingModal);
}

    selectedRoom = roomId;
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    if (!selectedRoom) {
        showNotification('Please select a room first', 'error');
        return;
    }
    
    const formData = new FormData(e.target);
    const bookingData = {
        roomId: selectedRoom,
        fullName: formData.get('fullName'),
        academicLevel: formData.get('academicLevel'),
        program: formData.get('program'),
        phone: formData.get('phone'),
        nationality: formData.get('nationality'),
        gender: formData.get('gender'),
        guardianName: formData.get('guardianName'),
        guardianRelationship: formData.get('guardianRelationship'),
        guardianPhone: formData.get('guardianPhone')
    };

    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(bookingData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create booking');
        }

        showNotification('Booking submitted successfully! Redirecting to booking details...', 'success');
        closeModal('bookingModal');
        e.target.reset();
        selectedRoom = null;
        
        // Update the UI to show the booking details link
        await updateAuthUI();
        
        // Add a delay before redirecting
        setTimeout(() => {
            window.location.href = 'booking-details.html';
        }, 2000); // 2 second delay
    } catch (error) {
        console.error('Error creating booking:', error);
        showNotification(error.message || 'Failed to create booking', 'error');
    }
}

function filterRooms() {
    const roomTypeFilter = document.getElementById('roomTypeFilter');
    const roomsGrid = document.getElementById('rooms-grid');
    
    if (!roomTypeFilter || !roomsGrid) {
        console.error('Required elements for filtering not found. Make sure roomTypeFilter and rooms-grid elements exist.');
        return;
    }

    const roomTypeValue = roomTypeFilter.value.toLowerCase();
    
    const roomCards = roomsGrid.getElementsByClassName('room-card');
    Array.from(roomCards).forEach(card => {
        const roomTypeElement = card.querySelector('.room-type');
        if (!roomTypeElement) return;
        
        const roomType = roomTypeElement.textContent.toLowerCase();
        const roomTypeMatch = !roomTypeValue || roomType === roomTypeValue;
        
        card.style.display = roomTypeMatch ? 'block' : 'none';
    });
}

// Function to check user's booking status and show/hide residents portal link
async function checkResidentStatus() {
    try {
        const response = await fetch('/api/bookings/user', {
            credentials: 'include'
        });

        if (!response.ok) {
            return;
        }

        const booking = await response.json();
        
        if (!booking) {
            return;
        }

        // Load payment details
        const paymentResponse = await fetch(`/api/bookings/${booking.id}/payment-status`, {
            credentials: 'include'
        });

        if (!paymentResponse.ok) {
            return;
        }

        const paymentData = await paymentResponse.json();

        // Show residents portal link if booking is approved and payment is paid
        const residentsPortalLink = document.getElementById('residentsPortalLink');
        if (booking.status === 'APPROVED' && paymentData && paymentData.payment_status === 'paid') {
            residentsPortalLink.style.display = 'inline';
        } else {
            residentsPortalLink.style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking resident status:', error);
    }
}

function handleLoggedIn(username) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const roomsNavLink = document.getElementById('roomsNavLink');
    const bookingDetailsLink = document.getElementById('bookingDetailsLink');
    
    if (loginBtn) loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = 'block';
    if (roomsNavLink) roomsNavLink.style.display = 'block';

    // Check for active booking
    fetch('/api/bookings/user', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(async booking => {
        if (booking && booking.status !== 'cancelled') {
            if (bookingDetailsLink) bookingDetailsLink.style.display = 'block';
            
            // Check payment status for residents portal
            try {
                const paymentResponse = await fetch(`/api/bookings/${booking.id}/payment-status`, {
                    credentials: 'include'
                });
                
                if (paymentResponse.ok) {
                    const paymentData = await paymentResponse.json();
                    const residentsPortalLink = document.getElementById('residentsPortalLink');
                    
                    if (booking.status === 'APPROVED' && paymentData && paymentData.payment_status === 'paid') {
                        if (residentsPortalLink) residentsPortalLink.style.display = 'inline';
                    }
                }
            } catch (error) {
                console.error('Error checking payment status:', error);
            }
        }
    })
    .catch(error => {
        console.error('Error checking booking:', error);
    });
}

async function checkSession() {
    try {
        const response = await fetch('/api/check-session', {
            credentials: 'include'
        });

        if (!response.ok) {
            currentUser = null;
updateAuthUI();
            return false;
        }

        const data = await response.json();
        if (data.username) {
            currentUser = data;
            handleLoggedIn(data.username);
            
            // Initialize UI for logged-in user
            updateAuthUI();
            
            // Load rooms for the user's preferred hostel
            if (currentUser.preferred_hostel) {
                const roomsSection = document.getElementById('rooms-section');
                if (roomsSection) {
                    roomsSection.classList.remove('hidden');
                    await loadRooms(currentUser.preferred_hostel);
                }
            }
            
            return true;
        } else {
            currentUser = null;
            updateAuthUI();
            return false;
        }
    } catch (error) {
        console.error('Error checking session:', error);
        currentUser = null;
updateAuthUI();
        return false;
    }
}

async function handleHostelClick(hostelName) {
    try {
        // First check session
        const sessionResponse = await fetch('/api/check-session', {
            credentials: 'include'
        });

        if (!sessionResponse.ok) {
            showModal(loginModal);
            return;
        }

        const userData = await sessionResponse.json();
        currentUser = userData;

        // Check if the clicked hostel matches user's preferred hostel
        if (hostelName !== currentUser.preferred_hostel) {
            alert('You can only view rooms in your preferred hostel');
            return;
        }

        // Show rooms section and scroll to it
        const roomsSection = document.getElementById('rooms-section');
        roomsSection.classList.remove('hidden');
        roomsSection.scrollIntoView({ behavior: 'smooth' });

        // Reset filters
        if (document.getElementById('type-filter')) {
            document.getElementById('type-filter').value = '';
        }
        
        // Load rooms for this hostel
        await loadRooms(hostelName);

    } catch (error) {
        console.error('Error handling hostel click:', error);
        alert('An error occurred while loading rooms. Please try again.');
    }
}

async function cancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel your booking?')) {
        return;
    }

    try {
        const response = await fetch(`/api/bookings/cancel/${bookingId}`, {
            method: 'PUT',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to cancel booking');
        }

        const data = await response.json();
        alert('Booking cancelled successfully');
        window.location.reload();
    } catch (error) {
        console.error('Error cancelling booking:', error);
        alert(error.message || 'Failed to cancel booking');
    }
}

function updateSlider() {
    slides.forEach((slide, index) => {
        if (index === currentSlide) {
            slide.classList.add('active');
        } else {
            slide.classList.remove('active');
        }
    });
}

// Initialize room management
function initializeRoomManagement() {
    // Event listeners for filters
    const searchInput = document.getElementById('roomSearch');
    const typeFilter = document.getElementById('roomTypeFilter');
    const priceFilter = document.getElementById('priceFilter');
    const itemsPerPageSelect = document.getElementById('items-per-page');

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                applyFilters();
            }, 300);
        });
    }

    if (typeFilter) typeFilter.addEventListener('change', applyFilters);
    if (priceFilter) priceFilter.addEventListener('change', applyFilters);
    if (itemsPerPageSelect) itemsPerPageSelect.addEventListener('change', handleItemsPerPageChange);

    // Initialize pagination buttons
    document.querySelector('.prev-page')?.addEventListener('click', () => changePage(currentPage - 1));
    document.querySelector('.next-page')?.addEventListener('click', () => changePage(currentPage + 1));
}

// Apply all filters and search
function applyFilters() {
    const searchTerm = document.getElementById('roomSearch')?.value.toLowerCase() || '';
    const typeFilter = document.getElementById('roomTypeFilter')?.value.toLowerCase() || '';
    const priceFilter = document.getElementById('priceFilter')?.value || '';

    showLoadingSpinner();

    filteredRooms = allRooms.filter(room => {
        // Search by room number or type
        const matchesSearch = searchTerm === '' || 
            room.room_number.toLowerCase().includes(searchTerm) ||
            room.room_type.toLowerCase().includes(searchTerm) ||
            room.hostel_name.toLowerCase().includes(searchTerm);

        // Match room type from dropdown
        const matchesType = typeFilter === '' || 
            room.room_type.toLowerCase() === typeFilter;
        
        // Match exact price
        let matchesPrice = true;
        if (priceFilter !== '') {
            const price = parseFloat(room.price);
            const filterPrice = parseFloat(priceFilter);
            matchesPrice = price === filterPrice;
        }

        return matchesSearch && matchesType && matchesPrice;
    });

    currentPage = 1;
    updatePagination();
    displayRooms();
    hideLoadingSpinner();
}

// Handle items per page change
function handleItemsPerPageChange(e) {
    itemsPerPage = parseInt(e.target.value);
    currentPage = 1;
    updatePagination();
    displayRooms();
}

// Change current page
function changePage(newPage) {
    currentPage = newPage;
    updatePagination();
    displayRooms();
    // Smooth scroll to top of rooms section
    document.getElementById('rooms-section').scrollIntoView({ behavior: 'smooth' });
}

// Update pagination controls
function updatePagination() {
    const totalPages = Math.ceil(filteredRooms.length / itemsPerPage);
    const paginationElement = document.getElementById('pagination');
    const prevButton = paginationElement.querySelector('.prev-page');
    const nextButton = paginationElement.querySelector('.next-page');

    // Clear existing page numbers
    Array.from(paginationElement.querySelectorAll('button:not(.prev-page):not(.next-page)'))
        .forEach(btn => btn.remove());

    // Update prev/next buttons
    prevButton.disabled = currentPage === 1;
    nextButton.disabled = currentPage === totalPages;

    // Generate page numbers
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
    }

    if (startPage > 1) {
        addPageButton(1);
        if (startPage > 2) {
            addEllipsis();
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        addPageButton(i);
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            addEllipsis();
        }
        addPageButton(totalPages);
    }

    // Update showing info
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(start + itemsPerPage - 1, filteredRooms.length);
    document.getElementById('showing-start').textContent = start;
    document.getElementById('showing-end').textContent = end;
    document.getElementById('total-items').textContent = filteredRooms.length;
}

// Add page number button
function addPageButton(pageNum) {
    const button = document.createElement('button');
    button.textContent = pageNum;
    button.classList.toggle('active', pageNum === currentPage);
    button.addEventListener('click', () => changePage(pageNum));
    document.getElementById('pagination').insertBefore(
        button,
        document.querySelector('.next-page')
    );
}

// Add ellipsis
function addEllipsis() {
    const span = document.createElement('span');
    span.textContent = '...';
    span.className = 'pagination-ellipsis';
    document.getElementById('pagination').insertBefore(
        span,
        document.querySelector('.next-page')
    );
}

// Show loading spinner
function showLoadingSpinner() {
    const spinner = document.querySelector('.loading-spinner');
    const roomsGrid = document.getElementById('rooms-grid');
    if (spinner) spinner.classList.add('active');
    if (roomsGrid) roomsGrid.style.opacity = '0.5';
}

// Hide loading spinner
function hideLoadingSpinner() {
    const spinner = document.querySelector('.loading-spinner');
    const roomsGrid = document.getElementById('rooms-grid');
    if (spinner) spinner.classList.remove('active');
    if (roomsGrid) roomsGrid.style.opacity = '1';
}

// Booking form validation functions
function validatePhoneNumber(phone) {
    // Allow formats: +233XXXXXXXXX, 02XXXXXXXX, 05XXXXXXXX
    const phoneRegex = /^(?:\+233|0[25])[0-9]{8}$/;
    return phoneRegex.test(phone.trim());
}

function validateFullName(name) {
    // At least two names, letters, hyphens and spaces, minimum 2 characters each
    const nameRegex = /^[A-Za-z-]{2,}(?:\s[A-Za-z-]{2,})+$/;
    return nameRegex.test(name.trim());
}

function validateNationality(nationality) {
    // Only letters and spaces, minimum 3 characters
    const nationalityRegex = /^[A-Za-z\s]{3,}$/;
    return nationalityRegex.test(nationality.trim());
}

function validateProgram(program) {
    // Minimum 3 characters, letters, numbers, spaces, and basic punctuation
    const programRegex = /^[A-Za-z0-9\s\-\.,]{3,}$/;
    return programRegex.test(program.trim());
}

function validateRelationship(relationship) {
    // Only letters and spaces, minimum 3 characters
    const relationshipRegex = /^[A-Za-z\s]{3,}$/;
    return relationshipRegex.test(relationship.trim());
}

function createErrorContainer() {
    const existingContainer = document.querySelector('.booking-error-container');
    if (existingContainer) {
        return existingContainer;
    }

    const container = document.createElement('div');
    container.className = 'booking-error-container';
    
    // Insert the error container at the beginning of the form
    const bookForm = document.querySelector('.book-page form');
    if (bookForm) {
        bookForm.insertBefore(container, bookForm.firstChild);
    }
    
    return container;
}

function showValidationErrors(errors) {
    // Remove any existing error container
    const existingContainer = document.querySelector('.validation-errors-container');
    if (existingContainer) {
        existingContainer.remove();
    }

    // Create new error container
    const container = document.createElement('div');
    container.className = 'validation-errors-container';
    
    // Add header with icon
    const header = document.createElement('h4');
    header.innerHTML = '<i class="fas fa-exclamation-circle"></i> Please check the following:';
    container.appendChild(header);

    // Add close button
    const closeButton = document.createElement('button');
    closeButton.className = 'close-errors';
    closeButton.innerHTML = '<i class="fas fa-times"></i>';
    closeButton.onclick = () => container.remove();
    container.appendChild(closeButton);

    // Add error list
    const errorList = document.createElement('ul');
    errorList.className = 'validation-error-list';
    errors.forEach(error => {
        const li = document.createElement('li');
        li.textContent = error;
        errorList.appendChild(li);
    });
    container.appendChild(errorList);

    // Add to document
    document.body.appendChild(container);

    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (container.parentNode) {
            container.remove();
        }
    }, 10000);
}

function validateBookingForm(event) {
    event.preventDefault();
    let isValid = true;
    const errors = [];

    try {
        // Get form elements with error handling
        const getFormElement = (selector) => {
            const element = document.querySelector(selector);
            if (!element) {
                console.error(`Element not found: ${selector}`);
                throw new Error('Form element not found');
            }
            return element;
        };

        // Clear previous errors
        document.querySelectorAll('.error').forEach(el => {
            el.classList.remove('error');
            el.style.removeProperty('border-color');
            el.style.removeProperty('background-color');
        });

        // Get all form inputs
        const formElements = {
            fullName: getFormElement('#fullName'),
            academicLevel: getFormElement('#academicLevel'),
            program: getFormElement('#program'),
            phone: getFormElement('#phone'),
            nationality: getFormElement('#nationality'),
            gender: getFormElement('#gender'),
            guardianName: getFormElement('#guardianName'),
            guardianRelationship: getFormElement('#guardianRelationship'),
            guardianPhone: getFormElement('#guardianPhone')
        };

        // Validate Personal Information
        if (!validateFullName(formElements.fullName.value)) {
            errors.push("Full name must include at least first and last name");
            formElements.fullName.classList.add('error');
            isValid = false;
        }

        if (!formElements.academicLevel.value || formElements.academicLevel.value === "Select Level") {
            errors.push("Please select your academic level");
            formElements.academicLevel.classList.add('error');
            isValid = false;
        }

        if (!validateProgram(formElements.program.value)) {
            errors.push("Check that your program of study is correct");
            formElements.program.classList.add('error');
            isValid = false;
        }

        if (!validatePhoneNumber(formElements.phone.value)) {
            errors.push("Check Phone Number");
            formElements.phone.classList.add('error');
            isValid = false;
        }

        if (!validateNationality(formElements.nationality.value)) {
            errors.push("Please enter your nationality");
            formElements.nationality.classList.add('error');
            isValid = false;
        }

        // Validate Guardian Information
        if (!formElements.gender.value || formElements.gender.value === "Select Gender") {
            errors.push("Please select guardian's gender");
            formElements.gender.classList.add('error');
            isValid = false;
        }

        if (!validateFullName(formElements.guardianName.value)) {
            errors.push("Guardian's name must include at least first and last name");
            formElements.guardianName.classList.add('error');
            isValid = false;
        }

        if (!validateRelationship(formElements.guardianRelationship.value)) {
            errors.push("Check relationship with guardian");
            formElements.guardianRelationship.classList.add('error');
            isValid = false;
        }

        if (!validatePhoneNumber(formElements.guardianPhone.value)) {
            errors.push("Check guardian's phone number");
            formElements.guardianPhone.classList.add('error');
            isValid = false;
        }

        // Show errors if any
        if (!isValid) {
            showValidationErrors(errors);
            return false;
        }

        return true;

    } catch (error) {
        console.error('Validation error:', error);
        showNotification('An error occurred during form validation. Please try again.', 'error');
        return false;
    }
}

// Function to update footer links based on login status
function updateFooterLinks() {
    const hostelsLink = document.getElementById('hostelsLink');
    if (hostelsLink) {
        // Check if user is logged in
        const isLoggedIn = document.getElementById('logoutBtn').style.display !== 'none';
        hostelsLink.style.display = isLoggedIn ? 'none' : 'inline';
    }
} 