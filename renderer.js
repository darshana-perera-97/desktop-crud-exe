// Renderer process JavaScript for CRUD App
const { ipcRenderer } = require('electron');

let isDarkTheme = false;
let records = [];
let currentDataDirectory = '';
let selectedCommunities = [];
let editSelectedCommunities = [];

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Desktop CRUD App loaded successfully');
    loadRecords();
    setupEventListeners();
    updateStatistics();
    setupCommunitiesHandlers();
});

// Setup event listeners
function setupEventListeners() {
    // Add form submission
    document.getElementById('add-form').addEventListener('submit', handleAddRecord);
    document.getElementById('edit-form').addEventListener('submit', handleEditRecord);
    
    // Search functionality
    document.getElementById('search-input').addEventListener('input', handleSearch);
    
    // Listen for data directory selection
    ipcRenderer.on('data-directory-selected', (event, directory) => {
        currentDataDirectory = directory;
        document.getElementById('current-directory').textContent = directory;
        document.getElementById('directory-status').style.display = 'block';
        loadRecords();
    });
}

// Communities handling
function setupCommunitiesHandlers() {
    const communityInput = document.getElementById('community-input');
    const editCommunityInput = document.getElementById('edit-community-input');
    
    if (communityInput) {
        communityInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCommunity(this.value.trim(), 'add');
                this.value = '';
            }
        });
    }
    
    if (editCommunityInput) {
        editCommunityInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                addCommunity(this.value.trim(), 'edit');
                this.value = '';
            }
        });
    }
}

function addCommunity(communityName, type) {
    if (!communityName) return;
    
    if (type === 'add') {
        if (!selectedCommunities.includes(communityName)) {
            selectedCommunities.push(communityName);
            updateCommunitiesDisplay('selected-communities', selectedCommunities);
        }
    } else {
        if (!editSelectedCommunities.includes(communityName)) {
            editSelectedCommunities.push(communityName);
            updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
        }
    }
}

function removeCommunity(communityName, type) {
    if (type === 'add') {
        selectedCommunities = selectedCommunities.filter(c => c !== communityName);
        updateCommunitiesDisplay('selected-communities', selectedCommunities);
    } else {
        editSelectedCommunities = editSelectedCommunities.filter(c => c !== communityName);
        updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
    }
}

function updateCommunitiesDisplay(containerId, communities) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = communities.map(community => `
        <div class="community-tag">
            ${escapeHtml(community)}
            <button class="remove-btn" onclick="removeCommunity('${escapeHtml(community)}', '${containerId.includes('edit') ? 'edit' : 'add'}')">&times;</button>
        </div>
    `).join('');
}

// CRUD Operations
async function loadRecords() {
    try {
        records = await ipcRenderer.invoke('read-data', 'records.json');
        displayRecords(records);
        updateStatistics();
    } catch (error) {
        console.error('Error loading records:', error);
        showMessage('Error loading records', 'error');
    }
}

