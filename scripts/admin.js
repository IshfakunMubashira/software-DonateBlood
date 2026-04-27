// admin.js - Complete Firebase Integration for DonateLife Admin Panel
import { db, auth, storage, serverTimestamp, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, query, where, orderBy, limit, onSnapshot, writeBatch, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase-init.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

// Global variables
let currentUser = null;
let currentAdminRole = 'viewer';
let activeTab = 'dashboard';
let donorsUnsubscribe = null;
let publicRequestsUnsubscribe = null;
let bankRequestsUnsubscribe = null;
let inventoryUnsubscribe = null;
let eventsUnsubscribe = null;

// ==================== AUTHENTICATION ====================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const isAdmin = await checkAdminStatus(user.email);
        if (isAdmin) {
            showAdminContent();
            loadDashboardData();
            setupRealtimeListeners();
        } else {
            showError('You do not have admin privileges');
            signOut(auth);
            showLoginForm();
        }
    } else {
        showLoginForm();
    }
});

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
        errorElement.textContent = error.code === 'auth/invalid-credential' ? 'Invalid email or password' : 'Login failed. Try again.';
    }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
    await signOut(auth);
    window.location.reload();
});

async function checkAdminStatus(email) {
    try {
        const adminDoc = await getDoc(doc(db, 'admins', email));
        if (adminDoc.exists()) {
            currentAdminRole = adminDoc.data().role || 'viewer';
            document.getElementById('adminName').textContent = adminDoc.data().name || email;
            return true;
        } else {
            // Auto-create super admin for first login (demo convenience)
            if (email === 'admin@donatelife.org') {
                await setDoc(doc(db, 'admins', email), { name: 'Super Admin', role: 'super_admin', active: true, createdAt: serverTimestamp() });
                currentAdminRole = 'super_admin';
                document.getElementById('adminName').textContent = 'Super Admin';
                return true;
            }
        }
        return false;
    } catch (error) {
        console.error('Error checking admin status:', error);
        return false;
    }
}

// ==================== UI FUNCTIONS ====================
function showAdminContent() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('sidebar').style.display = 'block';
    document.querySelector('.main-content').style.display = 'block';
    document.getElementById('adminUser').style.display = 'flex';
    updateCurrentDate();
}

function showLoginForm() {
    document.getElementById('loginSection').style.display = 'flex';
    document.getElementById('sidebar').style.display = 'none';
    document.querySelector('.main-content').style.display = 'block';
    document.getElementById('adminUser').style.display = 'none';
}

function updateCurrentDate() {
    const dateElement = document.getElementById('currentDate');
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = new Date().toLocaleDateString(undefined, options);
}

function showError(message) {
    alert(message);
}

// ==================== TAB NAVIGATION ====================
document.querySelectorAll('.sidebar-menu li').forEach(item => {
    item.addEventListener('click', () => {
        const tabId = item.getAttribute('data-tab');
        if (tabId) switchTab(tabId);
    });
});
document.querySelectorAll('.view-all').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const tabId = link.getAttribute('data-tab');
        if (tabId) switchTab(tabId);
    });
});

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.sidebar-menu li').forEach(item => item.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelector(`.sidebar-menu li[data-tab="${tabId}"]`).classList.add('active');
    activeTab = tabId;
    if (tabId === 'donors') loadDonors();
    else if (tabId === 'requests') loadAllRequests();
    else if (tabId === 'inventory') loadInventory();
    else if (tabId === 'events') loadEvents();
    else if (tabId === 'admins') loadAdmins();
    else if (tabId === 'settings') loadSettings();
}

