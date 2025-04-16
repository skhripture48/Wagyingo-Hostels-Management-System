// Initialize DOM elements
const editBookingModal = document.getElementById('editBookingModal');
const editBookingForm = document.getElementById('editBookingForm');
const editModalCloseButtons = document.getElementsByClassName('close');
const logoutBtn = document.getElementById('logoutBtn');
const loginBtn = document.getElementById('loginBtn');
const registerBtn = document.getElementById('registerBtn');
const bookingDetails = document.getElementById('bookingDetails');
const roomsNavLink = document.getElementById('roomsNavLink');
const bookingDetailsLink = document.getElementById('bookingDetailsLink');
const residentsPortalLink = document.getElementById('residentsPortalLink');
const menuBtn = document.getElementById('menuBtn');
const navLinks = document.querySelector('.nav-links');

// Add mobile menu functionality
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

let currentBooking = null;  // Add this at the top with other variable declarations
let currentPayment = null;
let selectedPaymentMethod = null;
let selectedFile = null;

// Add event listeners
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Show loading state
        bookingDetails.innerHTML = `
            <div class="booking-section">
                <h2>Loading...</h2>
                <p>Please wait while we fetch your booking details.</p>
            </div>
        `;

        // Check session first
        const sessionResponse = await fetch('/api/check-session', {
            credentials: 'include'
        });
        
        if (!sessionResponse.ok) {
            throw new Error('Session check failed');
        }

        const sessionData = await sessionResponse.json();
        
        if (!sessionData.username) {
            window.location.href = 'index.html';
            return;
        }

        // Update UI with user info
        if (loginBtn) loginBtn.style.display = 'none';
        if (registerBtn) registerBtn.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (roomsNavLink) roomsNavLink.style.display = 'none'; // Hide rooms nav link on booking details page
        if (bookingDetailsLink) bookingDetailsLink.style.display = 'block';

        // Load booking details
        await loadBookingDetails();
    } catch (error) {
        console.error('Error initializing page:', error);
        bookingDetails.innerHTML = `
            <div class="booking-section">
                <h2>Error</h2>
                <p>Failed to load booking details. Please try again later.</p>
                <a href="index.html" class="btn btn-primary">Return to Home</a>
            </div>
        `;
    }
});

// Close modal when clicking the close button
Array.from(editModalCloseButtons).forEach(button => {
    button.addEventListener('click', () => {
        editBookingModal.style.display = 'none';
    });
});

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === editBookingModal) {
        editBookingModal.style.display = 'none';
    }
});

// Handle form submission
editBookingForm.addEventListener('submit', handleEditBooking);