async function saveRecords() {
    try {
        const success = await ipcRenderer.invoke('write-data', 'records.json', records);
        if (!success) {
            showMessage('Error saving records', 'error');
        }
    } catch (error) {
        console.error('Error saving records:', error);
        showMessage('Error saving records', 'error');
    }
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function handleAddRecord(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    // Validate required fields
    if (!data.name || !data.nic || !data.address || !data.dob || !data.politicalPartyId || 
        !data.region || !data.agaDivision || !data.gsDivision || !data.poolingBooth) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }
    
    // Validate NIC format (basic validation)
    if (data.nic.length < 9) {
        showMessage('NIC must be at least 9 characters long', 'error');
        return;
    }
    
    // Validate Political Party ID format
    if (!/^\d{6}$/.test(data.politicalPartyId)) {
        showMessage('Political Party ID must be exactly 6 digits', 'error');
        return;
    }
    
    const newRecord = {
        id: generateId(),
        name: data.name.trim(),
        nic: data.nic.trim(),
        mobile1: data.mobile1?.trim() || '',
        mobile2: data.mobile2?.trim() || '',
        whatsapp: data.whatsapp?.trim() || '',
        homeNumber: data.homeNumber?.trim() || '',
        address: data.address.trim(),
        dob: data.dob,
        politicalPartyId: data.politicalPartyId,
        region: data.region,
        agaDivision: data.agaDivision,
        gsDivision: data.gsDivision,
        poolingBooth: data.poolingBooth,
        priority: parseInt(data.priority),
        connectivity: data.connectivity?.trim() || '',
        communities: [...selectedCommunities],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    records.unshift(newRecord);
    saveRecords();
    displayRecords(records);
    updateStatistics();
    clearForm();
    showMessage('Record added successfully', 'success');
}

function handleEditRecord(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    const id = document.getElementById('edit-id').value;
    
    // Validate required fields
    if (!data.name || !data.nic || !data.address || !data.dob || !data.politicalPartyId || 
        !data.region || !data.agaDivision || !data.gsDivision || !data.poolingBooth) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }
    
    // Validate NIC format (basic validation)
    if (data.nic.length < 9) {
        showMessage('NIC must be at least 9 characters long', 'error');
        return;
    }
    
    // Validate Political Party ID format
    if (!/^\d{6}$/.test(data.politicalPartyId)) {
        showMessage('Political Party ID must be exactly 6 digits', 'error');
        return;
    }
    
    const recordIndex = records.findIndex(record => record.id === id);
    if (recordIndex !== -1) {
        records[recordIndex] = {
            ...records[recordIndex],
            name: data.name.trim(),
            nic: data.nic.trim(),
            mobile1: data.mobile1?.trim() || '',
            mobile2: data.mobile2?.trim() || '',
            whatsapp: data.whatsapp?.trim() || '',
            homeNumber: data.homeNumber?.trim() || '',
            address: data.address.trim(),
            dob: data.dob,
            politicalPartyId: data.politicalPartyId,
            region: data.region,
            agaDivision: data.agaDivision,
            gsDivision: data.gsDivision,
            poolingBooth: data.poolingBooth,
            priority: parseInt(data.priority),
            connectivity: data.connectivity?.trim() || '',
            communities: [...editSelectedCommunities],
            updatedAt: new Date().toISOString()
        };
        
        saveRecords();
        displayRecords(records);
        closeEditModal();
        showMessage('Record updated successfully', 'success');
    }
}

function editRecord(id) {
    const record = records.find(r => r.id === id);
    if (record) {
        document.getElementById('edit-id').value = record.id;
        document.getElementById('edit-name').value = record.name;
        document.getElementById('edit-nic').value = record.nic;
        document.getElementById('edit-mobile1').value = record.mobile1 || '';
        document.getElementById('edit-mobile2').value = record.mobile2 || '';
        document.getElementById('edit-whatsapp').value = record.whatsapp || '';
        document.getElementById('edit-homeNumber').value = record.homeNumber || '';
        document.getElementById('edit-address').value = record.address;
        document.getElementById('edit-dob').value = record.dob;
        document.getElementById('edit-politicalPartyId').value = record.politicalPartyId;
        document.getElementById('edit-region').value = record.region;
        document.getElementById('edit-agaDivision').value = record.agaDivision;
        document.getElementById('edit-gsDivision').value = record.gsDivision;
        document.getElementById('edit-poolingBooth').value = record.poolingBooth;
        document.getElementById('edit-priority').value = record.priority;
        document.getElementById('edit-connectivity').value = record.connectivity || '';
        
        // Set communities
        editSelectedCommunities = [...(record.communities || [])];
        updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
        
        document.getElementById('edit-modal').style.display = 'flex';
    }
}

function deleteRecord(id) {
    if (confirm('Are you sure you want to delete this record?')) {
        records = records.filter(record => record.id !== id);
        saveRecords();
        displayRecords(records);
        updateStatistics();
        showMessage('Record deleted successfully', 'success');
    }
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('edit-form').reset();
    editSelectedCommunities = [];
    updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
}

