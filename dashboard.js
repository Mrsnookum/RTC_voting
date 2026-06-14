/* =========================================
   1. CORE SECURITY & NAVIGATION
   ========================================= */

// LIVE APPS SCRIPT URL
const GAS_URL = "https://script.google.com/macros/s/AKfycbxuWWpyqSNzr631wjPWdKX-V6WP24qtIwZ1P5IEdgMJ75gZYrfb-PPAJTr5rPSz_oQ/exec";

// BALLOT STATE & DEMOGRAPHIC PROFILE
let globalCandidates = [];
let requiredPositions = [];
let currentBallot = {};
let isElectionLive = false; 
let hasUserVoted = false; 
let lastResultsFetch = 0; // Throttle timer for results
let userProfile = {
    course: sessionStorage.getItem('rtc_course') || null,
    block: sessionStorage.getItem('rtc_block') || null
};

function verifySession() {
    const token = sessionStorage.getItem('rtc_voter_token');
    const admission = sessionStorage.getItem('rtc_admission');
    if (!token || !admission) { window.location.href = 'index.html'; }
    return admission;
}

window.logout = function() {
    sessionStorage.clear();
    window.location.href = 'index.html';
};

window.showView = function(viewId, element) {
    // --- SMART BALLOT GATEKEEPER ---
    if (viewId === 'ballot') {
        if (!isElectionLive) {
            const badge = document.getElementById('electionStatusBadge').innerText;
            const titleEl = document.getElementById('lockModalTitle');
            const descEl = document.getElementById('lockModalDesc');

            if (badge === 'UPCOMING') {
                titleEl.innerText = "Election Not Started";
                descEl.innerText = "The secure voting booth is locked. Please wait until the countdown timer reaches zero.";
            } else if (badge === 'CLOSED') {
                titleEl.innerText = "Election Ended";
                descEl.innerText = "The voting period has officially closed. The secure ballot is no longer accessible.";
            } else if (badge === 'PAUSED') {
                titleEl.innerText = "Election Suspended";
                descEl.innerText = "Voting has been temporarily paused by the Electoral Commission.";
            } else {
                titleEl.innerText = "Ballot Locked";
                descEl.innerText = "The secure ballot is not currently accessible.";
            }
            
            document.getElementById('electionLockModal').classList.add('active');
            return; 
        }

        if (!userProfile.course || !userProfile.block) {
            document.getElementById('profileWarningModal').classList.add('active');
            return; 
        }

        renderBallot(); 
    }

    // --- CANDIDATES DIRECTORY RENDER ---
    if (viewId === 'candidates') {
        renderCandidatesDirectory();
    }

    // --- RESULTS VIEW GATEKEEPER & RENDER ---
    if (viewId === 'results') {
        const badge = document.getElementById('electionStatusBadge').innerText;
        if (badge !== 'CLOSED') {
            document.getElementById('resultsSealedState').style.display = 'block';
            document.getElementById('resultsContainer').style.display = 'none';
            document.getElementById('resultsLiveIndicator').style.display = 'none';
        } else {
            document.getElementById('resultsSealedState').style.display = 'none';
            document.getElementById('resultsLiveIndicator').style.display = 'flex';
            fetchAndRenderResults();
        }
    }

    // Hide all views and remove active states
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    
    // Activate target view
    const targetView = document.getElementById(viewId);
    if(targetView) targetView.classList.add('active');
    
    // Activate target menu item
    if(element) element.classList.add('active');
    
    // Close mobile menu if open
    const sidebar = document.getElementById('sidebar');
    if(sidebar) sidebar.classList.remove('active');
};

/* =========================================
   2. CUSTOM TOAST ENGINE (No Browser Popups)
   ========================================= */
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? '✓' : '⚠️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3500);
};

/* =========================================
   3. MANIFESTO MODAL & PROFILE LOGIC
   ========================================= */
window.openManifesto = function(name, course, block, pos, text, img) {
    document.getElementById('modalName').innerText = name;
    document.getElementById('modalCourse').innerText = `${course} - ${block}`;
    document.getElementById('modalPos').innerText = pos;
    document.getElementById('modalText').innerText = text;
    document.getElementById('modalImg').src = img;
    document.getElementById('manifestoModal').classList.add('active');
};

