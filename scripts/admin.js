// admin.js - Complete Admin Panel with external image URLs for events
import { db, auth, storage, serverTimestamp, collection, addDoc, getDocs, getDoc, doc, updateDoc, deleteDoc, setDoc, query, orderBy, onSnapshot, ref, uploadBytes, getDownloadURL, deleteObject } from '../firebase-init.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';

// ------------------- Global Variables -------------------
let currentUser = null;
let currentAdminRole = 'viewer';
let activeTab = 'dashboard';
let allDonors = [];
let allPublicRequests = [];
let allBankRequests = [];

// ------------------- Helper Functions -------------------
function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value?.toDate === 'function') return value.toDate();
  if (value?.seconds !== undefined) return new Date(value.seconds * 1000);
  return null;
}

function formatDate(dateVal) {
  const d = toDate(dateVal);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateForInput(dateVal) {
  const d = toDate(dateVal);
  if (!d) return '';
  return d.toISOString().split('T')[0];
}

function showNotification(message, type = 'info') {
  let notification = document.getElementById('notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'notification';
    document.body.appendChild(notification);
  }
  const colors = { success: '#2ecc71', error: '#e74c3c', warning: '#f39c12', info: '#3498db' };
  notification.style.cssText = `position:fixed;top:80px;right:20px;padding:12px 20px;border-radius:4px;color:white;background:${colors[type] || colors.info};z-index:9999;box-shadow:0 2px 8px rgba(0,0,0,0.2);transition:0.3s;`;
  notification.textContent = message;
  notification.style.display = 'block';
  setTimeout(() => notification.style.opacity = '0', 2800);
  setTimeout(() => notification.style.display = 'none', 3000);
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

async function reduceInventory(bloodGroup, bags) {
  const invRef = doc(db, 'inventory', bloodGroup);
  const invSnap = await getDoc(invRef);
  if (!invSnap.exists()) {
    throw new Error(`No inventory record for ${bloodGroup}`);
  }
  const currentBags = invSnap.data().bags || 0;
  if (currentBags < bags) {
    throw new Error(`Insufficient inventory: only ${currentBags} bags available`);
  }
  await updateDoc(invRef, {
    bags: currentBags - bags,
    lastUpdated: serverTimestamp()
  });
}

// ------------------- Authentication -------------------
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    const isAdmin = await checkAdminStatus(user.email);
    if (isAdmin) {
      showAdminContent();
      await loadAllData();
      setupRealtimeBadges();
    } else {
      showNotification('You do not have admin privileges', 'error');
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

// ------------------- Load All Data Once (client-side filtering) -------------------
async function loadAllData() {
  try {
    const donorsSnap = await getDocs(collection(db, 'donors'));
    allDonors = donorsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    const pubSnap = await getDocs(collection(db, 'public_requests'));
    allPublicRequests = pubSnap.docs.map(doc => ({ id: doc.id, type: 'public', ...doc.data() }));

    const bankSnap = await getDocs(collection(db, 'bank_requests'));
    allBankRequests = bankSnap.docs.map(doc => ({ id: doc.id, type: 'bank', ...doc.data() }));

    updateDashboardUI();
    loadRecentDonors();
    loadRecentRequests();
    loadInventoryBars();

    if (activeTab === 'donors') applyDonorFilters();
    if (activeTab === 'requests') applyRequestFilters();
  } catch (error) {
    console.error('loadAllData error:', error);
    showNotification('Failed to load data. Check console.', 'error');
  }
}

function updateDashboardUI() {
  try {
    document.getElementById('totalDonors').textContent = allDonors.length;
    const pendingRequests = [...allPublicRequests, ...allBankRequests].filter(r => r.status === 'pending').length;
    document.getElementById('pendingRequests').textContent = pendingRequests;
    document.getElementById('requestsBadge').textContent = pendingRequests;
    updateTotalBags();
  } catch (error) { console.error(error); }
}

async function updateTotalBags() {
  try {
    const invSnap = await getDocs(collection(db, 'inventory'));
    let totalBags = 0;
    invSnap.forEach(d => totalBags += d.data().bags || 0);
    document.getElementById('totalBags').textContent = totalBags;
  } catch (error) { console.error(error); }
}

async function loadRecentDonors() {
  try {
    const recent = [...allDonors].sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0,5);
    const container = document.getElementById('recentDonors');
    if (recent.length === 0) { container.innerHTML = '<p class="no-data">No recent donors</p>'; return; }
    let html = '';
    recent.forEach(donor => {
      html += `<div class="recent-item"><div class="recent-info"><h4>${donor.name}</h4><p>${donor.bloodGroup} • ${donor.area}</p></div><span class="recent-badge ${donor.eligible ? 'eligible' : 'pending'}">${donor.eligible ? 'Eligible' : 'Ineligible'}</span></div>`;
    });
    container.innerHTML = html;
  } catch (error) { console.error(error); }
}

async function loadRecentRequests() {
  try {
    const allReqs = [...allPublicRequests, ...allBankRequests].sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)).slice(0,5);
    const container = document.getElementById('recentRequests');
    if (allReqs.length === 0) { container.innerHTML = '<p class="no-data">No recent requests</p>'; return; }
    let html = '';
    allReqs.forEach(req => {
      html += `<div class="recent-item"><div class="recent-info"><h4>${req.patientName}</h4><p>${req.bloodGroup} • ${req.bags} bags (${req.type})</p></div><span class="recent-badge ${req.status}">${req.status}</span></div>`;
    });
    container.innerHTML = html;
  } catch (error) { console.error(error); }
}