// Load booking details
async function loadBookingDetails() {
    try {
        // Get booking ID from URL if admin view
        const urlParams = new URLSearchParams(window.location.search);
        const bookingId = urlParams.get('id');
        
        let endpoint = bookingId 
            ? `/api/bookings/${bookingId}`
            : '/api/bookings/user';

        const response = await fetch(endpoint, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch booking details');
        }

        const booking = await response.json();
        
        if (!booking) {
            document.getElementById('bookingDetails').innerHTML = '<p>No active booking found.</p>';
            return;
        }

        currentBooking = booking;

        // Display booking details first
        displayBookingDetails(booking);

        // Load payment details for all bookings
        try {
            const paymentData = await loadPaymentDetails(booking.id);
            currentPayment = paymentData;

            // Check booking and payment status to show/hide residents portal link
            if (booking.status === 'APPROVED' && paymentData && paymentData.payment_status === 'paid') {
                residentsPortalLink.style.display = 'inline';
            } else {
                residentsPortalLink.style.display = 'none';
            }

            const paymentContent = document.getElementById('paymentContent');
            if (paymentContent) {
                if (paymentData && paymentData.receipt_path) {
                    // If there's a receipt, show receipt preview
                    updateReceiptPreview(paymentData);
                } else {
                    // If no receipt, show payment options
                    paymentContent.innerHTML = getPaymentOptionsHTML();
                    // Add event listeners for payment options
                    addPaymentOptionListeners();
                }
            }
        } catch (error) {
            console.error('Error loading payment details:', error);
            // If payment details fail to load, still show payment options
            const paymentContent = document.getElementById('paymentContent');
            if (paymentContent) {
                paymentContent.innerHTML = `
                    <div class="alert alert-warning">
                        <i class="fas fa-exclamation-triangle"></i> Unable to load payment details. 
                        ${error.message}
                    </div>
                `;
            }
        }

    } catch (error) {
        console.error('Error loading booking details:', error);
        document.getElementById('bookingDetails').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-circle"></i> Error loading booking details. Please try refreshing the page.
                <br>
                <small>Error details: ${error.message}</small>
            </div>
        `;
    }
}

// Function to get payment options HTML
function getPaymentOptionsHTML() {
    // Check if booking is approved
    const isApproved = currentBooking && currentBooking.status.toLowerCase() === 'approved';
    
    return `
        <div class="payment-options">
            <div class="payment-option ${!isApproved ? 'disabled' : ''}" data-method="mobile_money">
                <img src="/assets/mobile-money.jpg" alt="Mobile Money">
                <div class="payment-option-text">Mobile Money</div>
            </div>
            <div class="payment-option ${!isApproved ? 'disabled' : ''}" data-method="bank">
                <img src="/assets/bank.png" alt="Bank Transfer">
                <div class="payment-option-text">Bank Transfer</div>
            </div>
        </div>

        <div class="payment-instructions">
            <div class="mobile_money-instructions" style="display: none;">
                <h3>Mobile Money Payment Instructions</h3>
                <ol>
                    <li>Send money to: 0712345678</li>
                    <li>Use your booking ID as reference</li>
                    <li>Take a screenshot of the confirmation</li>
                    <li>Upload the screenshot below</li>
                </ol>
            </div>
            <div class="bank-instructions" style="display: none;">
                <h3>Bank Transfer Instructions</h3>
                <ol>
                    <li>Bank: ECOBANK(GH)</li>
                    <li>Account Number: 1441004849656</li>
                    <li>Account Name: Wagyingo Hostel</li>
                    <li>Branch: Kantamanto Branch</li>
                    <li>Use your booking ID as reference</li>
                    <li>Upload the receipt below</li>
                </ol>
            </div>
        </div>

        <div class="upload-section">
            <div class="file-upload">
                <input type="file" id="receiptFile" accept=".jpg,.jpeg,.png,.pdf" style="display: none;" disabled>
                <button class="btn btn-secondary" id="selectFileBtn" disabled>
                    <i class="fas fa-upload"></i> Select File
                </button>
                <div id="selectedFileName" style="display: none;">
                    Selected file: <span id="fileName"></span>
                </div>
            </div>
            <button id="uploadReceipt" class="btn btn-success" style="display: none;">
                <i class="fas fa-check"></i> Upload Receipt
            </button>
        </div>

        <div id="receiptPreview" style="display: none;">
            <div class="receipt-preview">
                <img id="receiptImage" style="display: none; max-width: 100%; max-height: 300px;">
                <iframe id="receiptPdf" style="display: none; width: 100%; height: 300px;"></iframe>
                <div class="receipt-info">
                    <p>Payment Method: <span id="paymentMethodDisplay"></span></p>
                    <p>Upload Date: <span id="uploadDateDisplay"></span></p>
                    <p>Status: <span id="paymentStatusDisplay" class="badge"></span></p>
                </div>
                <div class="receipt-actions">
                    <button id="viewReceipt" class="btn btn-primary">
                        <i class="fas fa-eye"></i> View Receipt
                    </button>
                    <button id="replaceReceipt" class="btn btn-secondary">
                        <i class="fas fa-sync"></i> Replace Receipt
                    </button>
                    <button id="deleteReceipt" class="btn btn-danger">
                        <i class="fas fa-trash"></i> Delete Receipt
                    </button>
                </div>
            </div>
        </div>

        <style>
            .payment-options {
                display: flex;
                gap: 20px;
                margin-bottom: 20px;
            }
            .payment-option {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 20px;
                border: 2px solid #ddd;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .payment-option:hover {
                border-color: #1a237e;
                transform: translateY(-2px);
            }
            .payment-option.active {
                border-color: #1a237e;
                background-color: #f5f7fa;
            }
            .payment-option.disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .payment-option img {
                width: 80px;
                height: 80px;
                object-fit: contain;
                margin-bottom: 10px;
            }
            .payment-option-text {
                font-weight: 500;
                color: #333;
            }
            .upload-section {
                margin-top: 20px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            .file-upload {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            .receipt-preview {
                margin-top: 20px;
                padding: 20px;
                border: 1px solid #ddd;
                border-radius: 8px;
            }
            .receipt-info {
                margin: 15px 0;
            }
            .receipt-actions {
                display: flex;
                gap: 10px;
                margin-top: 15px;
            }
        </style>
    `;
}

// Function to show notification
function showNotification(message, type = 'info') {
    // Remove any existing notifications
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification alert alert-${type} alert-dismissible fade show`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;

    // Add notification to the top of the booking container
    const container = document.querySelector('.booking-container');
    if (container) {
        container.insertBefore(notification, container.firstChild);
    } else {
        // Fallback to body if booking-container is not found
        document.body.insertBefore(notification, document.body.firstChild);
    }

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Function to handle receipt upload
async function handleReceiptUpload() {
    if (!selectedFile) {
        showNotification('Please select a file first', 'warning');
        return;
    }

    if (!selectedPaymentMethod) {
        showNotification('Please select a payment method first', 'warning');
        return;
    }

    // If there's an existing receipt, delete it first
    if (currentPayment && currentPayment.receipt_path) {
        try {
            const deleteResponse = await fetch(`/api/bookings/${currentBooking.id}/delete-receipt`, {
                method: 'DELETE',
                credentials: 'include'
            });

            if (!deleteResponse.ok) {
                throw new Error('Failed to delete existing receipt');
            }
        } catch (error) {
            console.error('Error deleting existing receipt:', error);
            showNotification('Failed to delete existing receipt. Please try again.', 'error');
            return;
        }
    }

    const formData = new FormData();
    formData.append('receipt', selectedFile);
    formData.append('paymentMethod', selectedPaymentMethod);
    formData.append('bookingId', currentBooking.id);
    
    // Add created_at with current timestamp
    const now = new Date();
    formData.append('created_at', now.toISOString());

    try {
        const response = await fetch('/api/bookings/upload-receipt', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload receipt');
        }

        const result = await response.json();
        
        // Ensure the response includes the created_at field
        if (!result.created_at) {
            result.created_at = now.toISOString();
        }
        
        showNotification('Receipt uploaded successfully! Please wait for admin review.', 'info');
        
        // Reset the form
        const receiptFile = document.getElementById('receiptFile');
        const uploadReceiptBtn = document.getElementById('uploadReceipt');
        const fileNameDiv = document.getElementById('selectedFileName');
        
        if (receiptFile) receiptFile.value = '';
        if (uploadReceiptBtn) uploadReceiptBtn.style.display = 'none';
        if (fileNameDiv) fileNameDiv.style.display = 'none';
        selectedFile = null;
        
        // Reload booking details to show the new receipt
        await loadBookingDetails();
    } catch (error) {
        console.error('Error uploading receipt:', error);
        showNotification('Failed to upload receipt. Please try again.', 'error');
    }
}

// Function to add payment option event listeners
function addPaymentOptionListeners() {
    // Check if booking is approved
    const isApproved = currentBooking && currentBooking.status.toLowerCase() === 'approved';
    
    if (!isApproved) {
        return; // Don't add event listeners if booking is not approved
    }

    const paymentOptions = document.querySelectorAll('.payment-option');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const receiptFile = document.getElementById('receiptFile');
    const uploadReceiptBtn = document.getElementById('uploadReceipt');

    // Only disable file input and select button if we're not in replace mode
    if (currentPayment && currentPayment.receipt_path && !document.getElementById('receiptPreview')) {
        if (selectFileBtn) selectFileBtn.disabled = true;
        if (receiptFile) receiptFile.disabled = true;
        return;
    }

    paymentOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove active class from all options
            paymentOptions.forEach(opt => opt.classList.remove('active'));
            // Add active class to clicked option
            option.classList.add('active');
            
            // Hide all instruction sections
            document.querySelectorAll('.payment-instructions > div').forEach(div => {
                div.style.display = 'none';
            });
            
            // Show selected payment method instructions
            const method = option.dataset.method;
            document.querySelector(`.${method}-instructions`).style.display = 'block';
            
            // Store selected payment method
            selectedPaymentMethod = method;

            // Enable file selection
            if (selectFileBtn) selectFileBtn.disabled = false;
            if (receiptFile) receiptFile.disabled = false;
        });
    });

    // Add click handler for select file button
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', () => {
            if (receiptFile) {
                receiptFile.click();
            }
        });
    }

    // Add change handler for file input
    if (receiptFile) {
        receiptFile.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                // Check file type
                const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
                if (!allowedTypes.includes(file.type)) {
                    alert('Please upload a JPEG, PNG, or PDF file');
                    this.value = '';
                    return;
                }

                // Check file size (max 5MB)
                if (file.size > 5 * 1024 * 1024) {
                    alert('File size should not exceed 5MB');
                    this.value = '';
                    return;
                }

                selectedFile = file;
                if (uploadReceiptBtn) uploadReceiptBtn.style.display = 'block';
                
                // Show selected file name
                const fileNameDiv = document.getElementById('selectedFileName');
                const fileNameSpan = document.getElementById('fileName');
                if (fileNameDiv && fileNameSpan) {
                    fileNameSpan.textContent = file.name;
                    fileNameDiv.style.display = 'block';
                }
            } else {
                selectedFile = null;
                if (uploadReceiptBtn) uploadReceiptBtn.style.display = 'none';
                const fileNameDiv = document.getElementById('selectedFileName');
                if (fileNameDiv) fileNameDiv.style.display = 'none';
            }
        });
    }

    // Add click handler for upload receipt button
    if (uploadReceiptBtn) {
        uploadReceiptBtn.addEventListener('click', handleReceiptUpload);
    }
}