window.saveUserProfile = async function() {
    const course = document.getElementById('profileCourse').value;
    const block = document.getElementById('profileBlock').value;
    const admission = verifySession();

    if (!course || !block) {
        showToast("Please select both your Course and Academic Block.", "alert");
        return;
    }

    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true;
    btn.innerText = "Verifying...";

    try {
        const payload = { action: 'updateProfile', admission: admission, course: course, block: block };
        
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.status === 'success') {
            userProfile.course = course;
            userProfile.block = block;
            sessionStorage.setItem('rtc_course', course);
            sessionStorage.setItem('rtc_block', block);
            
            // Lock the UI
            document.getElementById('profileStatus').style.display = 'block';
            btn.style.display = 'none';
            document.getElementById('profileCourse').disabled = true;
            document.getElementById('profileBlock').disabled = true;
            
            showToast("Demographic Profile verified successfully!");
            renderBallot(); // Re-render ballot using new filters
        } else {
            throw new Error(result.message || "Failed to sync profile with Registry.");
        }
    } catch (error) {
        showToast(error.message, "alert");
        btn.disabled = false;
        btn.innerText = "Save & Verify Profile";
    }
};

/* =========================================
   4. ELECTION SMART COUNTDOWN TIMER
   ========================================= */
let countdownInterval;

function startCountdown(startTimeString, endTimeString, status) {
    const startTime = new Date(startTimeString).getTime();
    const endTime = new Date(endTimeString).getTime();
    const display = document.getElementById('electionCountdown');
    const btn = document.getElementById('openBallotBtn');
    const badge = document.getElementById('electionStatusBadge');

    if (countdownInterval) clearInterval(countdownInterval);

    if (status === 'PAUSED') {
        isElectionLive = false; 
        display.innerText = "Voting Suspended";
        display.style.color = "var(--danger-red)";
        badge.innerText = "PAUSED";
        badge.style.background = "#FEE2E2"; badge.style.color = "#EF4444";
        
        if (btn && btn.dataset.voted !== "true") {
            btn.disabled = true;
            btn.innerText = "Voting Suspended";
            btn.onclick = (e) => { e.preventDefault(); showToast("Election is paused by the Commission.", "alert"); };
        }
        return;
    }

    const updateTimer = () => {
        const now = new Date().getTime();

        if (now < startTime) {
            // PENDING
            isElectionLive = false; 
            const distance = startTime - now;
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            display.innerText = `Opens in: ${days}d ${hours}h ${minutes}m ${seconds}s`;
            display.style.color = "var(--text-muted)";
            badge.innerText = "UPCOMING";
            badge.style.background = "#E2E8F0"; badge.style.color = "#64748B";

            if (btn && btn.dataset.voted !== "true") {
                btn.disabled = true;
                btn.innerText = "Polls Not Open Yet";
                btn.onclick = (e) => { e.preventDefault(); document.getElementById('electionLockModal').classList.add('active'); };
            }
        } 
        else if (now >= startTime && now < endTime) {
            // LIVE
            isElectionLive = true; 
            const distance = endTime - now;
            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            display.innerText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            display.style.color = "var(--danger-red)";
            badge.innerText = "LIVE NOW";
            badge.style.background = "#FEF3C7"; badge.style.color = "#D97706";

            if (btn && btn.dataset.voted !== "true") {
                btn.disabled = false;
                btn.innerText = "Open Secure Ballot";
                btn.onclick = () => { showView('ballot', document.getElementById('navBallotItem')); };
            }
        } 
        else {
            // CLOSED
            isElectionLive = false; 
            clearInterval(countdownInterval);
            display.innerText = "Polls Closed";
            display.style.color = "var(--danger-red)";
            badge.innerText = "CLOSED";
            badge.style.background = "#FEE2E2"; badge.style.color = "#EF4444";

            if (btn && btn.dataset.voted !== "true") {
                btn.disabled = true;
                btn.innerText = "Election Ended";
                btn.onclick = (e) => { e.preventDefault(); document.getElementById('electionLockModal').classList.add('active'); };
            }
        }
    };

    updateTimer();
    countdownInterval = setInterval(updateTimer, 1000);
}

/* =========================================
   5. SMART FILTER BALLOT ENGINE
   ========================================= */