async function loadInventoryBars() {
  try {
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
  } catch (error) { console.error(error); }
}

// ------------------- UI Helpers -------------------
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

// ------------------- Tab Navigation -------------------
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
  if (tabId === 'donors') applyDonorFilters();
  else if (tabId === 'requests') applyRequestFilters();
  else if (tabId === 'inventory') loadInventory();
  else if (tabId === 'events') loadEvents();
  else if (tabId === 'admins') loadAdmins();
  else if (tabId === 'settings') loadSettings();
}

// ------------------- DONORS -------------------
function applyDonorFilters() {
  const search = document.getElementById('donorSearch').value.toLowerCase();
  const bloodFilter = document.getElementById('donorBloodFilter').value;
  const eligibleFilter = document.getElementById('donorEligibleFilter').value;
  let filtered = [...allDonors];
  if (bloodFilter) filtered = filtered.filter(d => d.bloodGroup === bloodFilter);
  if (eligibleFilter !== '') filtered = filtered.filter(d => d.eligible === (eligibleFilter === 'true'));
  if (search) {
    filtered = filtered.filter(d =>
      (d.name || '').toLowerCase().includes(search) ||
      (d.phone || '').includes(search) ||
      (d.area || '').toLowerCase().includes(search)
    );
  }
  const tbody = document.getElementById('donorsTableBody');
  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="no-data">No donors found</td></tr>';
    return;
  }
  let html = '';
  filtered.forEach(d => {
    html += `<tr>
      <td>${d.name}</td>
      <td><strong>${d.bloodGroup}</strong></td>
      <td>${d.age}/${d.gender}</td>
      <td>${d.area}</td>
      <td>${d.phone}<br><small>${d.email || ''}</small></td>
      <td>${d.lastDonation ? formatDate(d.lastDonation) : 'Never'}</td>
      <td><span class="eligible-badge ${d.eligible}">${d.eligible ? 'Eligible' : 'Ineligible'}</span></td>
      <td>
        <button class="action-btn edit" onclick="editDonor('${d.id}')"><i class="fa-solid fa-edit"></i></button>
        <button class="action-btn delete" onclick="deleteDonor('${d.id}')"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

async function refreshDonors() {
  const searchInput = document.getElementById('donorSearch');
  const bloodFilter = document.getElementById('donorBloodFilter');
  const eligibleFilter = document.getElementById('donorEligibleFilter');
  if (searchInput) searchInput.value = '';
  if (bloodFilter) bloodFilter.value = '';
  if (eligibleFilter) eligibleFilter.value = '';

  const tbody = document.getElementById('donorsTableBody');
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Refreshing...</td></tr>';
  try {
    const snap = await getDocs(collection(db, 'donors'));
    allDonors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    applyDonorFilters();
    showNotification('Donors refreshed & filters reset', 'success');
  } catch (error) {
    console.error(error);
    showNotification('Failed to refresh donors', 'error');
  }
}

window.editDonor = async function(id) {
  try {
    const docSnap = await getDoc(doc(db, 'donors', id));
    if (docSnap.exists()) {
      const d = docSnap.data();
      document.getElementById('editDonorId').value = id;
      document.getElementById('editDonorName').value = d.name || '';
      const bloodSelect = document.getElementById('editDonorBloodGroup');
      bloodSelect.innerHTML = ['A+','A-','B+','B-','O+','O-','AB+','AB-'].map(g => `<option ${g === d.bloodGroup ? 'selected' : ''}>${g}</option>`).join('');
      document.getElementById('editDonorAge').value = d.age || '';
      document.getElementById('editDonorGender').value = d.gender || 'Male';
      document.getElementById('editDonorPhone').value = d.phone || '';
      document.getElementById('editDonorEmail').value = d.email || '';
      document.getElementById('editDonorArea').value = d.area || '';
      document.getElementById('editDonorDistrict').value = d.district || '';
      document.getElementById('editDonorLastDonation').value = d.lastDonation ? formatDateForInput(d.lastDonation) : '';
      document.getElementById('editDonorEligible').value = d.eligible ? 'true' : 'false';
      document.getElementById('donorEditModal').style.display = 'block';
    }
  } catch (error) { showNotification('Error loading donor', 'error'); }
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
  try {
    await updateDoc(doc(db, 'donors', id), data);
    closeDonorEditModal();
    await refreshDonors();
    showNotification('Donor updated', 'success');
  } catch (error) { showNotification('Update failed', 'error'); }
});

window.deleteDonor = async function(id) {
  if (confirm('Delete this donor?')) {
    try {
      await deleteDoc(doc(db, 'donors', id));
      await refreshDonors();
      showNotification('Donor deleted', 'success');
    } catch (error) { showNotification('Delete failed', 'error'); }
  }
};

window.exportDonors = async function() {
  const csvRows = [['Name','Blood Group','Age','Gender','Phone','Email','Area','Eligible','Last Donation']];
  allDonors.forEach(d => {
    csvRows.push([d.name, d.bloodGroup, d.age, d.gender, d.phone, d.email, d.area, d.eligible ? 'Yes' : 'No', d.lastDonation || '']);
  });
  const csv = csvRows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(["\uFEFF" + csv], {type: 'text/csv;charset=utf-8;'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `donors_${new Date().toISOString().split('T')[0]}.csv`; a.click(); URL.revokeObjectURL(a.href);
};

// ------------------- REQUESTS -------------------
function applyRequestFilters() {
  const typeFilter = document.getElementById('requestTypeFilter').value;
  const statusFilter = document.getElementById('requestStatusFilter').value;
  const bloodFilter = document.getElementById('requestBloodFilter').value;
  let combined = [];
  if (typeFilter === 'all' || typeFilter === 'public') combined.push(...allPublicRequests);
  if (typeFilter === 'all' || typeFilter === 'bank') combined.push(...allBankRequests);
  if (statusFilter) combined = combined.filter(r => r.status === statusFilter);
  if (bloodFilter) combined = combined.filter(r => r.bloodGroup === bloodFilter);
  combined.sort((a,b) => (b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0));
  const tbody = document.getElementById('requestsTableBody');
  if (combined.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9">No requests found</td></tr>';
    return;
  }
  let html = '';
  combined.forEach(req => {
    const neededBy = req.neededBy ? formatDate(req.neededBy) : (req.neededByDate ? formatDate(req.neededByDate) : 'Urgent');
    const returnInfo = req.type === 'bank' ? `<br><small>Return: ${req.returnGroup}</small>` : '';
    let actions = '';
    if (req.type === 'bank') {
      actions = `
        <button class="action-btn approve" onclick="approveRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-check"></i></button>
        <button class="action-btn reject" onclick="rejectRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-times"></i></button>
        <button class="action-btn edit" onclick="editRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-edit"></i></button>
        <button class="action-btn delete" onclick="deleteRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-trash"></i></button>
      `;
    } else {
      actions = `
        <button class="action-btn edit" onclick="editRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-edit"></i></button>
        <button class="action-btn delete" onclick="deleteRequest('${req.id}', '${req.type}')"><i class="fa-solid fa-trash"></i></button>
      `;
    }
    html += `<tr>
      <td><span class="status-badge">${req.type === 'public' ? 'Public' : 'Bank'}${returnInfo}</span></td>
      <td>${req.patientName}</td>
      <td><strong>${req.bloodGroup}</strong></td>
      <td>${req.bags}</td>
      <td>${req.hospital || req.location}</td>
      <td>${req.phone}</td>
      <td>${neededBy}</td>
      <td><span class="status-badge ${req.status}">${req.status}</span></td>
      <td>${actions}</td>
    </tr>`;
  });
  tbody.innerHTML = html;
}

async function refreshRequests() {
  const typeFilter = document.getElementById('requestTypeFilter');
  const statusFilter = document.getElementById('requestStatusFilter');
  const bloodFilter = document.getElementById('requestBloodFilter');
  if (typeFilter) typeFilter.value = 'all';
  if (statusFilter) statusFilter.value = '';
  if (bloodFilter) bloodFilter.value = '';

  const tbody = document.getElementById('requestsTableBody');
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Refreshing...</td></tr>';
  try {
    const [pubSnap, bankSnap] = await Promise.all([
      getDocs(collection(db, 'public_requests')),
      getDocs(collection(db, 'bank_requests'))
    ]);
    allPublicRequests = pubSnap.docs.map(doc => ({ id: doc.id, type: 'public', ...doc.data() }));
    allBankRequests = bankSnap.docs.map(doc => ({ id: doc.id, type: 'bank', ...doc.data() }));
    applyRequestFilters();
    showNotification('Requests refreshed & filters reset', 'success');
  } catch (error) {
    console.error(error);
    showNotification('Failed to refresh requests', 'error');
  }
}

window.approveRequest = async function(id, type) {
  const collectionName = type === 'public' ? 'public_requests' : 'bank_requests';
  try {
    if (type === 'bank') {
      const reqSnap = await getDoc(doc(db, collectionName, id));
      if (!reqSnap.exists()) throw new Error('Request not found');
      const req = reqSnap.data();
      await reduceInventory(req.bloodGroup, req.bags);
    }
    await updateDoc(doc(db, collectionName, id), { status: 'approved', updatedAt: serverTimestamp() });
    await refreshRequests();
    showNotification('Request approved', 'success');
  } catch (error) {
    console.error(error);
    showNotification(error.message || 'Action failed', 'error');
  }
};

window.rejectRequest = async function(id, type) {
  const collectionName = type === 'public' ? 'public_requests' : 'bank_requests';
  try {
    await updateDoc(doc(db, collectionName, id), { status: 'rejected', updatedAt: serverTimestamp() });
    await refreshRequests();
    showNotification('Request rejected', 'success');
  } catch (error) { showNotification('Action failed', 'error'); }
};

window.editRequest = async function(id, type) {
  try {
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
  } catch (error) { showNotification('Error loading request', 'error'); }
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
  try {
    await updateDoc(doc(db, type === 'public' ? 'public_requests' : 'bank_requests', id), data);
    closeRequestEditModal();
    await refreshRequests();
    showNotification('Request updated', 'success');
  } catch (error) { showNotification('Update failed', 'error'); }
});

window.deleteRequest = async function(id, type) {
  if (confirm('Delete this request?')) {
    try {
      await deleteDoc(doc(db, type === 'public' ? 'public_requests' : 'bank_requests', id));
      await refreshRequests();
      showNotification('Request deleted', 'success');
    } catch (error) { showNotification('Delete failed', 'error'); }
  }
};

// ------------------- EXPIRE OLD REQUESTS -------------------
async function expireOldRequests() {
  try {
    const snap = await getDocs(collection(db, 'public_requests'));
    const now = new Date();
    let updated = 0;
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data.status === 'expired' || data.status === 'fulfilled') continue;
      if (data.neededBy) {
        let neededDate;
        if (data.neededBy.toDate) neededDate = data.neededBy.toDate();
        else neededDate = new Date(data.neededBy);
        if (neededDate < now) {
          await updateDoc(doc(db, 'public_requests', docSnap.id), { status: 'expired' });
          updated++;
        }
      }
    }
    showNotification(`Expired ${updated} request(s)`, 'success');
    refreshRequests();
  } catch (error) {
    console.error(error);
    showNotification('Failed to expire requests', 'error');
  }
}

// ------------------- INVENTORY -------------------
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

async function refreshInventory() {
  document.getElementById('inventoryGrid').innerHTML = '<div class="loading">Refreshing...</div>';
  await loadInventory();
  await loadInventoryBars();
  showNotification('Inventory refreshed', 'success');
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
    document.getElementById('inventoryBloodGroup').value = '';
  }
  document.getElementById('inventoryModal').style.display = 'block';
};

document.getElementById('inventoryForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const group = document.getElementById('inventoryBloodGroup').value;
  if (!group) { showNotification('Please select a blood group', 'error'); return; }
  const bags = parseInt(document.getElementById('inventoryBags').value);
  const notes = document.getElementById('inventoryNotes').value;
  try {
    await setDoc(doc(db, 'inventory', group), { group, bags, notes, lastUpdated: serverTimestamp() }, { merge: true });
    closeInventoryModal();
    await refreshInventory();
    showNotification('Inventory updated', 'success');
  } catch (error) { showNotification('Update failed', 'error'); }
});

// ------------------- EVENTS (with external URL support) -------------------
async function loadEvents() {
  try {
    const snap = await getDocs(query(collection(db, 'events'), orderBy('date', 'desc')));
    const grid = document.getElementById('eventsGrid');
    if (snap.empty) { grid.innerHTML = '<p class="no-data">No events found</p>'; return; }
    let html = '';
    snap.forEach(doc => {
      const ev = doc.data();
      const firstImage = (ev.images && ev.images.length > 0) ? ev.images[0] : 'https://via.placeholder.com/400x200?text=No+Image';
      html += `<div class="event-admin-card"><div class="event-images-preview"><img src="${firstImage}"></div><div class="event-admin-info"><h3>${ev.title}</h3><div class="event-meta"><i class="fa-regular fa-calendar"></i> ${ev.date} | ${ev.time}</div><p><i class="fa-solid fa-location-dot"></i> ${ev.location}</p><div class="event-admin-actions"><button class="action-btn edit" onclick="openEventModal('${doc.id}')"><i class="fa-solid fa-edit"></i> Edit</button><button class="action-btn delete" onclick="deleteEvent('${doc.id}')"><i class="fa-solid fa-trash"></i> Delete</button></div></div></div>`;
    });
    grid.innerHTML = html;
  } catch (error) { console.error(error); document.getElementById('eventsGrid').innerHTML = '<p class="error">Error loading events</p>'; }
}

async function refreshEvents() {
  document.getElementById('eventsGrid').innerHTML = '<div class="loading">Refreshing...</div>';
  await loadEvents();
  showNotification('Events refreshed', 'success');
}

window.openEventModal = async function(eventId = null) {
  // Reset form
  document.getElementById('eventTitle').value = '';
  document.getElementById('eventDate').value = '';
  document.getElementById('eventTime').value = '';
  document.getElementById('eventLocation').value = '';
  document.getElementById('eventDescription').value = '';
  document.getElementById('eventImages').value = '';
  document.getElementById('eventImageUrls').value = '';
  document.getElementById('existingImages').innerHTML = '';
  document.getElementById('eventForm').dataset.eventId = '';

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

      // Show existing images and detect external URLs
      if (ev.images && ev.images.length) {
        let imagesHtml = '<p>Existing images:</p>';
        let externalUrls = [];
        ev.images.forEach((url, idx) => {
          // Check if URL is from your Firebase Storage (contains "firebasestorage.googleapis.com")
          const isFirebaseStorage = url.includes('firebasestorage.googleapis.com');
          if (isFirebaseStorage) {
            imagesHtml += `<div class="existing-image-item"><img src="${url}" width="80"><span class="remove-image" onclick="removeEventImage('${eventId}', ${idx})">✖</span></div>`;
          } else {
            externalUrls.push(url);
          }
        });
        document.getElementById('existingImages').innerHTML = imagesHtml;
        if (externalUrls.length) {
          document.getElementById('eventImageUrls').value = externalUrls.join('\n');
        }
      }
    }
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
    if (toDelete && toDelete.includes('firebasestorage.googleapis.com')) {
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
  const urlText = document.getElementById('eventImageUrls').value;

  // Collect external URLs
  let externalUrls = [];
  if (urlText.trim()) {
    externalUrls = urlText.split('\n')
      .map(line => line.trim())
      .filter(line => line.startsWith('http'));
  }

  // Upload new files to Firebase Storage
  let uploadedUrls = [];
  if (files.length) {
    for (const file of files) {
      const storageRef = ref(storage, `events/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      uploadedUrls.push(url);
    }
  }

  // For existing event, we must preserve existing images that were not removed.
  // The existing images are shown in #existingImages but only those with remove button (Firebase URLs) can be removed.
  // External URLs are managed via textarea, so we will replace them completely.
  // The simplest approach: fetch the existing event's images, filter out the ones that were removed,
  // then merge with newly uploaded + external URLs.
  let finalImages = [...externalUrls, ...uploadedUrls];
  if (eventId) {
    const existingSnap = await getDoc(doc(db, 'events', eventId));
    if (existingSnap.exists()) {
      const oldImages = existingSnap.data().images || [];
      // Keep only Firebase Storage images that are still present (not removed)
      // Removed Firebase images have been deleted via removeEventImage, so we can fetch the current list from the doc again?
      // To keep it simple, we will rely on the fact that when we open the modal, we show existing images with remove buttons.
      // The remove buttons delete the image from storage AND update the Firestore array immediately (see removeEventImage).
      // So when we save, the Firestore already reflects the removal. Therefore we should NOT re-add old images.
      // However, external URLs are managed separately: they will be replaced by current textarea content.
      // Therefore we only add the new uploads and the external URLs.
      // No need to add old Firebase images because they are already in Firestore and not being modified.
      // For external URLs, we are replacing them entirely.
    }
  }

  const data = { title, date, time, location, description, updatedAt: serverTimestamp() };
  if (finalImages.length) data.images = finalImages;

  try {
    if (eventId) {
      // For update, we need to merge images? Actually replace images with the new set.
      // But we must preserve Firebase Storage images that were not removed (they are already in the document).
      // The user might have added new external URLs and new files, but not touched existing Firebase images.
      // The current logic: finalImages contains only external URLs + newly uploaded files.
      // This would erase existing Firebase images. To avoid that, we should:
      // - Get current images
      // - Keep those that are from Firebase Storage and not removed (but we don't know which were removed because removeEventImage already deleted from Firestore)
      // The easiest: when loading modal, we store the original image array. On save, we combine: original Firebase images that still exist + new uploads + external URLs.
      // But that's complex. Alternative: treat external URLs as additive, and allow removal of any image via separate UI.
      // Given the scope, I'll simplify: when editing, the textarea shows external URLs that were previously saved. The user can edit them.
      // Any image that was uploaded (Firebase) remains unless user clicks the X button (which deletes from Firestore and storage).
      // So after removal, the Firestore array no longer contains that URL. When saving, we must not re-add it.
      // Therefore we should fetch the current event's images (after any removals) and then add new uploads & external URLs.
      const currentEventSnap = await getDoc(doc(db, 'events', eventId));
      let currentImages = currentEventSnap.exists() ? (currentEventSnap.data().images || []) : [];
      // Remove any existing external URLs (since they will be replaced by textarea)
      currentImages = currentImages.filter(url => !url.startsWith('http') || url.includes('firebasestorage.googleapis.com'));
      // Merge with new external URLs and new uploads
      const merged = [...currentImages, ...uploadedUrls, ...externalUrls];
      data.images = merged;
    }
    if (eventId) {
      await updateDoc(doc(db, 'events', eventId), data);
    } else {
      data.createdAt = serverTimestamp();
      data.status = 'upcoming';
      await addDoc(collection(db, 'events'), data);
    }
    closeEventModal();
    await refreshEvents();
    showNotification(`Event ${eventId ? 'updated' : 'created'} successfully`, 'success');
  } catch (error) {
    console.error(error);
    showNotification('Operation failed: ' + error.message, 'error');
  }
});

