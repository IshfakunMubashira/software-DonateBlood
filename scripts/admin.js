// admin.js - Complete Firebase Integration for DonateLife Admin Panel

// ==================== FIREBASE CONFIGURATION ====================
// Replace this with your actual Firebase config from Firebase Console
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB4kQdzuZu-at1TtlN_db9HNTHre734mq0",
  authDomain: "donatelife-daf28.firebaseapp.com",
  projectId: "donatelife-daf28",
  storageBucket: "donatelife-daf28.firebasestorage.app",
  messagingSenderId: "544833489737",
  appId: "1:544833489737:web:4021902b192fe4bddce898",
  measurementId: "G-54ZVELBSGY"
};

// Initialize Firebase
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    getDoc, 
    doc, 
    updateDoc, 
    deleteDoc, 
    query, 
    where, 
    orderBy, 
    limit, 
    serverTimestamp,
    onSnapshot,
    writeBatch
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import {
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL,
    deleteObject
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';

// Initialize Firebase services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Make db available globally for other functions
window.db = db;

// ==================== GLOBAL VARIABLES ====================
let currentUser = null;
let currentAdminRole = 'viewer';
let activeTab = 'dashboard';
let donorsUnsubscribe = null;
let requestsUnsubscribe = null;
let inventoryUnsubscribe = null;
let eventsUnsubscribe = null;

// ==================== AUTHENTICATION ====================

// Check authentication state on page load
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('adminEmail').textContent = user.email;
        
        // Check if user is admin
        const isAdmin = await checkAdminStatus(user.email);
        if (isAdmin) {
            showAdminContent();
            loadDashboardData();
            setupRealtimeListeners();
        } else {
            // User is authenticated but not an admin
            showError('You do not have admin privileges');
            signOut(auth);
            showLoginForm();
        }
    } else {
        showLoginForm();
    }
});

// Login form handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const errorElement = document.getElementById('loginError');
    
    try {
        errorElement.textContent = '';
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error('Login error:', error);
        switch (error.code) {
            case 'auth/invalid-credential':
                errorElement.textContent = 'Invalid email or password';
                break;
            case 'auth/user-not-found':
                errorElement.textContent = 'No user found with this email';
                break;
            case 'auth/wrong-password':
                errorElement.textContent = 'Incorrect password';
                break;
            default:
                errorElement.textContent = 'Login failed. Please try again.';
        }
    }
});

// Logout button handler
document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.reload();
    } catch (error) {
        console.error('Logout error:', error);
    }
});

// Check if user email is in admins collection
async function checkAdminStatus(email) {
    try {
        const adminDoc = await getDoc(doc(db, 'admins', email));
        if (adminDoc.exists()) {
            currentAdminRole = adminDoc.data().role || 'viewer';
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// ==================== UI FUNCTIONS ====================

// Show admin content, hide login form
function showAdminContent() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('sidebar').style.display = 'block';
    document.querySelector('.main-content').style.display = 'block';
    document.getElementById('adminUser').style.display = 'flex';
    
    // Update date display
    updateCurrentDate();
}

// Show login form, hide admin content
function showLoginForm() {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
    document.getElementById('adminUser').style.display = 'none';
}

// Update current date in header
function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = new Date().toLocaleDateString(undefined, options);
}

// Show error message
function showError(message) {
    const errorElement = document.getElementById('loginError');
    if (errorElement) {
        errorElement.textContent = message;
    } else {
        alert(message);
    }
}

// ==================== TAB NAVIGATION ====================

// Sidebar tab click handlers
document.querySelectorAll('.sidebar-menu li').forEach(item => {
    item.addEventListener('click', () => {
        const tabId = item.getAttribute('data-tab');
        if (tabId) {
            switchTab(tabId);
        }
    });
});

// View all links in dashboard
document.querySelectorAll('.view-all').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab');
        if (tabId) {
            switchTab(tabId);
        }
    });
});