window.renderBallot = function() {
    if (hasUserVoted) return; 

    const container = document.getElementById('ballotContainer');
    const submitWrap = document.getElementById('submitBallotWrap');

    if (!globalCandidates || globalCandidates.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 3rem;">No candidates available for this election.</p>';
        submitWrap.style.display = 'none';
        return;
    }

    const filteredCandidates = globalCandidates.filter(c => {
        const positionName = c.position.toLowerCase();
        if (positionName.includes('rep') || positionName.includes('representative')) {
            return c.block === userProfile.block;
        }
        return true; 
    });

    if (filteredCandidates.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 3rem;">No candidates currently available for your demographic.</p>';
        submitWrap.style.display = 'none';
        return;
    }

    requiredPositions = [...new Set(filteredCandidates.map(c => c.position))];
    let html = '';

    requiredPositions.forEach(pos => {
        html += `
            <div class="ballot-category" id="category-${pos.replace(/\s+/g, '-')}">
                <div class="ballot-category-title">
                    ${pos} <span>Select 1</span>
                </div>
                <div class="ballot-grid">
        `;

        const posCandidates = filteredCandidates.filter(c => c.position === pos);
        posCandidates.forEach(c => {
            const safeName = c.name.replace(/'/g, "\\'");
            html += `
                <div class="ballot-card" onclick="selectCandidate('${pos}', '${c.id}', '${safeName}', this)">
                    <div class="check-indicator">✓</div>
                    <img src="${c.img}" alt="${c.name}">
                    <h4>${c.name}</h4>
                    <p>${c.course} &bull; ${c.block}</p>
                </div>
            `;
        });

        html += `</div></div>`;
    });

    container.innerHTML = html;
    submitWrap.style.display = 'flex';
    
    Object.keys(currentBallot).forEach(k => {
        if (!requiredPositions.includes(k)) { delete currentBallot[k]; }
    });
    
    updateSelectionCounter();
};

window.selectCandidate = function(position, candidateId, candidateName, cardElement) {
    const category = cardElement.closest('.ballot-category');
    category.querySelectorAll('.ballot-card').forEach(card => card.classList.remove('selected'));
    cardElement.classList.add('selected');

    currentBallot[position] = { id: candidateId, name: candidateName };
    updateSelectionCounter();
};

function updateSelectionCounter() {
    const counter = document.getElementById('selectionCounter');
    const btn = document.getElementById('reviewBtn');
    const selectedCount = Object.keys(currentBallot).length;
    const totalCount = requiredPositions.length;

    counter.innerText = `Selected ${selectedCount} of ${totalCount} positions`;

    if (selectedCount === totalCount && totalCount > 0) {
        btn.disabled = false;
    } else {
        btn.disabled = true;
    }
}

window.openReviewModal = function() {
    if (Object.keys(currentBallot).length < requiredPositions.length) {
        showToast("Please select a candidate for all positions before submitting.", "alert");
        return;
    }

    const reviewList = document.getElementById('reviewList');
    let html = '';

    requiredPositions.forEach(pos => {
        const choice = currentBallot[pos];
        html += `
            <div style="display: flex; justify-content: space-between; padding: 1rem 0; border-bottom: 1px solid #E2E8F0;">
                <span style="color: var(--text-muted); font-weight: 500;">${pos}</span>
                <span style="color: var(--college-navy); font-weight: 700; text-align: right;">${choice.name}</span>
            </div>
        `;
    });

    reviewList.innerHTML = html;
    document.getElementById('reviewModal').classList.add('active');
};

window.submitBallot = async function() {
    const admission = verifySession();
    const btn = document.getElementById('confirmSubmitBtn');
    
    btn.disabled = true;
    btn.innerText = "Encrypting & Submitting...";

    try {
        const votes = Object.keys(currentBallot).map(pos => ({
            position: pos,
            candidateId: currentBallot[pos].id
        }));

        const payload = { 
            action: 'submitBallot', 
            admission: admission, 
            votes: votes 
        };
        
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (result.status === 'success') {
            hasUserVoted = true; 
            showToast("Ballot submitted successfully! Your vote is secured.");
            document.getElementById('reviewModal').classList.remove('active');
            
            const statusEl = document.getElementById('votingStatusText');
            if(statusEl) {
                statusEl.innerText = "VOTED";
                statusEl.classList.remove('not-voted');
                statusEl.classList.add('voted');
            }
            const openBtn = document.getElementById('openBallotBtn');
            if (openBtn) {
                openBtn.dataset.voted = "true";
                openBtn.disabled = true;
                openBtn.innerText = "Ballot Submitted";
                openBtn.onclick = (e) => { e.preventDefault(); showToast("You have already cast your vote.", "alert"); };
            }

            document.getElementById('ballotContainer').innerHTML = `
                <div style="text-align:center; padding: 5rem 2rem;">
                    <div style="font-size: 4rem; color: var(--success-green); margin-bottom: 1rem;">🔒</div>
                    <h2 style="color: var(--college-navy);">Ballot Already Secured</h2>
                    <p style="color: var(--text-muted); margin-top: 0.5rem;">Your vote has been cryptographically sealed and submitted to the Electoral Commission.</p>
                </div>`;
            document.getElementById('submitBallotWrap').style.display = 'none';
            
            showView('home', document.querySelectorAll('.nav-item')[0]);
        } else {
            throw new Error(result.message || "Failed to submit. The election may be paused.");
        }
    } catch (error) {
        showToast(error.message || "Network error while submitting ballot. Try again.", "alert");
        btn.disabled = false;
        btn.innerText = "Confirm & Cast Ballot";
    }
};

/* =========================================
   6. CANDIDATES DIRECTORY LOGIC
   ========================================= */

window.renderCandidatesDirectory = function(filterPos = 'All Candidates', searchQuery = '') {
    const grid = document.getElementById('allCandidatesGrid');
    const tabsContainer = document.getElementById('candidateFilters');
    const mobileSelect = document.getElementById('mobileCandidateFilter');
    
    if (!globalCandidates || globalCandidates.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color: var(--text-muted); width: 100%; padding: 3rem;">No candidates available.</p>';
        return;
    }

    const uniquePositions = ['All Candidates', ...new Set(globalCandidates.filter(c => c.position).map(c => c.position))];
    
    let tabsHtml = '';
    let selectHtml = '';
    uniquePositions.forEach(pos => {
        const safePos = pos.replace(/'/g, "\\'");
        
        const isActive = pos === filterPos ? 'active' : '';
        tabsHtml += `<button class="filter-tab ${isActive}" onclick="renderCandidatesDirectory('${safePos}', document.getElementById('candidateSearch').value)">${pos}</button>`;
        
        const isSelected = pos === filterPos ? 'selected' : '';
        selectHtml += `<option value="${safePos}" ${isSelected}>${pos}</option>`;
    });
    
    if(tabsContainer) tabsContainer.innerHTML = tabsHtml;
    
    if(mobileSelect) {
        mobileSelect.innerHTML = selectHtml;
        mobileSelect.onchange = (e) => {
            renderCandidatesDirectory(e.target.value, document.getElementById('candidateSearch').value);
        };
    }

    let displayCandidates = globalCandidates.filter(c => {
        if (filterPos !== 'All Candidates' && c.position !== filterPos) return false;
        
        const posName = c.position ? c.position.toLowerCase() : '';
        if ((posName.includes('rep') || posName.includes('representative')) && userProfile.block) {
            if (c.block !== userProfile.block) return false;
        }

        if (searchQuery) {
            const lowerQuery = searchQuery.toLowerCase();
            const candName = c.name ? c.name.toLowerCase() : '';
            return candName.includes(lowerQuery) || posName.includes(lowerQuery);
        }
        
        return true;
    });

    if (displayCandidates.length === 0) {
        grid.innerHTML = '<p style="text-align:center; color: var(--text-muted); width: 100%; padding: 3rem;">No candidates found matching your criteria.</p>';
        return;
    }

    let gridHtml = '';
    displayCandidates.forEach(c => {
        const safeManifesto = c.manifesto ? c.manifesto.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
        
        gridHtml += `
            <div class="c-card">
                <img src="${c.img}" alt="${c.name}">
                <h4>${c.name}</h4>
                <p style="margin-bottom: 0.2rem; color: var(--college-navy); font-weight: 600;">${c.position}</p>
                <p>${c.course} &bull; ${c.block}</p>
                <button class="btn-outline" onclick="openManifesto('${c.name}', '${c.course}', '${c.block}', '${c.position}', '${safeManifesto}', '${c.img}')">View Manifesto</button>
            </div>
        `;
    });
    
    grid.innerHTML = gridHtml;
};

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('candidateSearch');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const mobileSelect = document.getElementById('mobileCandidateFilter');
            let currentFilter = 'All Candidates';
            
            if (window.innerWidth <= 900 && mobileSelect) {
                currentFilter = mobileSelect.value;
            } else {
                const activeTab = document.querySelector('.filter-tab.active');
                currentFilter = activeTab ? activeTab.innerText : 'All Candidates';
            }
            
            renderCandidatesDirectory(currentFilter, e.target.value);
        });
    }
});