// ==================== DASHBOARD ====================
async function loadDashboardData() {
    try {
        const donorsSnap = await getDocs(collection(db, 'donors'));
        document.getElementById('totalDonors').textContent = donorsSnap.size;
        const publicPending = await getDocs(query(collection(db, 'public_requests'), where('status', '==', 'pending')));
        const bankPending = await getDocs(query(collection(db, 'bank_requests'), where('status', '==', 'pending')));
        const pendingTotal = publicPending.size + bankPending.size;
        document.getElementById('pendingRequests').textContent = pendingTotal;
        document.getElementById('requestsBadge').textContent = pendingTotal;
        const invSnap = await getDocs(collection(db, 'inventory'));
        let totalBags = 0; invSnap.forEach(d => totalBags += d.data().bags || 0);
        document.getElementById('totalBags').textContent = totalBags;
        const eventsSnap = await getDocs(query(collection(db, 'events'), where('status', '==', 'upcoming')));
        document.getElementById('upcomingEvents').textContent = eventsSnap.size;
        document.getElementById('donorsBadge').textContent = donorsSnap.size;
        loadRecentDonors();
        loadRecentRequests();
        loadInventoryBars();
    } catch (error) { console.error(error); }
}

async function loadRecentDonors() {
    const snap = await getDocs(query(collection(db, 'donors'), orderBy('createdAt', 'desc'), limit(5)));
    const container = document.getElementById('recentDonors');
    if (snap.empty) { container.innerHTML = '<p class="no-data">No recent donors</p>'; return; }
    let html = '';
    snap.forEach(doc => {
        const donor = doc.data();
        html += `<div class="recent-item"><div class="recent-info"><h4>${donor.name}</h4><p>${donor.bloodGroup} • ${donor.area}</p></div><span class="recent-badge ${donor.eligible ? 'eligible' : 'pending'}">${donor.eligible ? 'Eligible' : 'Ineligible'}</span></div>`;
    });
    container.innerHTML = html;
}

async function loadRecentRequests() {
    const publicSnap = await getDocs(query(collection(db, 'public_requests'), orderBy('createdAt', 'desc'), limit(3)));
    const bankSnap = await getDocs(query(collection(db, 'bank_requests'), orderBy('createdAt', 'desc'), limit(2)));
    const container = document.getElementById('recentRequests');
    let html = '';
    publicSnap.forEach(doc => {
        const req = doc.data();
        html += `<div class="recent-item"><div class="recent-info"><h4>${req.patientName}</h4><p>${req.bloodGroup} • ${req.bags} bags</p></div><span class="recent-badge ${req.status}">Public</span></div>`;
    });
    bankSnap.forEach(doc => {
        const req = doc.data();
        html += `<div class="recent-item"><div class="recent-info"><h4>${req.patientName}</h4><p>${req.bloodGroup} • ${req.bags} bags (Bank)</p></div><span class="recent-badge ${req.status}">Bank</span></div>`;
    });
    container.innerHTML = html || '<p class="no-data">No recent requests</p>';
}

async function loadInventoryBars() {
    const snap = await getDocs(collection(db, 'inventory'));
    const container = document.getElementById('inventoryBars');
    if (snap.empty) { container.innerHTML = '<p>No inventory</p>'; return; }
    let maxBags = 0; const inv = [];
    snap.forEach(doc => { const bags = doc.data().bags || 0; maxBags = Math.max(maxBags, bags); inv.push({ group: doc.id, bags }); });
    inv.sort((a,b) => ['O-','O+','A-','A+','B-','B+','AB-','AB+'].indexOf(a.group) - ['O-','O+','A-','A+','B-','B+','AB-','AB+'].indexOf(b.group));
    let html = '';
    inv.forEach(item => {
        const percent = maxBags > 0 ? (item.bags / maxBags) * 100 : 0;
        html += `<div class="inventory-bar-item"><span class="bar-label">${item.group}</span><div class="bar-container"><div class="bar-fill" style="width: ${percent}%">${percent > 15 ? item.bags + ' bags' : ''}</div></div><span class="bar-value">${item.bags}</span></div>`;
    });
    container.innerHTML = html;
}