window.deleteEvent = async function(id) {
  if (confirm('Delete this event?')) {
    try {
      await deleteDoc(doc(db, 'events', id));
      await refreshEvents();
      showNotification('Event deleted', 'success');
    } catch (error) { showNotification('Delete failed', 'error'); }
  }
};

// ------------------- ADMINS -------------------
async function loadAdmins() {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    const tbody = document.getElementById('adminsTableBody');
    if (snap.empty) { tbody.innerHTML = '<tr><td colspan="6">No admins found</td></tr>'; return; }
    let html = '';
    snap.forEach(doc => {
      const a = doc.data();
      html += `<tr>
        <td>${a.name}</td>
        <td>${doc.id}</td>
        <td>${a.role}</td>
        <td>${a.lastLogin ? new Date(a.lastLogin.toDate()).toLocaleString() : 'Never'}</td>
        <td><span class="eligible-badge ${a.active}">${a.active ? 'Active' : 'Inactive'}</span></td>
        <td><button class="action-btn delete" onclick="deleteAdmin('${doc.id}')"><i class="fa-solid fa-trash"></i></button></td>
      </tr>`;
    });
    tbody.innerHTML = html;
  } catch (error) { console.error(error); document.getElementById('adminsTableBody').innerHTML = '<tr><td colspan="6">Error loading admins</td></tr>'; }
}