// Switch between tabs
function switchTab(tabId) {
    // Remove active class from all tabs and menu items
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.sidebar-menu li').forEach(item => {
        item.classList.remove('active');
    });
    
    // Add active class to selected tab and menu item
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.sidebar-menu li[data-tab="${tabId}"]`).classList.add('active');
    
    activeTab = tabId;
    
    // Load tab-specific data
    switch(tabId) {
        case 'donors':
            loadDonors();
            break;
        case 'requests':
            loadRequests();
            break;
        case 'inventory':
            loadInventory();
            break;
        case 'events':
            loadEvents();
            break;
        case 'admins':
            loadAdmins();
            break;
        case 'settings':
            loadSettings();
            break;
    }
}

// ==================== DASHBOARD FUNCTIONS ====================

// Load dashboard data
async function loadDashboardData() {
    try {
        // Get counts
        const donorsSnapshot = await getDocs(collection(db, 'donors'));
        document.getElementById('totalDonors').textContent = donorsSnapshot.size;
        
        const requestsQuery = query(
            collection(db, 'requests'), 
            where('status', '==', 'pending')
        );
        const requestsSnapshot = await getDocs(requestsQuery);
        document.getElementById('pendingRequests').textContent = requestsSnapshot.size;
        
        // Get total blood bags
        const inventorySnapshot = await getDocs(collection(db, 'inventory'));
        let totalBags = 0;
        inventorySnapshot.forEach(doc => {
            totalBags += doc.data().bags || 0;
        });
        document.getElementById('totalBags').textContent = totalBags;
        
        // Get upcoming events
        const eventsQuery = query(
            collection(db, 'events'),
            where('status', '==', 'upcoming'),
            orderBy('date', 'asc')
        );
        const eventsSnapshot = await getDocs(eventsQuery);
        document.getElementById('upcomingEvents').textContent = eventsSnapshot.size;
        
        // Update badges
        document.getElementById('donorsBadge').textContent = donorsSnapshot.size;
        document.getElementById('requestsBadge').textContent = requestsSnapshot.size;
        
        // Load recent donors
        loadRecentDonors();
        
        // Load recent requests
        loadRecentRequests();
        
        // Load inventory bars
        loadInventoryBars();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

// Load recent donors for dashboard
async function loadRecentDonors() {
    try {
        const donorsQuery = query(
            collection(db, 'donors'),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        
        const snapshot = await getDocs(donorsQuery);
        const container = document.getElementById('recentDonors');
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="no-data">No recent donors</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const donor = doc.data();
            html += `
                <div class="recent-item">
                    <div class="recent-info">
                        <h4>${donor.name || 'Unknown'}</h4>
                        <p>${donor.bloodGroup || 'N/A'} • ${donor.area || 'N/A'}</p>
                    </div>
                    <span class="recent-badge ${donor.eligible ? 'eligible' : 'pending'}">
                        ${donor.eligible ? 'Eligible' : 'Ineligible'}
                    </span>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading recent donors:', error);
        document.getElementById('recentDonors').innerHTML = '<p class="error">Error loading donors</p>';
    }
}