// ==================== DONORS ====================
async function loadDonors() {
    try {
        const search = document.getElementById('donorSearch').value.toLowerCase();
        const bloodFilter = document.getElementById('donorBloodFilter').value;
        const eligibleFilter = document.getElementById('donorEligibleFilter').value;
        let q = query(collection(db, 'donors'), orderBy('createdAt', 'desc'));
        if (bloodFilter) q = query(q, where('bloodGroup', '==', bloodFilter));
        if (eligibleFilter !== '') q = query(q, where('eligible', '==', eligibleFilter === 'true'));
        const snap = await getDocs(q);
        const tbody = document.getElementById('donorsTableBody');
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="8" class="no-data">No donors found</td></tr>'; return; }
        let html = '';
        snap.forEach(doc => {
            const d = doc.data();
            if (search && !d.name?.toLowerCase().includes(search) && !d.phone?.includes(search) && !d.area?.toLowerCase().includes(search)) return;
            html += `<tr><td>${d.name}</td><td><strong>${d.bloodGroup}</strong></td><td>${d.age}/${d.gender}</td><td>${d.area}</td><td>${d.phone}<br><small>${d.email || ''}</small></td><td>${d.lastDonation ? new Date(d.lastDonation).toLocaleDateString() : 'Never'}</td><td><span class="eligible-badge ${d.eligible}">${d.eligible ? 'Eligible' : 'Ineligible'}</span></td><td><button class="action-btn edit" onclick="editDonor('${doc.id}')"><i class="fa-solid fa-edit"></i></button><button class="action-btn delete" onclick="deleteDonor('${doc.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="8">No matching donors</td></tr>';
    } catch (error) { console.error(error); document.getElementById('donorsTableBody').innerHTML = '<tr><td colspan="8">Error loading donors</td></tr>'; }
}

window.editDonor = async function(id) {
    const docSnap = await getDoc(doc(db, 'donors', id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById('editDonorId').value = id;
        document.getElementById('editDonorName').value = d.name || '';
        document.getElementById('editDonorBloodGroup').value = d.bloodGroup || '';
        document.getElementById('editDonorAge').value = d.age || '';
        document.getElementById('editDonorGender').value = d.gender || 'Male';
        document.getElementById('editDonorPhone').value = d.phone || '';
        document.getElementById('editDonorEmail').value = d.email || '';
        document.getElementById('editDonorArea').value = d.area || '';
        document.getElementById('editDonorDistrict').value = d.district || '';
        document.getElementById('editDonorLastDonation').value = d.lastDonation || '';
        document.getElementById('editDonorEligible').value = d.eligible ? 'true' : 'false';
        document.getElementById('donorEditModal').style.display = 'block';
    }
};

document.getElementById('donorEditForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editDonorId').value;
    const data = {
        name: document.getElementById('editDonorName').value,
        bloodGroup: document.getElementById('editDonorBloodGroup').value,
        age: parseInt(document.getElementById('editDonorAge').value) || null,
        gender: document.getElementById('editDonorGender').value,
        phone: document.getElementById('editDonorPhone').value,
        email: document.getElementById('editDonorEmail').value,
        area: document.getElementById('editDonorArea').value,
        district: document.getElementById('editDonorDistrict').value,
        lastDonation: document.getElementById('editDonorLastDonation').value || null,
        eligible: document.getElementById('editDonorEligible').value === 'true',
        updatedAt: serverTimestamp()
    };
    await updateDoc(doc(db, 'donors', id), data);
    closeDonorEditModal();
    loadDonors();
    showNotification('Donor updated', 'success');
});

window.deleteDonor = async function(id) {
    if (confirm('Delete this donor?')) {
        await deleteDoc(doc(db, 'donors', id));
        loadDonors();
        showNotification('Donor deleted', 'success');
    }
};

window.exportDonors = async function() {
    const snap = await getDocs(collection(db, 'donors'));
    const donors = []; snap.forEach(d => donors.push(d.data()));
    const headers = ['Name','Blood Group','Age','Gender','Phone','Email','Area','Eligible','Last Donation'];
    const rows = donors.map(d => [d.name, d.bloodGroup, d.age, d.gender, d.phone, d.email, d.area, d.eligible ? 'Yes' : 'No', d.lastDonation]);
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `donors_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href);
};

// ==================== REQUESTS (Combined) ====================
async function loadAllRequests() {
  try {
    const typeFilter = document.getElementById('requestTypeFilter').value;
    const statusFilter = document.getElementById('requestStatusFilter').value;
    const bloodFilter = document.getElementById('requestBloodFilter').value;

    let publicReqs = [], bankReqs = [];
    if (typeFilter === 'all' || typeFilter === 'public') {
      let q = query(collection(db, 'public_requests'), orderBy('createdAt', 'desc'));
      if (statusFilter) q = query(q, where('status', '==', statusFilter));
      if (bloodFilter) q = query(q, where('bloodGroup', '==', bloodFilter));
      const snap = await getDocs(q);
      snap.forEach(d => publicReqs.push({ id: d.id, type: 'public', ...d.data() }));
    }
    if (typeFilter === 'all' || typeFilter === 'bank') {
      let q = query(collection(db, 'bank_requests'), orderBy('createdAt', 'desc'));
      if (statusFilter) q = query(q, where('status', '==', statusFilter));
      if (bloodFilter) q = query(q, where('bloodGroup', '==', bloodFilter));
      const snap = await getDocs(q);
      snap.forEach(d => bankReqs.push({ id: d.id, type: 'bank', ...d.data() }));
    }
    const all = [...publicReqs, ...bankReqs].sort((a,b) => (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0));
    const tbody = document.getElementById('requestsTableBody');
    if (all.length === 0) { tbody.innerHTML = '<tr><td colspan="9">No requests found</td></tr>'; return; }
    let html = '';
    all.forEach(req => {
      const neededBy = req.neededBy ? new Date(req.neededBy).toLocaleDateString() : (req.neededByDate ? new Date(req.neededByDate).toLocaleDateString() : 'Urgent');
      const returnInfo = req.type === 'bank' ? `<br><small>Return: ${req.returnGroup}</small>` : '';
      html += `<tr>
        <td><span class="status-badge">${req.type === 'public' ? 'Public' : 'Bank'}${returnInfo}</span></td>
        <td>${req.patientName}</td>
        <td><strong>${req.bloodGroup}</strong></td>
        <td>${req.bags}</td>
        <td>${req.hospital || req.location}</td>
        <td>${req.phone}</td>
        <td>${neededBy}</td>
        <td><span class="status-badge ${req.status}">${req.status}</span></td>
        <td>
          <button class="action-btn approve" onclick="approveRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-check"></i></button>
          <button class="action-btn reject" onclick="rejectRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-times"></i></button>
          <button class="action-btn edit" onclick="editRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-edit"></i></button>
          <button class="action-btn delete" onclick="deleteRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>`;
    });
    tbody.innerHTML = html;
  } catch (error) { console.error(error); }
}

window.approveRequest = async function(id, type) {
    const collectionName = type === 'public' ? 'public_requests' : 'bank_requests';
    await updateDoc(doc(db, collectionName, id), { status: 'approved', updatedAt: serverTimestamp() });
    loadAllRequests();
    showNotification('Request approved', 'success');
};

window.rejectRequest = async function(id, type) {
    const collectionName = type === 'public' ? 'public_requests' : 'bank_requests';
    await updateDoc(doc(db, collectionName, id), { status: 'rejected', updatedAt: serverTimestamp() });
    loadAllRequests();
    showNotification('Request rejected', 'success');
};

window.editRequest = async function(id, type) {
    const docSnap = await getDoc(doc(db, type === 'public' ? 'public_requests' : 'bank_requests', id));
    if (docSnap.exists()) {
        const r = docSnap.data();
        document.getElementById('editRequestId').value = id;
        document.getElementById('editRequestType').value = type;
        document.getElementById('editRequestPatient').value = r.patientName;
        document.getElementById('editRequestBloodGroup').value = r.bloodGroup;
        document.getElementById('editRequestBags').value = r.bags;
        document.getElementById('editRequestHospital').value = r.hospital || r.location;
        document.getElementById('editRequestPhone').value = r.phone;
        document.getElementById('editRequestStatus').value = r.status;
        if (type === 'bank') {
            document.getElementById('returnGroupField').style.display = 'block';
            document.getElementById('editRequestReturnGroup').value = r.returnGroup || '';
        } else {
            document.getElementById('returnGroupField').style.display = 'none';
        }
        document.getElementById('requestEditModal').style.display = 'block';
    }
};

document.getElementById('requestEditForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editRequestId').value;
    const type = document.getElementById('editRequestType').value;
    const data = {
        patientName: document.getElementById('editRequestPatient').value,
        bloodGroup: document.getElementById('editRequestBloodGroup').value,
        bags: parseInt(document.getElementById('editRequestBags').value),
        hospital: document.getElementById('editRequestHospital').value,
        phone: document.getElementById('editRequestPhone').value,
        status: document.getElementById('editRequestStatus').value,
        updatedAt: serverTimestamp()
    };
    if (type === 'bank') data.returnGroup = document.getElementById('editRequestReturnGroup').value;
    await updateDoc(doc(db, type === 'public' ? 'public_requests' : 'bank_requests', id), data);
    closeRequestEditModal();
    loadAllRequests();
    showNotification('Request updated', 'success');
});