// Display booking details
function displayBookingDetails(booking) {
    const statusClass = {
        'pending': 'status-pending',
        'approved': 'status-approved',
        'rejected': 'status-rejected',
        'cancelled': 'status-cancelled'
    }[booking.status.toLowerCase()] || 'status-pending';

    // Only show user information section if this is an admin view (URL has a booking ID)
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminView = urlParams.has('id') || window.location.pathname.includes('admin-dashboard') || window.location.href.includes('admin');

    const userInfoSection = isAdminView ? `
        <div class="booking-section">
            <h2>User Information</h2>
            <div class="booking-info">
                <div class="info-item">
                    <span class="info-label">Username</span>
                    <span class="info-value">${booking.username || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Email</span>
                    <span class="info-value">${booking.email || 'N/A'}</span>
                </div>
                <div class="info-item">
                    <span class="info-label">Full Name</span>
                    <span class="info-value">${booking.full_name || 'N/A'}</span>
                </div>
            </div>
        </div>
    ` : '';

    // Determine payment section content based on booking status
    let paymentSectionContent = '';
    if (booking.status.toLowerCase() === 'cancelled' || booking.status.toLowerCase() === 'rejected') {
        paymentSectionContent = `
            <div class="payment-update-section">
                <h2>Payment Update</h2>
                <div class="alert alert-${booking.status.toLowerCase() === 'cancelled' ? 'info' : 'danger'}">
                    <i class="fas fa-${booking.status.toLowerCase() === 'cancelled' ? 'info-circle' : 'exclamation-triangle'}"></i> 
                    This booking has been ${booking.status.toLowerCase()}. No payment is required.
                </div>
            </div>
        `;
    } else if (booking.status.toLowerCase() === 'pending') {
        paymentSectionContent = `
            <div class="payment-update-section">
                <h2>Payment Update</h2>
                <div class="alert alert-warning" style="
                    padding: 20px;
                    border-radius: 8px;
                    background-color: #fff3cd;
                    border: 1px solid #ffeeba;
                    color: #856404;
                    margin: 15px 0;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-size: 15px;
                ">
                    <i class="fas fa-clock" style="font-size: 20px;"></i>
                    <div>
                        <strong>Booking Status: Pending Approval</strong><br>
                        You will be able to make payment once your booking has been approved by the administrator.
                        Please check back later or contact support if you have any questions.
                    </div>
                </div>
            </div>
        `;
    } else {
        // For approved bookings, show the payment section
        paymentSectionContent = `
            <div class="payment-update-section">
                <h2>Payment Update</h2>
                <div id="paymentContent"></div>
            </div>
        `;
    }

    // Create booking actions section
    let bookingActions = '';
    const canBeEditedOrCancelled = booking.status.toLowerCase() === 'pending' || booking.status.toLowerCase() === 'approved';
    const canBeDownloaded = booking.status.toLowerCase() === 'approved';
    
    if (!isAdminView) { // Only show user-specific actions if not admin view
        bookingActions += '<div class="booking-actions">';
        if (canBeEditedOrCancelled) {
            bookingActions += `
                <button onclick="editBooking(${booking.id})" class="btn btn-primary">
                    <i class="fas fa-edit"></i> Edit Booking
                </button>
                <button onclick="cancelBooking(${booking.id})" class="btn btn-danger">
                    <i class="fas fa-times"></i> Cancel Booking
                </button>
            `;
        }
        
        // Only add download button if status is not rejected or cancelled
        if (booking.status.toLowerCase() !== 'rejected' && booking.status.toLowerCase() !== 'cancelled') {
            bookingActions += `
                <button onclick="${canBeDownloaded ? `downloadBookingSlip(${booking.id})` : 'showDownloadMessage()'}" 
                    class="btn btn-secondary ${!canBeDownloaded ? 'disabled' : ''}"
                    style="${!canBeDownloaded ? 'cursor: not-allowed; opacity: 0.6;' : ''}"
                    title="${canBeDownloaded ? 'Download Booking Slip' : 'Booking must be approved to download slip'}">
                    <i class="fas fa-download"></i> Download Slip
                </button>
            `;
        }
        bookingActions += '</div>';
    } else { // Admin actions
        bookingActions = `
            <div class="booking-actions">
                ${booking.status.toLowerCase() === 'rejected' ? `
                    <button onclick="updateBookingStatus(${booking.id}, 'pending')" class="btn btn-warning">
                        <i class="fas fa-clock"></i> Set Pending
                    </button>
                ` : ''}
                <button onclick="updateBookingStatus(${booking.id}, 'approved')" class="btn btn-success">
                    <i class="fas fa-check"></i> Approve Booking
                </button>
                <button onclick="updateBookingStatus(${booking.id}, 'rejected')" class="btn btn-danger">
                    <i class="fas fa-times"></i> Reject Booking
                </button>
                <button onclick="updateBookingStatus(${booking.id}, 'cancelled')" class="btn btn-secondary">
                    <i class="fas fa-ban"></i> Cancel Booking
                </button>
            </div>
        `;
    }
    
    // Add status message for rejected/cancelled bookings
    let statusMessage = '';
    if (booking.status.toLowerCase() === 'rejected') {
        statusMessage = `
            <div class="alert alert-danger rejected-message">
                <i class="fas fa-exclamation-triangle"></i> Your booking was rejected. Please contact administration for more details.
            </div>
        `;
    } else if (booking.status.toLowerCase() === 'cancelled') {
        statusMessage = `
            <div class="alert alert-secondary">
                <i class="fas fa-info-circle"></i> This booking has been cancelled.
            </div>
        `;
    } else if (booking.status.toLowerCase() === 'approved') {
        statusMessage = `
            <div class="alert alert-success" style="
                padding: 20px;
                border-radius: 8px;
                background-color: #d4edda;
                border: 1px solid #c3e6cb;
                color: #155724;
                margin: 15px 0;
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 15px;
            ">
                <i class="fas fa-check-circle" style="font-size: 20px;"></i>
                <div>
                    <strong style="
                        display: inline-block;
                        animation: wiggle 0.5s ease-in-out 6;
                    ">Booking Status: Approved!</strong><br>
                    You can now proceed with payment. Please select your preferred payment method below.
                </div>
            </div>
            <style>
                @keyframes wiggle {
                    0%, 100% { transform: rotate(0deg); }
                    25% { transform: rotate(-5deg); }
                    75% { transform: rotate(5deg); }
                }
            </style>
        `;
    }
    
    bookingDetails.innerHTML = `
        ${userInfoSection}
        ${statusMessage}
        <div class="booking-details">
            <div class="booking-section">
                <h2>Personal Information</h2>
                <div class="booking-info">
                    <div class="info-item">
                        <span class="info-label">Full Name</span>
                        <span class="info-value">${booking.full_name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Academic Level</span>
                        <span class="info-value">${booking.academic_level || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Program</span>
                        <span class="info-value">${booking.program || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Phone</span>
                        <span class="info-value">${booking.phone || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Nationality</span>
                        <span class="info-value">${booking.nationality || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Gender</span>
                        <span class="info-value">${booking.gender || 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="booking-section">
                <h2>Guardian Information</h2>
                <div class="booking-info">
                    <div class="info-item">
                        <span class="info-label">Guardian's Name</span>
                        <span class="info-value">${booking.guardian_name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Relationship</span>
                        <span class="info-value">${booking.guardian_relationship || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Guardian's Phone</span>
                        <span class="info-value">${booking.guardian_phone || 'N/A'}</span>
                    </div>
                </div>
            </div>

            <div class="booking-section">
                <h2>Room Information</h2>
                <div class="booking-info">
                    <div class="info-item">
                        <span class="info-label">Room Number</span>
                        <span class="info-value">${booking.room_number || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Hostel</span>
                        <span class="info-value">${booking.hostel_name || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Room Type</span>
                        <span class="info-value">${booking.room_type || 'N/A'}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Status</span>
                        <span class="status-badge ${statusClass}">${booking.status || 'N/A'}</span>
                    </div>
                </div>
            </div>
        </div>

        ${bookingActions}
        ${paymentSectionContent}
    `;
}