// Load recent requests for dashboard
async function loadRecentRequests() {
    try {
        const requestsQuery = query(
            collection(db, 'requests'),
            orderBy('createdAt', 'desc'),
            limit(5)
        );
        
        const snapshot = await getDocs(requestsQuery);
        const container = document.getElementById('recentRequests');
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="no-data">No recent requests</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const request = doc.data();
            html += `
                <div class="recent-item">
                    <div class="recent-info">
                        <h4>${request.patientName || 'Unknown'}</h4>
                        <p>${request.bloodGroup || 'N/A'} • ${request.bags || 0} bags</p>
                    </div>
                    <span class="recent-badge ${request.status || 'pending'}">
                        ${request.status || 'pending'}
                    </span>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading recent requests:', error);
        document.getElementById('recentRequests').innerHTML = '<p class="error">Error loading requests</p>';
    }
}

// Load inventory bars for dashboard
async function loadInventoryBars() {
    try {
        const snapshot = await getDocs(collection(db, 'inventory'));
        const container = document.getElementById('inventoryBars');
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="no-data">No inventory data</p>';
            return;
        }
        
        // Find max bags for scaling
        let maxBags = 0;
        const inventory = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            const bags = data.bags || 0;
            maxBags = Math.max(maxBags, bags);
            inventory.push({ group: doc.id, ...data });
        });
        
        // Sort by blood group
        const bloodOrder = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
        inventory.sort((a, b) => bloodOrder.indexOf(a.group) - bloodOrder.indexOf(b.group));
        
        let html = '';
        inventory.forEach(item => {
            const percentage = maxBags > 0 ? (item.bags / maxBags) * 100 : 0;
            html += `
                <div class="inventory-bar-item">
                    <span class="bar-label">${item.group}</span>
                    <div class="bar-container">
                        <div class="bar-fill" style="width: ${percentage}%">
                            ${percentage > 15 ? item.bags + ' bags' : ''}
                        </div>
                    </div>
                    <span class="bar-value">${item.bags}</span>
                </div>
            `;
        });
        
        container.innerHTML = html;
    } catch (error) {
        console.error('Error loading inventory bars:', error);
        document.getElementById('inventoryBars').innerHTML = '<p class="error">Error loading inventory</p>';
    }
}

// ==================== DONORS FUNCTIONS ====================

// Load donors with filters
async function loadDonors() {
    try {
        const searchInput = document.getElementById('donorSearch');
        const bloodFilter = document.getElementById('donorBloodFilter');
        const eligibleFilter = document.getElementById('donorEligibleFilter');
        
        let donorsQuery = query(collection(db, 'donors'), orderBy('createdAt', 'desc'));
        
        // Apply filters if they have values
        if (bloodFilter.value) {
            donorsQuery = query(donorsQuery, where('bloodGroup', '==', bloodFilter.value));
        }
        
        if (eligibleFilter.value) {
            donorsQuery = query(donorsQuery, where('eligible', '==', eligibleFilter.value === 'true'));
        }
        
        const snapshot = await getDocs(donorsQuery);
        const tbody = document.getElementById('donorsTableBody');
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No donors found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const donor = doc.data();
            const donorId = doc.id;
            
            // Apply search filter client-side for better UX
            if (searchInput.value) {
                const searchTerm = searchInput.value.toLowerCase();
                const name = (donor.name || '').toLowerCase();
                const phone = (donor.phone || '').toLowerCase();
                const area = (donor.area || '').toLowerCase();
                
                if (!name.includes(searchTerm) && !phone.includes(searchTerm) && !area.includes(searchTerm)) {
                    return;
                }
            }
            
            const lastDonation = donor.lastDonation ? new Date(donor.lastDonation).toLocaleDateString() : 'Never';
            const createdAt = donor.createdAt ? new Date(donor.createdAt.toDate()).toLocaleDateString() : 'Unknown';
            
            html += `
                <tr>
                    <td>${donor.name || 'Unknown'}</td>
                    <td><strong>${donor.bloodGroup || 'N/A'}</strong></td>
                    <td>${donor.age || '?'} / ${donor.gender || 'N/A'}</td>
                    <td>${donor.area || 'N/A'}</td>
                    <td>${donor.phone || 'N/A'}<br><small>${donor.email || ''}</small></td>
                    <td>${lastDonation}</td>
                    <td>
                        <span class="eligible-badge ${donor.eligible}">
                            ${donor.eligible ? 'Eligible' : 'Ineligible'}
                        </span>
                    </td>
                    <td>
                        <button class="action-btn view" onclick="viewDonor('${donorId}')">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="action-btn edit" onclick="editDonor('${donorId}')">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteDonor('${donorId}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html || '<tr><td colspan="8" class="no-data">No matching donors found</td></tr>';
        
    } catch (error) {
        console.error('Error loading donors:', error);
        document.getElementById('donorsTableBody').innerHTML = '<tr><td colspan="8" class="error">Error loading donors</td></tr>';
    }
}

// Add event listeners for donor filters
document.getElementById('donorSearch')?.addEventListener('input', debounce(loadDonors, 300));
document.getElementById('donorBloodFilter')?.addEventListener('change', loadDonors);
document.getElementById('donorEligibleFilter')?.addEventListener('change', loadDonors);

// View donor details
window.viewDonor = function(donorId) {
    // Implement donor details modal
    alert('View donor: ' + donorId);
};

// Edit donor
window.editDonor = async function(donorId) {
    try {
        const donorDoc = await getDoc(doc(db, 'donors', donorId));
        if (donorDoc.exists()) {
            const donor = donorDoc.data();
            // Open edit modal with donor data
            // You can implement a modal for editing donor details
            alert('Edit donor: ' + donorId + '\nThis would open an edit form with pre-filled data.');
        }
    } catch (error) {
        console.error('Error fetching donor:', error);
    }
};

// Delete donor
window.deleteDonor = async function(donorId) {
    if (confirm('Are you sure you want to delete this donor? This action cannot be undone.')) {
        try {
            await deleteDoc(doc(db, 'donors', donorId));
            loadDonors(); // Refresh the list
            showNotification('Donor deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting donor:', error);
            showNotification('Error deleting donor', 'error');
        }
    }
};

// Export donors to CSV
window.exportDonors = async function() {
    try {
        const snapshot = await getDocs(collection(db, 'donors'));
        const donors = [];
        snapshot.forEach(doc => donors.push({ id: doc.id, ...doc.data() }));
        
        // Convert to CSV
        const headers = ['Name', 'Blood Group', 'Age', 'Gender', 'Phone', 'Email', 'Area', 'Eligible', 'Last Donation'];
        const csvRows = [];
        csvRows.push(headers.join(','));
        
        donors.forEach(donor => {
            const row = [
                `"${donor.name || ''}"`,
                donor.bloodGroup || '',
                donor.age || '',
                donor.gender || '',
                donor.phone || '',
                donor.email || '',
                donor.area || '',
                donor.eligible ? 'Yes' : 'No',
                donor.lastDonation || ''
            ];
            csvRows.push(row.join(','));
        });
        
        const csvContent = csvRows.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `donors_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        console.error('Error exporting donors:', error);
        showNotification('Error exporting donors', 'error');
    }
};

// ==================== REQUESTS FUNCTIONS ====================

// Load requests with filters
async function loadRequests() {
    try {
        const statusFilter = document.getElementById('requestStatusFilter');
        const bloodFilter = document.getElementById('requestBloodFilter');
        
        let requestsQuery = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
        
        if (statusFilter.value) {
            requestsQuery = query(requestsQuery, where('status', '==', statusFilter.value));
        }
        
        if (bloodFilter.value) {
            requestsQuery = query(requestsQuery, where('bloodGroup', '==', bloodFilter.value));
        }
        
        const snapshot = await getDocs(requestsQuery);
        const tbody = document.getElementById('requestsTableBody');
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="8" class="no-data">No requests found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const request = doc.data();
            const requestId = doc.id;
            
            const neededBy = request.neededBy ? new Date(request.neededBy.toDate()).toLocaleDateString() : 'Urgent';
            const createdAt = request.createdAt ? new Date(request.createdAt.toDate()).toLocaleString() : 'Unknown';
            
            html += `
                <tr>
                    <td>${request.patientName || 'Unknown'}</td>
                    <td><strong>${request.bloodGroup || 'N/A'}</strong></td>
                    <td>${request.bags || 0}</td>
                    <td>${request.hospital || 'N/A'}</td>
                    <td>${request.phone || 'N/A'}</td>
                    <td>${neededBy}</td>
                    <td>
                        <span class="status-badge ${request.status || 'pending'}">
                            ${request.status || 'pending'}
                        </span>
                    </td>
                    <td>
                        <button class="action-btn view" onclick="viewRequest('${requestId}')">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                        <button class="action-btn approve" onclick="updateRequestStatus('${requestId}', 'approved')">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="action-btn edit" onclick="editRequest('${requestId}')">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteRequest('${requestId}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading requests:', error);
        document.getElementById('requestsTableBody').innerHTML = '<tr><td colspan="8" class="error">Error loading requests</td></tr>';
    }
}

// Add event listeners for request filters
document.getElementById('requestStatusFilter')?.addEventListener('change', loadRequests);
document.getElementById('requestBloodFilter')?.addEventListener('change', loadRequests);

// View request details
window.viewRequest = function(requestId) {
    alert('View request: ' + requestId);
};

// Update request status
window.updateRequestStatus = async function(requestId, status) {
    try {
        await updateDoc(doc(db, 'requests', requestId), {
            status: status,
            updatedAt: serverTimestamp()
        });
        loadRequests(); // Refresh the list
        showNotification(`Request ${status} successfully`, 'success');
    } catch (error) {
        console.error('Error updating request:', error);
        showNotification('Error updating request', 'error');
    }
};

// Edit request
window.editRequest = function(requestId) {
    alert('Edit request: ' + requestId);
};

// Delete request
window.deleteRequest = async function(requestId) {
    if (confirm('Are you sure you want to delete this request?')) {
        try {
            await deleteDoc(doc(db, 'requests', requestId));
            loadRequests();
            showNotification('Request deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting request:', error);
            showNotification('Error deleting request', 'error');
        }
    }
};

// ==================== INVENTORY FUNCTIONS ====================

// Load inventory
async function loadInventory() {
    try {
        const snapshot = await getDocs(collection(db, 'inventory'));
        const grid = document.getElementById('inventoryGrid');
        
        if (snapshot.empty) {
            grid.innerHTML = '<p class="no-data">No inventory data</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const inventory = doc.data();
            const lastUpdated = inventory.lastUpdated ? 
                new Date(inventory.lastUpdated.toDate()).toLocaleString() : 'Never';
            
            html += `
                <div class="inventory-card">
                    <h3>${doc.id}</h3>
                    <div class="bags">${inventory.bags || 0} bags</div>
                    <div class="last-updated">
                        <i class="fa-regular fa-clock"></i> ${lastUpdated}
                    </div>
                    <div class="inventory-actions">
                        <button class="action-btn edit" onclick="openInventoryModal('${doc.id}')">
                            <i class="fa-solid fa-pen"></i> Update
                        </button>
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading inventory:', error);
        document.getElementById('inventoryGrid').innerHTML = '<p class="error">Error loading inventory</p>';
    }
}

// Open inventory modal
window.openInventoryModal = function(bloodGroup = '') {
    const modal = document.getElementById('inventoryModal');
    if (bloodGroup) {
        document.getElementById('inventoryBloodGroup').value = bloodGroup;
        // Load current bags count
        getDoc(doc(db, 'inventory', bloodGroup)).then(doc => {
            if (doc.exists()) {
                document.getElementById('inventoryBags').value = doc.data().bags || 0;
                document.getElementById('inventoryNotes').value = doc.data().notes || '';
            }
        });
    } else {
        document.getElementById('inventoryForm').reset();
    }
    modal.style.display = 'block';
};

// Close inventory modal
window.closeInventoryModal = function() {
    document.getElementById('inventoryModal').style.display = 'none';
};

// Inventory form submit
document.getElementById('inventoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const bloodGroup = document.getElementById('inventoryBloodGroup').value;
    const bags = parseInt(document.getElementById('inventoryBags').value);
    const notes = document.getElementById('inventoryNotes').value;
    
    try {
        const inventoryRef = doc(db, 'inventory', bloodGroup);
        await setDoc(inventoryRef, {
            group: bloodGroup,
            bags: bags,
            notes: notes,
            lastUpdated: serverTimestamp()
        }, { merge: true });
        
        closeInventoryModal();
        loadInventory();
        loadInventoryBars(); // Update dashboard
        showNotification('Inventory updated successfully', 'success');
    } catch (error) {
        console.error('Error updating inventory:', error);
        showNotification('Error updating inventory', 'error');
    }
});

// ==================== EVENTS FUNCTIONS ====================

// Load events
async function loadEvents() {
    try {
        const eventsQuery = query(collection(db, 'events'), orderBy('date', 'desc'));
        const snapshot = await getDocs(eventsQuery);
        const grid = document.getElementById('eventsGrid');
        
        if (snapshot.empty) {
            grid.innerHTML = '<p class="no-data">No events found</p>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const event = doc.data();
            const eventId = doc.id;
            
            const eventDate = event.date ? new Date(event.date).toLocaleDateString() : 'TBD';
            const firstImage = event.images && event.images.length > 0 ? event.images[0] : 'images/event-placeholder.jpg';
            
            html += `
                <div class="event-admin-card">
                    <div class="event-images-preview">
                        <img src="${firstImage}" alt="${event.title}">
                    </div>
                    <div class="event-admin-info">
                        <h3>${event.title || 'Untitled Event'}</h3>
                        <div class="event-meta">
                            <span><i class="fa-regular fa-calendar"></i> ${eventDate}</span>
                            <span><i class="fa-regular fa-clock"></i> ${event.time || 'N/A'}</span>
                        </div>
                        <div class="event-meta">
                            <span><i class="fa-solid fa-location-dot"></i> ${event.location || 'N/A'}</span>
                        </div>
                        <p class="event-description">${(event.description || '').substring(0, 100)}...</p>
                        <div class="event-admin-actions">
                            <button class="action-btn view" onclick="viewEvent('${eventId}')">
                                <i class="fa-solid fa-eye"></i> View
                            </button>
                            <button class="action-btn edit" onclick="openEventModal('${eventId}')">
                                <i class="fa-solid fa-edit"></i> Edit
                            </button>
                            <button class="action-btn delete" onclick="deleteEvent('${eventId}')">
                                <i class="fa-solid fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        grid.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading events:', error);
        document.getElementById('eventsGrid').innerHTML = '<p class="error">Error loading events</p>';
    }
}

// Open event modal for add/edit
window.openEventModal = async function(eventId = null) {
    const modal = document.getElementById('eventModal');
    const form = document.getElementById('eventForm');
    form.reset();
    
    if (eventId) {
        // Load event data for editing
        try {
            const eventDoc = await getDoc(doc(db, 'events', eventId));
            if (eventDoc.exists()) {
                const event = eventDoc.data();
                document.getElementById('eventTitle').value = event.title || '';
                document.getElementById('eventDate').value = event.date || '';
                document.getElementById('eventTime').value = event.time || '';
                document.getElementById('eventLocation').value = event.location || '';
                document.getElementById('eventDescription').value = event.description || '';
                
                // Store eventId in form for update
                form.dataset.eventId = eventId;
                
                // Show existing images
                if (event.images && event.images.length > 0) {
                    const existingImagesDiv = document.getElementById('existingImages');
                    let imagesHtml = '<p>Existing images:</p>';
                    event.images.forEach((imageUrl, index) => {
                        imagesHtml += `
                            <div class="existing-image-item">
                                <img src="${imageUrl}" alt="Event image ${index + 1}">
                                <span class="remove-image" onclick="removeEventImage('${eventId}', ${index})">
                                    <i class="fa-solid fa-times"></i>
                                </span>
                            </div>
                        `;
                    });
                    existingImagesDiv.innerHTML = imagesHtml;
                }
            }
        } catch (error) {
            console.error('Error loading event:', error);
        }
    } else {
        form.dataset.eventId = '';
        document.getElementById('existingImages').innerHTML = '';
    }
    
    modal.style.display = 'block';
};

// Close event modal
window.closeEventModal = function() {
    document.getElementById('eventModal').style.display = 'none';
    document.getElementById('eventForm').reset();
    document.getElementById('existingImages').innerHTML = '';
};

// Event form submit
document.getElementById('eventForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const eventId = e.target.dataset.eventId;
    const title = document.getElementById('eventTitle').value;
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const location = document.getElementById('eventLocation').value;
    const description = document.getElementById('eventDescription').value;
    const imageFiles = document.getElementById('eventImages').files;
    
    try {
        let imageUrls = [];
        
        // Upload new images if any
        if (imageFiles.length > 0) {
            for (let i = 0; i < imageFiles.length; i++) {
                const file = imageFiles[i];
                const storageRef = ref(storage, `events/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                const url = await getDownloadURL(storageRef);
                imageUrls.push(url);
            }
        }
        
        const eventData = {
            title,
            date,
            time,
            location,
            description,
            updatedAt: serverTimestamp()
        };
        
        // Add images if uploaded
        if (imageUrls.length > 0) {
            eventData.images = imageUrls;
        }
        
        if (eventId) {
            // Update existing event
            await updateDoc(doc(db, 'events', eventId), eventData);
        } else {
            // Create new event
            eventData.createdAt = serverTimestamp();
            eventData.status = 'upcoming';
            await addDoc(collection(db, 'events'), eventData);
        }
        
        closeEventModal();
        loadEvents();
        showNotification(`Event ${eventId ? 'updated' : 'created'} successfully`, 'success');
    } catch (error) {
        console.error('Error saving event:', error);
        showNotification('Error saving event', 'error');
    }
});

// View event
window.viewEvent = function(eventId) {
    alert('View event: ' + eventId);
};

// Delete event
window.deleteEvent = async function(eventId) {
    if (confirm('Are you sure you want to delete this event?')) {
        try {
            await deleteDoc(doc(db, 'events', eventId));
            loadEvents();
            showNotification('Event deleted successfully', 'success');
        } catch (error) {
            console.error('Error deleting event:', error);
            showNotification('Error deleting event', 'error');
        }
    }
};

// Remove event image (placeholder - implement actual removal)
window.removeEventImage = function(eventId, imageIndex) {
    if (confirm('Remove this image?')) {
        alert(`Remove image ${imageIndex} from event ${eventId}`);
        // Implement actual removal logic
    }
};

// ==================== ADMINS FUNCTIONS ====================

// Load admins
async function loadAdmins() {
    try {
        const snapshot = await getDocs(collection(db, 'admins'));
        const tbody = document.getElementById('adminsTableBody');
        
        if (snapshot.empty) {
            tbody.innerHTML = '<tr><td colspan="6" class="no-data">No admins found</td></tr>';
            return;
        }
        
        let html = '';
        snapshot.forEach(doc => {
            const admin = doc.data();
            
            html += `
                <tr>
                    <td>${admin.name || 'N/A'}</td>
                    <td>${doc.id}</td>
                    <td><span class="status-badge ${admin.role || 'viewer'}">${admin.role || 'viewer'}</span></td>
                    <td>${admin.lastLogin ? new Date(admin.lastLogin.toDate()).toLocaleString() : 'Never'}</td>
                    <td>
                        <span class="eligible-badge ${admin.active}">
                            ${admin.active ? 'Active' : 'Inactive'}
                        </span>
                    </td>
                    <td>
                        <button class="action-btn edit" onclick="editAdmin('${doc.id}')">
                            <i class="fa-solid fa-edit"></i>
                        </button>
                        <button class="action-btn delete" onclick="deleteAdmin('${doc.id}')">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        
        tbody.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading admins:', error);
        document.getElementById('adminsTableBody').innerHTML = '<tr><td colspan="6" class="error">Error loading admins</td></tr>';
    }
}

// Open admin modal
window.openAdminModal = function() {
    document.getElementById('adminModal').style.display = 'block';
};

// Close admin modal
window.closeAdminModal = function() {
    document.getElementById('adminModal').style.display = 'none';
    document.getElementById('adminForm').reset();
};

// Admin form submit
document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('adminEmail').value;
    const name = document.getElementById('adminName').value;
    const role = document.getElementById('adminRole').value;
    
    try {
        await setDoc(doc(db, 'admins', email), {
            name,
            role,
            active: true,
            createdAt: serverTimestamp()
        });
        
        closeAdminModal();
        loadAdmins();
        showNotification('Admin added successfully', 'success');
    } catch (error) {
        console.error('Error adding admin:', error);
        showNotification('Error adding admin', 'error');
    }
});

// Edit admin
window.editAdmin = function(adminEmail) {
    alert('Edit admin: ' + adminEmail);
};

// Delete admin
window.deleteAdmin = async function(adminEmail) {
    if (adminEmail === currentUser.email) {
        showNotification('You cannot delete your own admin account', 'error');
        return;
    }
    
    if (confirm('Are you sure you want to remove this admin?')) {
        try {
            await deleteDoc(doc(db, 'admins', adminEmail));
            loadAdmins();
            showNotification('Admin removed successfully', 'success');
        } catch (error) {
            console.error('Error deleting admin:', error);
            showNotification('Error removing admin', 'error');
        }
    }
};

// ==================== SETTINGS FUNCTIONS ====================

// Load settings
async function loadSettings() {
    try {
        const settingsDoc = await getDoc(doc(db, 'site_settings', 'general'));
        if (settingsDoc.exists()) {
            const settings = settingsDoc.data();
            document.getElementById('siteName').value = settings.siteName || 'DonateLife';
            document.getElementById('contactEmail').value = settings.contactEmail || '';
            document.getElementById('contactPhone').value = settings.contactPhone || '';
            document.getElementById('address').value = settings.address || '';
            document.getElementById('facebookUrl').value = settings.facebook || '#';
            document.getElementById('instagramUrl').value = settings.instagram || '#';
            document.getElementById('twitterUrl').value = settings.twitter || '#';
            document.getElementById('donorGuidelines').value = settings.donorGuidelines || '';
            document.getElementById('recipientGuidelines').value = settings.recipientGuidelines || '';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// General settings form
document.getElementById('generalSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        siteName: document.getElementById('siteName').value,
        contactEmail: document.getElementById('contactEmail').value,
        contactPhone: document.getElementById('contactPhone').value,
        address: document.getElementById('address').value,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email
    };
    
    try {
        await setDoc(doc(db, 'site_settings', 'general'), settings, { merge: true });
        showNotification('Settings saved successfully', 'success');
    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification('Error saving settings', 'error');
    }
});

// Social settings form
document.getElementById('socialSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        facebook: document.getElementById('facebookUrl').value,
        instagram: document.getElementById('instagramUrl').value,
        twitter: document.getElementById('twitterUrl').value,
        updatedAt: serverTimestamp()
    };
    
    try {
        await setDoc(doc(db, 'site_settings', 'general'), settings, { merge: true });
        showNotification('Social links updated successfully', 'success');
    } catch (error) {
        console.error('Error saving social links:', error);
        showNotification('Error updating social links', 'error');
    }
});

// Guidelines form
document.getElementById('guidelinesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const settings = {
        donorGuidelines: document.getElementById('donorGuidelines').value,
        recipientGuidelines: document.getElementById('recipientGuidelines').value,
        updatedAt: serverTimestamp()
    };
    
    try {
        await setDoc(doc(db, 'site_settings', 'general'), settings, { merge: true });
        showNotification('Guidelines updated successfully', 'success');
    } catch (error) {
        console.error('Error saving guidelines:', error);
        showNotification('Error updating guidelines', 'error');
    }
});