window.deleteRequest = async function(id, type) {
    if (confirm('Delete this request?')) {
        await deleteDoc(doc(db, type === 'public' ? 'public_requests' : 'bank_requests', id));
        loadAllRequests();
        showNotification('Request deleted', 'success');
    }
};

// ==================== INVENTORY ====================
async function loadInventory() {
    try {
        const snap = await getDocs(collection(db, 'inventory'));
        const grid = document.getElementById('inventoryGrid');
        if (snap.empty) { grid.innerHTML = '<p class="no-data">No inventory data</p>'; return; }
        let html = '';
        snap.forEach(doc => {
            const inv = doc.data();
            const lastUpdated = inv.lastUpdated ? new Date(inv.lastUpdated.toDate()).toLocaleString() : 'Never';
            html += `<div class="inventory-card"><h3>${doc.id}</h3><div class="bags">${inv.bags} bags</div><div class="last-updated"><i class="fa-regular fa-clock"></i> ${lastUpdated}</div><button class="action-btn edit" onclick="openInventoryModal('${doc.id}')"><i class="fa-solid fa-pen"></i> Update</button></div>`;
        });
        grid.innerHTML = html;
    } catch (error) { console.error(error); document.getElementById('inventoryGrid').innerHTML = '<p class="error">Error loading inventory</p>'; }
}