// Edit booking
function editBooking(bookingId) {
    // Fetch current booking details
    fetch('/api/bookings/user', {
        credentials: 'include'
    })
    .then(response => response.json())
    .then(booking => {
        if (!booking || booking.id !== bookingId) {
            throw new Error('Invalid booking data');
        }

        // Populate the edit form
        document.getElementById('editBookingId').value = booking.id;
        document.getElementById('editFullName').value = booking.full_name;
        document.getElementById('editAcademicLevel').value = booking.academic_level;
        document.getElementById('editProgram').value = booking.program;
        document.getElementById('editPhone').value = booking.phone;
        document.getElementById('editNationality').value = booking.nationality;
        document.getElementById('editGender').value = booking.gender;
        document.getElementById('editGuardianName').value = booking.guardian_name;
        document.getElementById('editGuardianRelationship').value = booking.guardian_relationship;
        document.getElementById('editGuardianPhone').value = booking.guardian_phone;

        // Show the modal
        editBookingModal.style.display = 'block';
    })
    .catch(error => {
        console.error('Error fetching booking details:', error);
        alert('Failed to load booking details');
    });
}

// Handle edit booking submission
async function handleEditBooking(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const bookingData = {
        bookingId: parseInt(formData.get('bookingId')),
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
        const response = await fetch('/api/bookings/update', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(bookingData)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update booking');
        }

        alert('Booking updated successfully!');
        editBookingModal.style.display = 'none';
        loadBookingDetails(); // Reload booking details
    } catch (error) {
        console.error('Error updating booking:', error);
        alert(error.message || 'Failed to update booking');
    }
}

// Cancel booking
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