// ==================== REAL-TIME UPDATES ====================

// Set up real-time listeners for badges
function setupRealtimeListeners() {
    // Listen for donor count changes
    donorsUnsubscribe = onSnapshot(collection(db, 'donors'), (snapshot) => {
        document.getElementById('donorsBadge').textContent = snapshot.size;
    });
    
    // Listen for pending requests count changes
    const pendingQuery = query(collection(db, 'requests'), where('status', '==', 'pending'));
    requestsUnsubscribe = onSnapshot(pendingQuery, (snapshot) => {
        document.getElementById('requestsBadge').textContent = snapshot.size;
    });
}

// ==================== UTILITY FUNCTIONS ====================

// Debounce function for search inputs
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification element if it doesn't exist
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        notification.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            padding: 15px 25px;
            border-radius: 4px;
            color: white;
            font-weight: bold;
            z-index: 9999;
            animation: slideIn 0.3s ease;
            box-shadow: 0 3px 10px rgba(0,0,0,0.2);
        `;
        document.body.appendChild(notification);
    }
    
    // Set color based on type
    const colors = {
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    notification.style.backgroundColor = colors[type] || colors.info;
    notification.textContent = message;
    notification.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Add animation style if not exists
if (!document.getElementById('notificationStyles')) {
    const style = document.createElement('style');
    style.id = 'notificationStyles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// ==================== INITIALIZATION ====================

// Initialize the page
document.addEventListener('DOMContentLoaded', () => {
    // Add keyboard shortcut for refresh (Ctrl+R)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            location.reload();
        }
    });
});