async function refreshAdmins() {
  document.getElementById('adminsTableBody').innerHTML = '<tr><td colspan="6" class="loading">Refreshing...</td></tr>';
  await loadAdmins();
  showNotification('Admins refreshed', 'success');
}

window.openAdminModal = () => {
  document.getElementById('adminName').value = '';
  document.getElementById('adminEmail').value = '';
  document.getElementById('adminRole').value = 'editor';
  document.getElementById('adminModal').style.display = 'block';
};

document.getElementById('adminForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('adminName').value.trim();
  if (!name) { showNotification('Admin name is required', 'error'); return; }
  let email = document.getElementById('adminEmail').value.trim();
  if (!email) { showNotification('Email address is required', 'error'); return; }
  email = email.toLowerCase();
  if (!email.includes('@') || !email.includes('.')) {
    showNotification('Please enter a valid email address', 'error');
    return;
  }
  const role = document.getElementById('adminRole').value || 'editor';
  try {
    await setDoc(doc(db, 'admins', email), { name, role, active: true, createdAt: serverTimestamp() });
    closeAdminModal();
    await refreshAdmins();
    showNotification(`Admin ${name} added successfully`, 'success');
  } catch (error) {
    console.error(error);
    showNotification('Failed to add admin: ' + error.message, 'error');
  }
});