window.openInventoryModal = async function(bloodGroup = '') {
    if (bloodGroup) {
        const docSnap = await getDoc(doc(db, 'inventory', bloodGroup));
        if (docSnap.exists()) {
            document.getElementById('inventoryBloodGroup').value = bloodGroup;
            document.getElementById('inventoryBags').value = docSnap.data().bags || 0;
            document.getElementById('inventoryNotes').value = docSnap.data().notes || '';
        }
    } else {
        document.getElementById('inventoryForm').reset();
    }
    document.getElementById('inventoryModal').style.display = 'block';
};

document.getElementById('inventoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const group = document.getElementById('inventoryBloodGroup').value;
    const bags = parseInt(document.getElementById('inventoryBags').value);
    const notes = document.getElementById('inventoryNotes').value;
    await setDoc(doc(db, 'inventory', group), { group, bags, notes, lastUpdated: serverTimestamp() }, { merge: true });
    closeInventoryModal();
    loadInventory();
    loadInventoryBars();
    showNotification('Inventory updated', 'success');
});

// ==================== EVENTS ====================
async function loadEvents() {
    try {
        const snap = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
        const grid = document.getElementById('eventsGrid');
        if (snap.empty) { grid.innerHTML = '<p class="no-data">No events found</p>'; return; }
        let html = '';
        snap.forEach(doc => {
            const ev = doc.data();
            const firstImage = ev.images?.[0] || 'images/event-placeholder.jpg';
            html += `<div class="event-admin-card"><div class="event-images-preview"><img src="${firstImage}"></div><div class="event-admin-info"><h3>${ev.title}</h3><div class="event-meta"><i class="fa-regular fa-calendar"></i> ${ev.date} | ${ev.time}</div><p><i class="fa-solid fa-location-dot"></i> ${ev.location}</p><div class="event-admin-actions"><button class="action-btn edit" onclick="openEventModal('${doc.id}')"><i class="fa-solid fa-edit"></i> Edit</button><button class="action-btn delete" onclick="deleteEvent('${doc.id}')"><i class="fa-solid fa-trash"></i> Delete</button></div></div></div>`;
        });
        grid.innerHTML = html;
    } catch (error) { console.error(error); document.getElementById('eventsGrid').innerHTML = '<p class="error">Error loading events</p>'; }
}