// Display functions
function displayRecords(recordsToShow) {
    const recordsList = document.getElementById('records-list');
    
    if (recordsToShow.length === 0) {
        recordsList.innerHTML = '<div class="no-records">No records found. Add your first record above!</div>';
        return;
    }
    
    recordsList.innerHTML = recordsToShow.map(record => `
        <div class="record-item">
            <div class="record-header">
                <div class="record-info">
                    <h4>${escapeHtml(record.name)}</h4>
                    <div class="nic">NIC: ${escapeHtml(record.nic)}</div>
                    <div class="priority-info priority-${record.priority}">Priority: ${record.priority}</div>
                    
                    <div class="contact-info">
                        ${record.mobile1 ? `<span>📱 Mobile 1: ${escapeHtml(record.mobile1)}</span>` : ''}
                        ${record.mobile2 ? `<span>📱 Mobile 2: ${escapeHtml(record.mobile2)}</span>` : ''}
                        ${record.whatsapp ? `<span>💬 WhatsApp: ${escapeHtml(record.whatsapp)}</span>` : ''}
                        ${record.homeNumber ? `<span>🏠 Home: ${escapeHtml(record.homeNumber)}</span>` : ''}
                    </div>
                    
                    <div class="location-info">
                        <span>📍 ${escapeHtml(record.region)}</span>
                        <span>🏛️ ${escapeHtml(record.agaDivision)}</span>
                        <span>🏘️ ${escapeHtml(record.gsDivision)}</span>
                        <span>🗳️ ${escapeHtml(record.poolingBooth)}</span>
                    </div>
                    
                    ${record.address ? `<div class="record-description">📍 ${escapeHtml(record.address)}</div>` : ''}
                    ${record.connectivity ? `<div class="record-description">🌐 ${escapeHtml(record.connectivity)}</div>` : ''}
                    
                    ${record.communities && record.communities.length > 0 ? `
                        <div class="communities-list">
                            ${record.communities.map(community => 
                                `<span class="community-badge">${escapeHtml(community)}</span>`
                            ).join('')}
                        </div>
                    ` : ''}
                </div>
                <div class="record-actions">
                    <button class="btn btn-outline" onclick="editRecord('${record.id}')">Edit</button>
                    <button class="btn btn-secondary" onclick="deleteRecord('${record.id}')">Delete</button>
                </div>
            </div>
            <div class="record-meta">
                <span>Created: ${formatDate(record.createdAt)}</span>
                <span>Updated: ${formatDate(record.updatedAt)}</span>
                <span>DOB: ${formatDate(record.dob)}</span>
                <span>Party ID: ${escapeHtml(record.politicalPartyId)}</span>
            </div>
        </div>
    `).join('');
}

function updateStatistics() {
    const totalRecords = records.length;
    const today = new Date().toDateString();
    const todayRecords = records.filter(record => 
        new Date(record.createdAt).toDateString() === today
    ).length;
    
    document.getElementById('total-records').textContent = totalRecords;
    document.getElementById('today-records').textContent = todayRecords;
}

function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase();
    const filteredRecords = records.filter(record => 
        record.name.toLowerCase().includes(searchTerm) ||
        record.nic.toLowerCase().includes(searchTerm) ||
        record.mobile1?.toLowerCase().includes(searchTerm) ||
        record.mobile2?.toLowerCase().includes(searchTerm) ||
        record.whatsapp?.toLowerCase().includes(searchTerm) ||
        record.address.toLowerCase().includes(searchTerm) ||
        record.region.toLowerCase().includes(searchTerm) ||
        record.agaDivision.toLowerCase().includes(searchTerm) ||
        record.gsDivision.toLowerCase().includes(searchTerm) ||
        record.poolingBooth.toLowerCase().includes(searchTerm) ||
        record.politicalPartyId.includes(searchTerm) ||
        (record.communities && record.communities.some(community => 
            community.toLowerCase().includes(searchTerm)
        ))
    );
    displayRecords(filteredRecords);
}

// Utility functions
function clearForm() {
    document.getElementById('add-form').reset();
    selectedCommunities = [];
    updateCommunitiesDisplay('selected-communities', selectedCommunities);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showMessage(message, type) {
    // Create a temporary message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message-area ${type}`;
    messageDiv.textContent = message;
    messageDiv.style.display = 'block';
    messageDiv.style.position = 'fixed';
    messageDiv.style.top = '20px';
    messageDiv.style.right = '20px';
    messageDiv.style.zIndex = '1001';
    messageDiv.style.maxWidth = '300px';
    
    document.body.appendChild(messageDiv);
    
    setTimeout(() => {
        messageDiv.remove();
    }, 3000);
}

// Settings and theme functions
function openSettings() {
    ipcRenderer.invoke('open-settings');
}

function toggleTheme() {
    isDarkTheme = !isDarkTheme;
    const body = document.body;
    
    if (isDarkTheme) {
        body.classList.add('dark-theme');
    } else {
        body.classList.remove('dark-theme');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('edit-modal');
    if (e.target === modal) {
        closeEditModal();
    }
});