window.deleteAdmin = async (email) => {
  if (email === currentUser.email) { showNotification('Cannot delete yourself', 'error'); return; }
  if (confirm('Remove this admin?')) {
    try {
      await deleteDoc(doc(db, 'admins', email));
      await refreshAdmins();
      showNotification('Admin removed', 'success');
    } catch (error) { showNotification('Delete failed', 'error'); }
  }
};

// ------------------- SETTINGS (General & Social only) -------------------
async function loadSettings() {
  try {
    const generalSnap = await getDoc(doc(db, 'settings', 'general'));
    if (generalSnap.exists()) {
      const g = generalSnap.data();
      document.getElementById('contactPhone').value = g.phone || '';
      document.getElementById('contactEmail').value = g.email || '';
      document.getElementById('address').value = g.address || '';
    }
    const socialSnap = await getDoc(doc(db, 'settings', 'social'));
    if (socialSnap.exists()) {
      const s = socialSnap.data();
      document.getElementById('facebookUrl').value = s.facebook || '#';
      document.getElementById('instagramUrl').value = s.instagram || '#';
      document.getElementById('twitterUrl').value = s.twitter || '#';
    }
  } catch (error) { console.error(error); }
}

document.getElementById('generalSettingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await setDoc(doc(db, 'settings', 'general'), {
      phone: document.getElementById('contactPhone').value,
      email: document.getElementById('contactEmail').value,
      address: document.getElementById('address').value,
      updatedAt: serverTimestamp()
    }, { merge: true });
    showNotification('General settings saved', 'success');
  } catch (error) { showNotification('Save failed', 'error'); }
});