window.openEventModal = async function(eventId = null) {
    if (eventId) {
        const docSnap = await getDoc(doc(db, 'events', eventId));
        if (docSnap.exists()) {
            const ev = docSnap.data();
            document.getElementById('eventTitle').value = ev.title || '';
            document.getElementById('eventDate').value = ev.date || '';
            document.getElementById('eventTime').value = ev.time || '';
            document.getElementById('eventLocation').value = ev.location || '';
            document.getElementById('eventDescription').value = ev.description || '';
            document.getElementById('eventForm').dataset.eventId = eventId;
            if (ev.images && ev.images.length) {
                let imagesHtml = '<p>Existing images:</p>';
                ev.images.forEach((url, idx) => {
                    imagesHtml += `<div class="existing-image-item"><img src="${url}" width="80"><span class="remove-image" onclick="removeEventImage('${eventId}', ${idx})">✖</span></div>`;
                });
                document.getElementById('existingImages').innerHTML = imagesHtml;
            } else {
                document.getElementById('existingImages').innerHTML = '';
            }
        }
    } else {
        document.getElementById('eventForm').reset();
        document.getElementById('eventForm').dataset.eventId = '';
        document.getElementById('existingImages').innerHTML = '';
    }
    document.getElementById('eventModal').style.display = 'block';
};

window.removeEventImage = async function(eventId, idx) {
    if (confirm('Remove this image?')) {
        const eventRef = doc(db, 'events', eventId);
        const eventSnap = await getDoc(eventRef);
        const images = eventSnap.data().images || [];
        const toDelete = images[idx];
        images.splice(idx, 1);
        await updateDoc(eventRef, { images });
        if (toDelete) {
            const storageRef = ref(storage, toDelete);
            try { await deleteObject(storageRef); } catch(e) { console.warn('Storage delete failed', e); }
        }
        openEventModal(eventId);
    }
};