// Download booking slip with watermark and professional layout
async function downloadBookingSlip(bookingId) {
    // Check if booking is pending
    if (currentBooking && currentBooking.status.toLowerCase() === 'pending') {
        showDownloadMessage();
        return;
    }

    try {
        const response = await fetch('/api/bookings/user', {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to fetch booking details');
        }

        const booking = await response.json();
        
        // Additional check for booking status
        if (booking.status.toLowerCase() === 'pending') {
            showDownloadMessage();
            return;
        }

        // Initialize jsPDF
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // Function to add watermark to current page
        function addWatermark() {
            // Save current state
            const currentFillColor = doc.getFillColor();
            const currentTextColor = doc.getTextColor();
            const currentFontSize = doc.getFontSize();
            const currentFont = doc.getFont();

            // Add watermark
            doc.saveGraphicsState();
            doc.setGState(new doc.GState({ opacity: 0.1 }));
            doc.setTextColor(128, 128, 128);
            doc.setFontSize(60);
            doc.setFont('helvetica', 'bold');
            doc.text('Wagyingo Hostel', 105, 150, {
                align: 'center',
                angle: 45
            });
            doc.restoreGraphicsState();

            // Restore previous state
            doc.setFillColor(currentFillColor);
            doc.setTextColor(currentTextColor);
            doc.setFontSize(currentFontSize);
            doc.setFont(currentFont.fontName, currentFont.fontStyle);
        }

        // Set document properties
        doc.setProperties({
            title: `Wagyingo Hostels - Booking Slip ${bookingId}`,
            subject: 'Hostel Booking Confirmation',
            author: 'Wagyingo Hostels',
            keywords: 'booking, hostel, accommodation',
            creator: 'Wagyingo Booking System'
        });

        // Add watermark to first page
        addWatermark();

        // Add logo
        try {
            doc.addImage('/assets/logo.png', 'PNG', 85, 15, 40, 15); // Centered at the top
        } catch (error) {
            console.error('Error adding logo:', error);
        }

        // Add header text below logo
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text('KNUST-Ayeduase', 105, 45, { align: 'center' });
        doc.text('Phone: 0203652247', 105, 52, { align: 'center' });
        doc.text('Email: students.wagyingo@gmail.com', 105, 59, { align: 'center' });

        // Account details section starts lower to accommodate logo
        doc.setFillColor(0, 77, 64);
        doc.rect(15, 65, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Account Details', 20, 70);

        // Reset text color
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');

        // Account details with compact layout
        doc.autoTable({
            startY: 75,
            body: [
                ['Account Number:', '1441004849656'],
                ['Account Name:', 'Wagyingo Hostel'],
                ['Bank:', 'ECOBANK(GH) Kantamanto Branch']
            ],
            theme: 'plain',
            styles: {
                fontSize: 10,
                cellPadding: 2
            },
            columnStyles: {
                0: { fontStyle: 'normal', cellWidth: 40 },
                1: { fontStyle: 'bold', cellWidth: 'auto' }
            },
            margin: { left: 20 }
        });

        // Personal details section
        doc.setFillColor(0, 77, 64);
        doc.rect(15, doc.lastAutoTable.finalY + 5, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('PERSONAL DETAILS', 20, doc.lastAutoTable.finalY + 10);

        // Reset text color
        doc.setTextColor(0, 0, 0);

        // Personal details table
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            body: [
                ['Full Name', booking.full_name],
                ['Program', booking.program],
                ['Academic Level', booking.academic_level],
                ['Phone', booking.phone],
                ['Nationality', booking.nationality],
                ['Gender', booking.gender]
            ],
            theme: 'grid',
            styles: {
                fontSize: 10,
                cellPadding: 3
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 50 },
                1: { cellWidth: 130 }
            }
        });

        // Room details section
        doc.setFillColor(0, 77, 64);
        doc.rect(15, doc.lastAutoTable.finalY + 5, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('ROOM DETAILS', 20, doc.lastAutoTable.finalY + 10);

        // Reset text color
        doc.setTextColor(0, 0, 0);

        // Room details table
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            body: [
                ['Room Number', booking.room_number],
                ['Date Booked', new Date().toLocaleDateString()],
                ['Price', 'GHS500.00']
            ],
            theme: 'grid',
            styles: {
                fontSize: 10,
                cellPadding: 3
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 50 },
                1: { cellWidth: 130 }
            }
        });

        // Guardian details section
        doc.setFillColor(0, 77, 64);
        doc.rect(15, doc.lastAutoTable.finalY + 5, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('GUARDIAN DETAILS', 20, doc.lastAutoTable.finalY + 10);

        // Reset text color
        doc.setTextColor(0, 0, 0);

        // Guardian details table
        doc.autoTable({
            startY: doc.lastAutoTable.finalY + 15,
            body: [
                ['Guardian Name', booking.guardian_name],
                ['Relationship', booking.guardian_relationship],
                ['Phone Number', booking.guardian_phone]
            ],
            theme: 'grid',
            styles: {
                fontSize: 10,
                cellPadding: 3
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 50 },
                1: { cellWidth: 130 }
            }
        });

        // Start contractual agreement on new page (page 2)
        doc.addPage();
        addWatermark();

        // Add contractual agreement header
        doc.setFillColor(0, 77, 64);
        doc.rect(15, 20, 180, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('CONTRACTUAL AGREEMENT', 20, 25);

        // Reset text color
        doc.setTextColor(0, 0, 0);
        
        // Add rules with compact layout
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        let yPos = 35;

        const contractRules = [
            "1. Admission to hostel is offered for an academic year and is subject to renewal every academic year.",
            "2. Only full payment of fees would be made before students are admitted into residence.",
            "3. Full fees are not refundable after 24 hours of occupancy.",
            "4. Students are provided with contractual forms to be signed by both parties.",
            "5. Places offered are not transferable and not allowed for perching.",
            "6. Students are expected to quit their rooms one week after the end of the academic year."
        ];

        // Add contract rules with proper spacing
        contractRules.forEach((rule) => {
            doc.text(rule, 20, yPos, { maxWidth: 170 });
            yPos += 8;
        });

        // Add regulations header with proper spacing
        yPos += 5;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('REGULATIONS FOR THE HOSTEL', 105, yPos, { align: 'center' });

        // Add regulations with proper spacing
        yPos += 12;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        
        const regulations = [
            "1. Visitors are not allowed on hostel premises beyond 11pm.",
            "2. Residents leaving the hostel for lectures or church for more than forty-eight hours (48hrs) should keep the management informed.",
            "3. All students must leave their rooms tidy before leaving for vacation.",
            "4. Property left in residence without permission during vacations is liable to be disposed of.",
            "5. Damages to hostel properties will be charged against the offender.",
            "6. Smoking and alcoholic drinks are not permitted on hostel premises.",
            "7. Cooking is not permitted in rooms. Kitchen is provided for cooking.",
            "8. No candles are allowed. Students are entreated to use rechargeable lamps.",
            "9. Noise must be kept at acceptable levels so that other inmates are not unduly inconvenienced.",
            "10. All theft cases should be reported to management for appropriate actions.",
            "11. Students will be handed over to the appropriate authority for any illegal connection.",
            "12. Students who misbehave in this hostel would be blacklisted with all hostel operators.",
            "13. Students should be able to draw management's attention to lapses in the management.",
            "14. Students shall not bring and/or keep any pets in the premises.",
            "15. Various offences will attract varied sanctions including:",
            "     - Verbal reprimand",
            "     - Fines",
            "     - Expulsion or disciplinary action"
        ];

        regulations.forEach((regulation) => {
            doc.text(regulation, 20, yPos, { maxWidth: 170 });
            yPos += (regulation.length > 70) ? 10 : 8;
        });

        // Start signature section on new page (page 3)
        doc.addPage();
        addWatermark();

        // Add signature header
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('SIGNATURES', 105, 40, { align: 'center' });

        // Manager section with compact layout
        yPos = 60;
        doc.setFontSize(10);
        doc.text('Manager', 50, yPos);
        doc.text('Student', 150, yPos);

        doc.setFont('helvetica', 'normal');
        yPos += 12;
        doc.text('Name: _____________________', 50, yPos);
        doc.text('Name: _____________________', 150, yPos);

        yPos += 12;
        doc.text('Date: ' + new Date().toLocaleDateString(), 50, yPos);
        doc.text('Date: ' + new Date().toLocaleDateString(), 150, yPos);

        yPos += 12;
        doc.text('Signature: _________________', 50, yPos);
        doc.text('Signature: _________________', 150, yPos);

        // Add footer to all pages
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(9);
            doc.setTextColor(128, 128, 128);
            doc.text(
                `Page ${i} of ${pageCount}`,
                doc.internal.pageSize.width / 2,
                doc.internal.pageSize.height - 10,
                { align: 'center' }
            );
        }

        // Save the PDF
        doc.save(`wagyingo-booking-${bookingId}.pdf`);

    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate booking slip. Error: ' + error.message);
    }
}

