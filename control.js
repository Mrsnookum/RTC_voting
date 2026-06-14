/* =========================================
   ADMIN CONTROL PANEL LOGIC (RTC COMMISSION)
   ========================================= */

// ⚠️ REPLACE THIS WITH YOUR LIVE APPS SCRIPT URL ⚠️
const GAS_URL = "https://script.google.com/macros/s/AKfycbxuWWpyqSNzr631wjPWdKX-V6WP24qtIwZ1P5IEdgMJ75gZYrfb-PPAJTr5rPSz_oQ/exec";

let adminSecretKey = sessionStorage.getItem('rtc_admin_secret') || null;
let commissionCandidates = [];

// === AUTHENTICATION LOGIC ===
document.addEventListener('DOMContentLoaded', () => {
    if (adminSecretKey) {
        // If token exists, try to fetch data. If token is invalid, it will auto-logout.
        fetchAdminData();
    } else {
        document.getElementById('app-container').style.display = 'none';
        document.getElementById('adminLoginModal').classList.add('active');
    }
});

async function authenticateAdmin() {
    const input = document.getElementById('adminSecretKey').value;
    if (!input) { showToast('Secret key required.', 'error'); return; }
    
    const btn = document.querySelector('#adminLoginModal .btn-primary');
    const originalText = btn.innerText;
    btn.innerText = "Verifying Identity...";
    btn.disabled = true;

    try {
        // Test the key by asking the server for the dashboard data
        const payload = { action: 'adminGetDashboard', adminSecret: input };
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === 'success') {
            // Success! Save token and unlock dashboard
            sessionStorage.setItem('rtc_admin_secret', input);
            adminSecretKey = input;
            
            document.getElementById('adminLoginModal').classList.remove('active');
            document.getElementById('app-container').style.display = 'block';
            
            populateDashboard(result.data);
            showToast("Secure connection established.", "success");
        } else {
            // Failure! Keep modal locked.
            showToast(result.message || "Invalid Commission Secret.", "error");
        }
    } catch (e) {
        showToast("Network failure. Check connection.", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function logoutAdmin() {
    sessionStorage.removeItem('rtc_admin_secret');
    adminSecretKey = null;
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('adminSecretKey').value = '';
    document.getElementById('adminLoginModal').classList.add('active');
    showToast("Session terminated securely.", "success");
}

// === VIEW ROUTING ===
function showView(viewId, element) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    document.getElementById(viewId).classList.add('active');
    if(element) element.classList.add('active');
    
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.remove('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// === TOAST ENGINE ===
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const borderCol = type === 'success' ? 'var(--success-green)' : 'var(--danger-red)';
    toast.className = 'toast';
    toast.style.borderLeftColor = borderCol;
    toast.innerHTML = `<span>${type === 'success' ? '✓' : '⚠️'}</span> <span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3500);
}

// === API CALL HELPER ===
async function adminApiCall(action, payloadData = {}) {
    if(!adminSecretKey) {
        logoutAdmin(); return null;
    }
    
    const payload = { 
        action: action, 
        adminSecret: adminSecretKey,
        ...payloadData
    };

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        
        if (result.status === 'success') {
            return result;
        } else {
            showToast(result.message || "Action rejected by server.", "error");
            if(result.message === "Unauthorized administrative access.") logoutAdmin();
            return null;
        }
    } catch (e) {
        showToast("Network failure contacting servers.", "error");
        return null;
    }
}

// === COMMAND CENTER FUNCTIONS ===
async function fetchAdminData() {
    showToast("Syncing with registry...", "success");
    const res = await adminApiCall('adminGetDashboard');
    if (res && res.data) {
        // If fetch successful, ensure dashboard is visible (handles refresh edge cases)
        document.getElementById('adminLoginModal').classList.remove('active');
        document.getElementById('app-container').style.display = 'block';
        populateDashboard(res.data);
    }
}

function populateDashboard(data) {
    // 1. Update Metrics
    document.getElementById('statRegistered').innerText = data.registeredVoters || '0';
    document.getElementById('statCast').innerText = data.votesCast || '0';
    document.getElementById('statTurnout').innerText = (data.turnout || '0') + '%';
    document.getElementById('noticeInput').value = data.notice || '';

    // 2. Update Status Banner
    const banner = document.getElementById('masterStatusBanner');
    const text = document.getElementById('bannerText');
    const status = data.status || 'UPCOMING';
    
    // Clear old classes
    banner.classList.remove('status-UPCOMING', 'status-LIVE', 'status-PAUSED', 'status-CLOSED');
    banner.classList.add(`status-${status}`);
    text.innerText = `ELECTION STATUS: ${status}`;

    // 3. Update Candidate Grid
    commissionCandidates = data.candidates || [];
    renderAdminCandidateGrid();
}

function refreshAdminData() {
    fetchAdminData();
}

// === STATE CONFIRMATION HANDLER ===
let pendingStatusTarget = null;

function updateElectionState(newStatus) {
    pendingStatusTarget = newStatus;
    
    const modal = document.getElementById('actionConfirmModal');
    const title = document.getElementById('confirmModalTitle');
    const desc = document.getElementById('confirmModalDesc');
    const icon = document.getElementById('confirmModalIcon');
    const submitBtn = document.getElementById('confirmModalSubmitBtn');

    // Reset layout defaults
    submitBtn.className = "btn";
    
    // Dynamically match styling based on critical tier levels
    if (newStatus === 'LIVE') {
        icon.innerText = "▶️";
        title.innerText = "Initialize Election?";
        desc.innerText = "This will open secure voting booths globally across all customized blocks.";
        submitBtn.classList.add('btn-success');
        submitBtn.innerText = "Activate Polls";
    } else if (newStatus === 'PAUSED') {
        icon.innerText = "⏸️";
        title.innerText = "Suspend Election?";
        desc.innerText = "This will lock all voting booths temporarily. Active student sessions will be held.";
        submitBtn.classList.add('btn-warning');
        submitBtn.innerText = "Pause Polls";
    } else if (newStatus === 'CLOSED') {
        icon.innerText = "⏹️";
        title.innerText = "Certify & Close Polls?";
        desc.innerText = "CRITICAL: This permanently ends voting operations and compiles blockchain tallies for student view. This action cannot be reversed.";
        submitBtn.classList.add('btn-danger');
        submitBtn.innerText = "Close & Certify";
    }

    // Assign click action execution block dynamically
    submitBtn.onclick = async function() {
        submitBtn.disabled = true;
        submitBtn.innerText = "Processing State Change...";
        
        showToast(`Pushing global state change: ${pendingStatusTarget}...`);
        const res = await adminApiCall('adminUpdateStatus', { status: pendingStatusTarget });
        
        submitBtn.disabled = false;
        closeModal('actionConfirmModal');

        if(res) {
            showToast(`System transitioned cleanly to: ${pendingStatusTarget}`);
            fetchAdminData();
        }
    };

    // Trigger modal execution window
    modal.classList.add('active');
}

async function pushNotice() {
    const text = document.getElementById('noticeInput').value;
    if(!text.trim()) { showToast("Notice cannot be empty.", "error"); return; }

    const res = await adminApiCall('adminBroadcastNotice', { notice: text });
    if(res) showToast("Noticecaster updated globally.");
}

// === CANDIDATE MANAGEMENT ===
function renderAdminCandidateGrid() {
    const grid = document.getElementById('adminCandidateGrid');
    if (commissionCandidates.length === 0) {
        grid.innerHTML = '<p style="color: var(--text-muted); padding: 1rem;">No candidates mapped in registry.</p>';
        return;
    }

    let html = '';
    commissionCandidates.forEach(c => {
        const img = c.img || 'https://via.placeholder.com/150';
        html += `
            <div class="cand-card">
                <img src="${img}" alt="${c.name}">
                <div class="cand-info">
                    <h4>${c.name}</h4>
                    <p style="font-weight:600; color:var(--college-gold);">${c.position}</p>
                    <p>${c.course} • ${c.block}</p>
                </div>
                <div class="cand-actions">
                    <button class="action-btn" onclick="openCandidateModal('${c.id}')" title="Edit">✏️</button>
                    <button class="action-btn" style="color: var(--danger-red);" onclick="triggerDelete('${c.id}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    });
    grid.innerHTML = html;
}

function openCandidateModal(candId = null) {
    // Reset Form
    document.getElementById('candId').value = '';
    document.getElementById('candName').value = '';
    document.getElementById('candPos').value = '';
    document.getElementById('candImg').value = '';
    document.getElementById('candManifesto').value = '';
    document.getElementById('candModalTitle').innerText = "Add Candidate";

    if (candId) {
        const c = commissionCandidates.find(x => x.id === candId);
        if (c) {
            document.getElementById('candModalTitle').innerText = "Edit Candidate";
            document.getElementById('candId').value = c.id;
            document.getElementById('candName').value = c.name;
            document.getElementById('candPos').value = c.position;
            document.getElementById('candCourse').value = c.course || 'All (Executive)';
            document.getElementById('candBlock').value = c.block || 'All (Executive)';
            document.getElementById('candImg').value = c.img || '';
            document.getElementById('candManifesto').value = "Warning: Backend does not transmit full manifesto to save bandwidth. Re-paste full text here to update.";
        }
    }
    document.getElementById('candidateFormModal').classList.add('active');
}

async function saveCandidate() {
    const cand = {
        id: document.getElementById('candId').value,
        name: document.getElementById('candName').value,
        position: document.getElementById('candPos').value,
        course: document.getElementById('candCourse').value,
        block: document.getElementById('candBlock').value,
        img: document.getElementById('candImg').value,
        manifesto: document.getElementById('candManifesto').value
    };

    if(!cand.name || !cand.position) {
        showToast("Name and Position are strictly required.", "error"); return;
    }

    const btn = document.getElementById('saveCandBtn');
    btn.disabled = true; btn.innerText = "Encrypting Payload...";

    const res = await adminApiCall('adminUpsertCandidate', { candidate: cand });
    
    btn.disabled = false; btn.innerText = "Save Candidate Record";
    
    if(res) {
        showToast(cand.id ? "Candidate record updated." : "New candidate successfully minted.");
        closeModal('candidateFormModal');
        fetchAdminData(); // Refresh the grid to show the new candidate
    }
}

function triggerDelete(candId) {
    document.getElementById('deleteCandId').value = candId;
    document.getElementById('deleteConfirmModal').classList.add('active');
}

async function executeDelete() {
    const id = document.getElementById('deleteCandId').value;
    if(!id) return;

    const btn = document.querySelector('#deleteConfirmModal .btn-danger');
    const originalText = btn.innerText;
    btn.innerText = "Purging...";
    btn.disabled = true;

    const res = await adminApiCall('adminDeleteCandidate', { candidateId: id });
    
    btn.innerText = originalText;
    btn.disabled = false;

    if(res) {
        showToast("Record purged globally.");
        closeModal('deleteConfirmModal');
        fetchAdminData(); // Refresh the grid to remove the candidate
    }
}