document.getElementById('eventForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const eventId = e.target.dataset.eventId;
    const title = document.getElementById('eventTitle').value;
    const date = document.getElementById('eventDate').value;
    const time = document.getElementById('eventTime').value;
    const location = document.getElementById('eventLocation').value;
    const description = document.getElementById('eventDescription').value;
    const files = document.getElementById('eventImages').files;
    let imageUrls = [];
    if (files.length) {
        for (const file of files) {
            const storageRef = ref(storage, `events/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            imageUrls.push(url);
        }
    }
    const data = { title, date, time, location, description, updatedAt: serverTimestamp() };
    if (imageUrls.length) data.images = imageUrls;
    if (eventId) {
        await updateDoc(doc(db, 'events', eventId), data);
    } else {
        data.createdAt = serverTimestamp();
        data.status = 'upcoming';
        await addDoc(collection(db, 'events'), data);
    }
    closeEventModal();
    loadEvents();
    showNotification(`Event ${eventId ? 'updated' : 'created'} successfully`, 'success');
});

window.deleteEvent = async function(id) {
    if (confirm('Delete this event?')) {
        await deleteDoc(doc(db, 'events', id));
        loadEvents();
        showNotification('Event deleted', 'success');
    }
};

// ==================== ADMINS ====================
async function loadAdmins() {
    try {
        const snap = await getDocs(collection(db, 'admins'));
        const tbody = document.getElementById('adminsTableBody');
        if (snap.empty) { tbody.innerHTML = '<tr><td colspan="6">No admins found</td></tr>'; return; }
        let html = '';
        snap.forEach(doc => {
            const a = doc.data();
            html += `<tr><td>${a.name}</td><td>${doc.id}</td><td>${a.role}</td><td>${a.lastLogin ? new Date(a.lastLogin.toDate()).toLocaleString() : 'Never'}</td><td><span class="eligible-badge ${a.active}">${a.active ? 'Active' : 'Inactive'}</span></td><td><button class="action-btn delete" onclick="deleteAdmin('${doc.id}')"><i class="fa-solid fa-trash"></i></button></td></tr>`;
        });
        tbody.innerHTML = html;
    } catch (error) { console.error(error); document.getElementById('adminsTableBody').innerHTML = '<tr><td colspan="6">Error loading admins</td></tr>'; }
}

window.openAdminModal = () => { document.getElementById('adminModal').style.display = 'block'; };
document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('adminEmail').value;
    const name = document.getElementById('adminName').value;
    const role = document.getElementById('adminRole').value;
    await setDoc(doc(db, 'admins', email), { name, role, active: true, createdAt: serverTimestamp() });
    closeAdminModal();
    loadAdmins();
    showNotification('Admin added', 'success');
});
window.deleteAdmin = async (email) => {
    if (email === currentUser.email) { showNotification('Cannot delete yourself', 'error'); return; }
    if (confirm('Remove this admin?')) {
        await deleteDoc(doc(db, 'admins', email));
        loadAdmins();
        showNotification('Admin removed', 'success');
    }
};

// ==================== SETTINGS ====================
async function loadSettings() {
    try {
        const snap = await getDoc(doc(db, 'site_settings', 'general'));
        if (snap.exists()) {
            const s = snap.data();
            document.getElementById('siteName').value = s.siteName || 'DonateLife';
            document.getElementById('contactEmail').value = s.contactEmail || '';
            document.getElementById('contactPhone').value = s.contactPhone || '';
            document.getElementById('address').value = s.address || '';
            document.getElementById('facebookUrl').value = s.facebook || '#';
            document.getElementById('instagramUrl').value = s.instagram || '#';
            document.getElementById('twitterUrl').value = s.twitter || '#';
            document.getElementById('donorGuidelines').value = s.donorGuidelines || '';
            document.getElementById('recipientGuidelines').value = s.recipientGuidelines || '';
        }
    } catch (error) { console.error(error); }
}

document.getElementById('generalSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'site_settings', 'general'), {
        siteName: document.getElementById('siteName').value,
        contactEmail: document.getElementById('contactEmail').value,
        contactPhone: document.getElementById('contactPhone').value,
        address: document.getElementById('address').value,
        updatedAt: serverTimestamp()
    }, { merge: true });
    showNotification('General settings saved', 'success');
});

document.getElementById('socialSettingsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'site_settings', 'general'), {
        facebook: document.getElementById('facebookUrl').value,
        instagram: document.getElementById('instagramUrl').value,
        twitter: document.getElementById('twitterUrl').value,
        updatedAt: serverTimestamp()
    }, { merge: true });
    showNotification('Social links updated', 'success');
});

document.getElementById('guidelinesForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await setDoc(doc(db, 'site_settings', 'general'), {
        donorGuidelines: document.getElementById('donorGuidelines').value,
        recipientGuidelines: document.getElementById('recipientGuidelines').value,
        updatedAt: serverTimestamp()
    }, { merge: true });
    showNotification('Guidelines saved', 'success');
});

// ==================== REAL-TIME LISTENERS ====================
function setupRealtimeListeners() {
    donorsUnsubscribe = onSnapshot(collection(db, 'donors'), (snap) => {
        document.getElementById('donorsBadge').textContent = snap.size;
    });
    const updatePendingBadge = () => {
        Promise.all([
            getDocs(query(collection(db, 'public_requests'), where('status', '==', 'pending'))),
            getDocs(query(collection(db, 'bank_requests'), where('status', '==', 'pending')))
        ]).then(([pub, bank]) => {
            const total = pub.size + bank.size;
            document.getElementById('requestsBadge').textContent = total;
            document.getElementById('pendingRequests').textContent = total;
        }).catch(console.error);
    };
    onSnapshot(collection(db, 'public_requests'), updatePendingBadge);
    onSnapshot(collection(db, 'bank_requests'), updatePendingBadge);
}

// ==================== UTILITIES ====================
function debounce(func, wait) { let timeout; return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; }
function showNotification(message, type = 'info') {
    let notification = document.getElementById('notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.id = 'notification';
        document.body.appendChild(notification);
    }
    const colors = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: '#3498db' };
    notification.style.cssText = `position:fixed;top:80px;right:20px;padding:12px 20px;border-radius:4px;color:white;background:${colors[type] || colors.info};z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);`;
    notification.textContent = message;
    notification.style.display = 'block';
    setTimeout(() => notification.style.display = 'none', 3000);
}
window.closeDonorEditModal = () => document.getElementById('donorEditModal').style.display = 'none';
window.closeRequestEditModal = () => document.getElementById('requestEditModal').style.display = 'none';
window.closeInventoryModal = () => document.getElementById('inventoryModal').style.display = 'none';
window.closeEventModal = () => document.getElementById('eventModal').style.display = 'none';
window.closeAdminModal = () => document.getElementById('adminModal').style.display = 'none';

// Event listeners for filters
document.getElementById('donorSearch')?.addEventListener('input', debounce(loadDonors, 300));
document.getElementById('donorBloodFilter')?.addEventListener('change', loadDonors);
document.getElementById('donorEligibleFilter')?.addEventListener('change', loadDonors);
document.getElementById('requestTypeFilter')?.addEventListener('change', loadAllRequests);
document.getElementById('requestStatusFilter')?.addEventListener('change', loadAllRequests);
document.getElementById('requestBloodFilter')?.addEventListener('change', loadAllRequests);

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    // any extra init if needed
});





// Make functions global for inline onclick handlers
window.loadDonors = loadDonors;
window.loadAllRequests = loadAllRequests;
window.loadInventory = loadInventory;
window.loadEvents = loadEvents;
window.loadAdmins = loadAdmins;
window.loadSettings = loadSettings;
window.exportDonors = exportDonors;
window.openInventoryModal = openInventoryModal;
window.openEventModal = openEventModal;
window.deleteEvent = deleteEvent;
window.openAdminModal = openAdminModal;
window.closeDonorEditModal = closeDonorEditModal;
window.closeRequestEditModal = closeRequestEditModal;
window.closeInventoryModal = closeInventoryModal;
window.closeEventModal = closeEventModal;
window.closeAdminModal = closeAdminModal;