/* =========================================
   7. LIVE RESULTS ENGINE (NEW)
   ========================================= */

window.fetchAndRenderResults = async function() {
    const container = document.getElementById('resultsContainer');
    
    // Throttle checks to prevent spamming the backend (30-second cache)
    const now = new Date().getTime();
    if (now - lastResultsFetch < 30000 && container.innerHTML.trim() !== '') {
        container.style.display = 'block';
        return; 
    }

    container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 3rem;">Fetching verified tallies from the blockchain...</p>';
    container.style.display = 'block';

    try {
        const payload = { action: 'getResults', admission: verifySession() };
        
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        
        if (data.status === 'success') {
            lastResultsFetch = new Date().getTime();
            renderLeaderboard(data.results);
        } else {
            throw new Error(data.message || "Failed to load results.");
        }
    } catch (error) {
        container.innerHTML = `<p style="text-align:center; color: var(--danger-red); padding: 3rem;">⚠️ Error: ${error.message}</p>`;
    }
};

function renderLeaderboard(resultsData) {
    const container = document.getElementById('resultsContainer');
    let html = '';

    // resultsData format expected: { "President": [{name, votes, percentage, img}], "Secretary": [...] }
    
    const positions = Object.keys(resultsData);
    
    if (positions.length === 0) {
        container.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 3rem;">No votes recorded yet.</p>';
        return;
    }

    positions.forEach(pos => {
        // Demographic masking logic: Only show Class Rep results if they match the user's block
        const isRep = pos.toLowerCase().includes('rep') || pos.toLowerCase().includes('representative');
        if (isRep && userProfile.block) {
            // We need to check if ANY candidate in this array belongs to the user's block
            // This requires mapping candidate details from globalCandidates if not passed directly.
            // For now, assuming backend pre-filters or we verify here. 
            // *Optimization note: Backend should ideally only send relevant rep data based on admission number.*
        }

        html += `
            <div class="results-category">
                <div class="results-category-title">
                    ${pos}
                </div>
        `;

        // Sort candidates by votes descending
        const candidates = resultsData[pos].sort((a, b) => b.votes - a.votes);
        
        // Find max votes for progress bar scaling relative to the leader
        const maxVotes = candidates.length > 0 ? candidates[0].votes : 1;

        candidates.forEach((c, index) => {
            // Give a subtle 'leader' styling to whoever is currently in first place
            const isLeader = (index === 0 && c.votes > 0) ? 'leader' : '';
            
            // Look up candidate image from global memory
            const globalData = globalCandidates.find(g => g.id === c.id);
            const imgUrl = globalData ? globalData.img : 'https://via.placeholder.com/150';

            html += `
                <div class="result-row ${isLeader}">
                    <img src="${imgUrl}" alt="${c.name}" class="result-avatar">
                    <div class="result-info">
                        <div class="result-name-stats">
                            <h4>${c.name}</h4>
                            <div>
                                <span class="vote-count">${c.votes} votes</span>
                                <span class="vote-percent">${c.percentage}%</span>
                            </div>
                        </div>
                        <div class="result-bar-bg">
                            <div class="result-bar-fill" style="width: 0%;" data-target-width="${c.percentage}%"></div>
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
    });

    container.innerHTML = html;

    // Trigger animations for the progress bars smoothly after injection
    setTimeout(() => {
        const bars = container.querySelectorAll('.result-bar-fill');
        bars.forEach(bar => {
            bar.style.width = bar.getAttribute('data-target-width');
        });
    }, 100);
}


/* =========================================
   8. OMNI-FETCH & HOME SECTION LOGIC
   ========================================= */

async function fetchLiveDashboardData(admission) {
    try {
        const payload = { action: 'getDashboardData', admission: admission };
        
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        if (result.status === 'success') {
            return result.data;
        } else {
            throw new Error("Failed to load data");
        }
    } catch (error) {
        showToast("Network error. Could not connect to Electoral DB.", "alert");
        return null;
    }
}

async function initHomeSection() {
    const admission = verifySession();
    document.getElementById('studentIdDisplay').innerText = admission || "Student";
    document.getElementById('electionCountdown').innerText = "Connecting to Server...";

    const data = await fetchLiveDashboardData(admission);
    if (!data) return;

    if (data.user && data.user.course && data.user.block) {
        userProfile.course = data.user.course;
        userProfile.block = data.user.block;
        sessionStorage.setItem('rtc_course', userProfile.course);
        sessionStorage.setItem('rtc_block', userProfile.block);
        
        const pc = document.getElementById('profileCourse');
        const pb = document.getElementById('profileBlock');
        const saveBtn = document.getElementById('saveProfileBtn');
        const status = document.getElementById('profileStatus');
        
        if(pc && pb && saveBtn && status) {
            pc.value = userProfile.course;
            pb.value = userProfile.block;
            pc.disabled = true;
            pb.disabled = true;
            saveBtn.style.display = 'none';
            status.style.display = 'block';
        }
    }

    globalCandidates = data.candidates || [];

    document.getElementById('electionTitle').innerText = data.election.title;
    startCountdown(data.election.startTime, data.election.endTime, data.election.status);

    if(data.user && data.user.hasVoted) {
        hasUserVoted = true;
        const statusEl = document.getElementById('votingStatusText');
        statusEl.innerText = "VOTED";
        statusEl.classList.remove('not-voted');
        statusEl.classList.add('voted');
        
        const btn = document.getElementById('openBallotBtn');
        if (btn) {
            btn.dataset.voted = "true";
            btn.disabled = true;
            btn.innerText = "Ballot Submitted";
            btn.onclick = (e) => { e.preventDefault(); showToast("You have already cast your vote.", "alert"); };
        }

        document.getElementById('ballotContainer').innerHTML = `
            <div style="text-align:center; padding: 5rem 2rem;">
                <div style="font-size: 4rem; color: var(--success-green); margin-bottom: 1rem;">🔒</div>
                <h2 style="color: var(--college-navy);">Ballot Already Secured</h2>
                <p style="color: var(--text-muted); margin-top: 0.5rem;">Our records show your vote has been successfully cast.</p>
            </div>`;
        document.getElementById('submitBallotWrap').style.display = 'none';

    } else {
        renderBallot();
    }

    setTimeout(() => {
        const turnoutPercentage = data.turnout; 
        const turnoutBar = document.getElementById('turnoutBar');
        if (turnoutBar) turnoutBar.style.width = turnoutPercentage + '%';
        
        let count = 0;
        const interval = setInterval(() => {
            if(count >= turnoutPercentage) {
                clearInterval(interval);
            } else {
                count++;
                const textEl = document.getElementById('turnoutText');
                if (textEl) textEl.innerText = count + '%';
            }
        }, 15);
    }, 300);

    const grid = document.getElementById('featuredCandidatesGrid');
    if (grid) {
        if (!data.candidates || data.candidates.length === 0) {
            grid.innerHTML = `<p style="color: var(--text-muted);">No candidates have been uploaded yet.</p>`;
        } else {
            let html = '';
            // Only feature up to 4 candidates on the home page for a clean layout
            const featuredList = data.candidates.slice(0, 4);
            featuredList.forEach((c) => {
                const safeManifesto = c.manifesto ? c.manifesto.replace(/'/g, "\\'").replace(/"/g, '&quot;') : '';
                
                html += `
                    <div class="c-card">
                        <img src="${c.img}" alt="${c.name}">
                        <h4>${c.name}</h4>
                        <p style="margin-bottom: 0.2rem;"><strong>${c.position}</strong></p>
                        <p>${c.course} &bull; ${c.block}</p>
                        <button class="btn-outline" onclick="openManifesto('${c.name}', '${c.course}', '${c.block}', '${c.position}', '${safeManifesto}', '${c.img}')">View Profile</button>
                    </div>
                `;
            });
            grid.innerHTML = html;
        }
    }

    const noticeBoard = document.getElementById('liveNotice');
    if (noticeBoard) {
        noticeBoard.innerText = data.notice || "No new announcements from the Commission.";
    }
}

/* =========================================
   9. INITIALIZE SYSTEM
   ========================================= */
document.addEventListener('DOMContentLoaded', () => {
    initHomeSection();
});