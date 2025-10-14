// Renderer process JavaScript for CRUD App
const { ipcRenderer } = require('electron');

let isDarkTheme = false;
let records = [];
let currentDataDirectory = '';

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Desktop CRUD App loaded successfully');
    loadRecords();
    setupEventListeners();
    updateStatistics();
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
    
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const description = document.getElementById('description').value.trim();
    
    if (!name || !email) {
        showMessage('Name and email are required', 'error');
        return;
    }
    
    const newRecord = {
        id: generateId(),
        name: name,
        email: email,
        description: description,
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
    
    const id = document.getElementById('edit-id').value;
    const name = document.getElementById('edit-name').value.trim();
    const email = document.getElementById('edit-email').value.trim();
    const description = document.getElementById('edit-description').value.trim();
    
    if (!name || !email) {
        showMessage('Name and email are required', 'error');
        return;
    }
    
    const recordIndex = records.findIndex(record => record.id === id);
    if (recordIndex !== -1) {
        records[recordIndex] = {
            ...records[recordIndex],
            name: name,
            email: email,
            description: description,
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
        document.getElementById('edit-email').value = record.email;
        document.getElementById('edit-description').value = record.description;
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
                    <div class="email">${escapeHtml(record.email)}</div>
                    ${record.description ? `<div class="record-description">${escapeHtml(record.description)}</div>` : ''}
                </div>
                <div class="record-actions">
                    <button class="btn btn-outline" onclick="editRecord('${record.id}')">Edit</button>
                    <button class="btn btn-secondary" onclick="deleteRecord('${record.id}')">Delete</button>
                </div>
            </div>
            <div class="record-meta">
                <span>Created: ${formatDate(record.createdAt)}</span>
                <span>Updated: ${formatDate(record.updatedAt)}</span>
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
        record.email.toLowerCase().includes(searchTerm) ||
        record.description.toLowerCase().includes(searchTerm)
    );
    displayRecords(filteredRecords);
}

// Utility functions
function clearForm() {
    document.getElementById('add-form').reset();
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