document.getElementById('socialSettingsForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await setDoc(doc(db, 'settings', 'social'), {
      facebook: document.getElementById('facebookUrl').value,
      instagram: document.getElementById('instagramUrl').value,
      twitter: document.getElementById('twitterUrl').value,
      updatedAt: serverTimestamp()
    }, { merge: true });
    showNotification('Social links updated', 'success');
  } catch (error) { showNotification('Save failed', 'error'); }
});

// ------------------- Real‑time Badges -------------------
function setupRealtimeBadges() {
  onSnapshot(collection(db, 'donors'), (snap) => {
    document.getElementById('donorsBadge').textContent = snap.size;
  });
  const updatePendingBadge = () => {
    Promise.all([
      getDocs(collection(db, 'public_requests')),
      getDocs(collection(db, 'bank_requests'))
    ]).then(([pub, bank]) => {
      let pending = 0;
      pub.forEach(d => { if (d.data().status === 'pending') pending++; });
      bank.forEach(d => { if (d.data().status === 'pending') pending++; });
      document.getElementById('requestsBadge').textContent = pending;
      document.getElementById('pendingRequests').textContent = pending;
    }).catch(console.error);
  };
  onSnapshot(collection(db, 'public_requests'), updatePendingBadge);
  onSnapshot(collection(db, 'bank_requests'), updatePendingBadge);
}