// Function to show download restriction message
function showDownloadMessage() {
    alert('Your booking is pending approval. You will be able to download the booking slip once your booking has been approved.');
}

// Handle logout
logoutBtn.addEventListener('click', async () => {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });

        if (response.ok) {
            window.location.href = 'index.html';
        } else {
            const data = await response.json();
            throw new Error(data.error || 'Failed to logout');
        }
    } catch (error) {
        console.error('Error logging out:', error);
        alert('Failed to logout. Please try again.');
    }
});

function updatePaymentStatus(status) {
    const statusElement = document.getElementById('paymentStatus');
    statusElement.className = `payment-status ${status}`;
    statusElement.textContent = `Payment Status: ${status.charAt(0).toUpperCase() + status.slice(1)}`;
}

// Function to update receipt preview
function updateReceiptPreview(paymentData) {
    const receiptPreview = document.getElementById('receiptPreview');
    const receiptImage = document.getElementById('receiptImage');
    const receiptPdf = document.getElementById('receiptPdf');
    const paymentMethodDisplay = document.getElementById('paymentMethodDisplay');
    const uploadDateDisplay = document.getElementById('uploadDateDisplay');
    const paymentStatusDisplay = document.getElementById('paymentStatusDisplay');

    // If any required element is missing, return early
    if (!receiptPreview || !receiptImage || !receiptPdf || !paymentMethodDisplay || !uploadDateDisplay || !paymentStatusDisplay) {
        console.warn('Some receipt preview elements are missing from the DOM');
        return;
    }

    if (!paymentData || !paymentData.receipt_path) {
        receiptPreview.style.display = 'none';
        return;
    }

    receiptPreview.style.display = 'block';
    const receiptUrl = `/${paymentData.receipt_path}`;

    // Display receipt based on file type
    if (paymentData.receipt_path.match(/\.(jpg|jpeg|png)$/i)) {
        receiptImage.src = receiptUrl;
        receiptImage.style.display = 'block';
        receiptPdf.style.display = 'none';
    } else if (paymentData.receipt_path.match(/\.pdf$/i)) {
        receiptPdf.src = receiptUrl;
        receiptPdf.style.display = 'block';
        receiptImage.style.display = 'none';
    }

    // Update payment information
    paymentMethodDisplay.textContent = paymentData.payment_method === 'mobile_money' ? 'Mobile Money' : 'Bank Transfer';
    
    // Format the date properly
    let formattedDate = 'Date not available';
    if (paymentData.created_at) {
        let date;
        if (typeof paymentData.created_at === 'string') {
            date = new Date(paymentData.created_at);
            if (isNaN(date.getTime())) {
                const timestamp = parseInt(paymentData.created_at);
                if (!isNaN(timestamp)) {
                    date = new Date(timestamp);
                }
            }
        } else if (typeof paymentData.created_at === 'number') {
            date = new Date(paymentData.created_at);
        }

        if (date && !isNaN(date.getTime())) {
            formattedDate = date.toLocaleString('en-GB', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        }
    }
    
    uploadDateDisplay.textContent = formattedDate;

    // Create a prominent status display
    const statusText = paymentData.payment_status.charAt(0).toUpperCase() + paymentData.payment_status.slice(1);
    const statusClass = {
        'pending': 'warning',
        'paid': 'success',
        'rejected': 'danger'
    }[paymentData.payment_status] || 'warning';

    // Add prominent status banner at the top of the page
    const existingBanner = document.querySelector('.status-banner');
    if (existingBanner) {
        existingBanner.remove();
    }

    const statusBanner = document.createElement('div');
    statusBanner.className = `status-banner alert alert-${statusClass}`;
    statusBanner.style.cssText = `
        position: relative;
        padding: 1rem;
        margin-bottom: 1rem;
        border-radius: 8px;
        font-size: 1.1rem;
        font-weight: 600;
        text-align: center;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        animation: fadeInDown 0.5s ease-out;
    `;

    const icon = {
        'pending': 'clock',
        'paid': 'check-circle',
        'rejected': 'times-circle'
    }[paymentData.payment_status] || 'info-circle';

    statusBanner.innerHTML = `
        <i class="fas fa-${icon}" style="font-size: 1.2rem;"></i>
        <span>Payment Status: <strong>${statusText}</strong></span>
    `;

    // Insert the banner at the top of the receipt preview
    receiptPreview.insertBefore(statusBanner, receiptPreview.firstChild);

    // Update the regular status display as well
    paymentStatusDisplay.textContent = statusText;
    paymentStatusDisplay.className = `badge badge-${statusClass}`;
    paymentStatusDisplay.style.cssText = `
        font-size: 1rem;
        padding: 0.5rem 1rem;
        border-radius: 20px;
    `;

    // Add CSS animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInDown {
            from {
                opacity: 0;
                transform: translateY(-10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        .badge-warning {
            background-color: #ffc107;
            color: #000;
        }
        .badge-success {
            background-color: #28a745;
            color: #fff;
        }
        .badge-danger {
            background-color: #dc3545;
            color: #fff;
        }
        .alert-warning {
            background-color: #fff3cd;
            border-color: #ffeeba;
            color: #856404;
        }
        .alert-success {
            background-color: #d4edda;
            border-color: #c3e6cb;
            color: #155724;
        }
        .alert-danger {
            background-color: #f8d7da;
            border-color: #f5c6cb;
            color: #721c24;
        }
    `;
    document.head.appendChild(style);

    // Show appropriate notification based on payment status
    if (paymentData.payment_status === 'pending') {
        showNotification('Your receipt is pending review. Please wait for admin approval.', 'info');
    } else if (paymentData.payment_status === 'paid') {
        showNotification('Your payment has been approved! You can now access the residents portal.', 'success');
    } else if (paymentData.payment_status === 'rejected') {
        showNotification('Your receipt was rejected. Please upload a new one or contact support.', 'error');
    }

    // Add receipt action buttons with conditional rendering based on payment status and user role
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'receipt-actions';

    // Check if this is an admin view
    const urlParams = new URLSearchParams(window.location.search);
    const isAdminView = urlParams.has('id') || window.location.pathname.includes('admin-dashboard') || window.location.href.includes('admin');

    if (isAdminView) {
        // Admin view - always show both approve and reject payment buttons
        actionsDiv.innerHTML = `
            <div class="d-flex gap-2 mt-3">
                <button id="viewReceipt" class="btn btn-primary">
                    <i class="fas fa-eye"></i> View Receipt
                </button>
                <button id="approvePayment" class="btn btn-success" ${paymentData.payment_status === 'paid' ? '' : ''}>
                    <i class="fas fa-check"></i> Approve Payment
                </button>
                <button id="rejectPayment" class="btn btn-danger" ${paymentData.payment_status === 'rejected' ? '' : ''}>
                    <i class="fas fa-times"></i> Reject Payment
                </button>
            </div>
        `;
    } else {
        // User view - show receipt management buttons based on payment status
        actionsDiv.innerHTML = `
            <button id="viewReceipt" class="btn btn-primary">
                <i class="fas fa-eye"></i> View Receipt
            </button>
            ${paymentData.payment_status !== 'paid' ? `
                <button id="replaceReceipt" class="btn btn-secondary">
                    <i class="fas fa-sync"></i> Replace Receipt
                </button>
                <button id="deleteReceipt" class="btn btn-danger">
                    <i class="fas fa-trash"></i> Delete Receipt
                </button>
            ` : ''}
        `;
    }
    
    // Remove existing actions if any
    const existingActions = receiptPreview.querySelector('.receipt-actions');
    if (existingActions) {
        existingActions.remove();
    }
    
    receiptPreview.appendChild(actionsDiv);

    // Add event listeners for the buttons
    const viewReceiptBtn = document.getElementById('viewReceipt');
    if (viewReceiptBtn) {
        viewReceiptBtn.addEventListener('click', function() {
            window.open(receiptUrl, '_blank');
        });
    }

    if (isAdminView) {
        // Add admin payment status control listeners
        const approvePaymentBtn = document.getElementById('approvePayment');
        const rejectPaymentBtn = document.getElementById('rejectPayment');

        if (approvePaymentBtn) {
            approvePaymentBtn.addEventListener('click', async function() {
                try {
                    const response = await fetch(`/api/bookings/${currentBooking.id}/payment-status`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'paid' })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to approve payment');
                    }

                    showNotification('Payment approved successfully', 'success');
                    await loadBookingDetails();
                } catch (error) {
                    console.error('Error approving payment:', error);
                    showNotification('Failed to approve payment', 'error');
                }
            });
        }

        if (rejectPaymentBtn) {
            rejectPaymentBtn.addEventListener('click', async function() {
                try {
                    const response = await fetch(`/api/bookings/${currentBooking.id}/payment-status`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: 'rejected' })
                    });

                    if (!response.ok) {
                        throw new Error('Failed to reject payment');
                    }

                    showNotification('Payment rejected successfully', 'warning');
                    await loadBookingDetails();
                } catch (error) {
                    console.error('Error rejecting payment:', error);
                    showNotification('Failed to reject payment', 'error');
                }
            });
        }
    } else {
        // Add user receipt management listeners only if payment is not paid
        if (paymentData.payment_status !== 'paid') {
            const replaceReceiptBtn = document.getElementById('replaceReceipt');
            const deleteReceiptBtn = document.getElementById('deleteReceipt');

            if (replaceReceiptBtn) {
                replaceReceiptBtn.addEventListener('click', function() {
                    // Hide receipt preview
                    receiptPreview.style.display = 'none';
                    
                    // Show upload section
                    const paymentContent = document.getElementById('paymentContent');
                    if (paymentContent) {
                        paymentContent.innerHTML = getPaymentOptionsHTML();
                        addPaymentOptionListeners();
                        
                        // Set the selected payment method
                        const paymentOptions = document.querySelectorAll('.payment-option');
                        paymentOptions.forEach(option => {
                            if (option.dataset.method === paymentData.payment_method) {
                                option.classList.add('active');
                                document.querySelector(`.${paymentData.payment_method}-instructions`).style.display = 'block';
                                selectedPaymentMethod = paymentData.payment_method;
                                
                                // Enable file selection
                                const selectFileBtn = document.getElementById('selectFileBtn');
                                const receiptFile = document.getElementById('receiptFile');
                                if (selectFileBtn) selectFileBtn.disabled = false;
                                if (receiptFile) receiptFile.disabled = false;
                            }
                        });
                    }
                });
            }

            if (deleteReceiptBtn) {
                deleteReceiptBtn.addEventListener('click', async function() {
                    if (!currentBooking || !currentPayment) {
                        alert('No receipt found to delete');
                        return;
                    }

                    if (!confirm('Are you sure you want to delete this receipt? This action cannot be undone.')) {
                        return;
                    }

                    try {
                        const response = await fetch(`/api/bookings/${currentBooking.id}/delete-receipt`, {
                            method: 'DELETE',
                            credentials: 'include'
                        });

                        if (!response.ok) {
                            const errorData = await response.json().catch(() => null);
                            throw new Error(errorData?.error || `Failed to delete receipt: ${response.status} ${response.statusText}`);
                        }

                        // Reset receipt preview
                        if (receiptPreview) receiptPreview.style.display = 'none';
                        if (receiptImage) receiptImage.style.display = 'none';
                        if (receiptPdf) receiptPdf.style.display = 'none';

                        // Show upload section again
                        const paymentContent = document.getElementById('paymentContent');
                        if (paymentContent) {
                            paymentContent.innerHTML = getPaymentOptionsHTML();
                            addPaymentOptionListeners();
                        }

                        // Reset current payment
                        currentPayment = null;

                        // Reload booking details
                        await loadBookingDetails();

                        alert('Receipt deleted successfully');
                    } catch (error) {
                        console.error('Error deleting receipt:', error);
                        alert(`Failed to delete receipt: ${error.message}`);
                    }
                });
            }
        }
    }
}

// Function to load payment details
async function loadPaymentDetails(bookingId) {
    try {
        const response = await fetch(`/api/bookings/${bookingId}/payment-status`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch payment details');
        }
        
        const paymentData = await response.json();
        
        // Debug log to see what data we're getting from the server
        console.log('Payment data from server:', paymentData);
        
        // Don't modify the created_at field at all
        // The server should provide the correct timestamp
        currentPayment = paymentData;

        // Update the payment content section
        const paymentContent = document.getElementById('paymentContent');
        if (paymentContent) {
            if (paymentData && paymentData.receipt_path) {
                // If there's a receipt, show receipt preview
                paymentContent.innerHTML = `
                    <div id="receiptPreview">
                        <div class="receipt-preview">
                            <img id="receiptImage" style="display: none; max-width: 100%; max-height: 300px;">
                            <iframe id="receiptPdf" style="display: none; width: 100%; height: 300px;"></iframe>
                            <div class="receipt-info">
                                <p>Payment Method: <span id="paymentMethodDisplay"></span></p>
                                <p>Upload Date: <span id="uploadDateDisplay"></span></p>
                                <p>Status: <span id="paymentStatusDisplay" class="badge"></span></p>
                            </div>
                            <div class="receipt-actions">
                                <button id="viewReceipt" class="btn btn-primary">
                                    <i class="fas fa-eye"></i> View Receipt
                                </button>
                                <button id="replaceReceipt" class="btn btn-secondary">
                                    <i class="fas fa-sync"></i> Replace Receipt
                                </button>
                                <button id="deleteReceipt" class="btn btn-danger">
                                    <i class="fas fa-trash"></i> Delete Receipt
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                updateReceiptPreview(paymentData);
            } else {
                // If no receipt, show payment options
                paymentContent.innerHTML = getPaymentOptionsHTML();
                addPaymentOptionListeners();
            }
        }
        
        return paymentData;
    } catch (error) {
        console.error('Error loading payment details:', error);
        throw error;
    }
}