// ------------------- Modal Close Helpers -------------------
window.closeDonorEditModal = () => document.getElementById('donorEditModal').style.display = 'none';
window.closeRequestEditModal = () => document.getElementById('requestEditModal').style.display = 'none';
window.closeInventoryModal = () => document.getElementById('inventoryModal').style.display = 'none';
window.closeEventModal = () => document.getElementById('eventModal').style.display = 'none';
window.closeAdminModal = () => document.getElementById('adminModal').style.display = 'none';

// ------------------- Event Listeners for Filters -------------------
document.getElementById('donorSearch')?.addEventListener('input', debounce(applyDonorFilters, 300));
document.getElementById('donorBloodFilter')?.addEventListener('change', applyDonorFilters);
document.getElementById('donorEligibleFilter')?.addEventListener('change', applyDonorFilters);
document.getElementById('requestTypeFilter')?.addEventListener('change', applyRequestFilters);
document.getElementById('requestStatusFilter')?.addEventListener('change', applyRequestFilters);
document.getElementById('requestBloodFilter')?.addEventListener('change', applyRequestFilters);

// Make global functions available
window.refreshDonors = refreshDonors;
window.refreshRequests = refreshRequests;
window.refreshInventory = refreshInventory;
window.refreshEvents = refreshEvents;
window.refreshAdmins = refreshAdmins;
window.expireOldRequests = expireOldRequests;

// Close modals on outside click
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.style.display = 'none';
  }
};

window.applyDonorFilters = applyDonorFilters;
window.applyRequestFilters = applyRequestFilters;
window.loadInventory = loadInventory;
window.loadEvents = loadEvents;
window.loadAdmins = loadAdmins;
window.loadSettings = loadSettings;
window.exportDonors = exportDonors;
window.openInventoryModal = openInventoryModal;
window.openEventModal = openEventModal;
window.deleteEvent = deleteEvent;
window.openAdminModal = openAdminModal;