// Add the updateBookingStatus function
async function updateBookingStatus(bookingId, newStatus) {
    try {
        const response = await fetch(`/api/admin/bookings/${bookingId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });

        if (!response.ok) {
            throw new Error('Failed to update booking status');
        }

        const result = await response.json();
        
        // Update the booking status in the UI
        const statusBadge = document.querySelector('.booking-status');
        if (statusBadge) {
            statusBadge.textContent = newStatus.toUpperCase();
            statusBadge.className = `booking-status status-${newStatus.toLowerCase()}`;
        }

        // Update the room status in the UI
        const roomStatus = document.querySelector('.room-status');
        if (roomStatus) {
            let newRoomStatus = 'AVAILABLE';
            if (newStatus === 'approved') {
                newRoomStatus = 'OCCUPIED';
            } else if (newStatus === 'pending') {
                newRoomStatus = 'PENDING';
            }
            roomStatus.textContent = newRoomStatus;
            roomStatus.className = `room-status status-${newRoomStatus.toLowerCase()}`;
        }

        // Show success message
        showNotification('Booking status updated successfully', 'success');

        // Reload the booking details after a short delay
        setTimeout(() => {
            loadBookingDetails(bookingId);
        }, 1500);

    } catch (error) {
        console.error('Error updating booking status:', error);
        showNotification('Failed to update booking status', 'error');
    }
} 