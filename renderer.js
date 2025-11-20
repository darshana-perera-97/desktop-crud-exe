// Renderer process JavaScript for CRUD App
const { ipcRenderer } = require('electron');

// Load dropdown data
let poolingOptions = [];
let gsOptions = [];
let agaOptions = [];
let region = [];

try {
    const data = require('./data');
    poolingOptions = data.poolingOptions || [];
    gsOptions = data.gsOptions || [];
    agaOptions = data.agaOptions || [];
    region = data.region || [];
    console.log('Data loaded successfully');
} catch (error) {
    console.error('Error loading data:', error);
}

let isDarkTheme = false;
let records = [];
let currentDataDirectory = '';
let selectedCommunities = [];
let editSelectedCommunities = [];
let communities = [];

// Keep track of records to prevent data loss
let lastSavedRecords = [];

// Pagination state
let currentPage = 1;
let recordsPerPage = 25;
let filteredRecordsForPagination = [];

function findOptionByValue(options, value) {
    if (!options || !value) return null;
    return options.find(option => option.value === value || option.label === value) || null;
}

function generateRegId(regionInfo, gsInfo) {
    const clean = text => (text || '')
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 2)
        .toUpperCase()
        .padEnd(2, 'X');
    const regionPart = clean(regionInfo?.label || regionInfo?.value || 'RG');
    const gsPart = clean(gsInfo?.label || gsInfo?.value || 'GS');
    const sequence = Date.now().toString().slice(-5);
    return `${regionPart}-${gsPart}-${sequence}`;
}

function normaliseRecord(record) {
    const normalised = { ...record };

    // Region
    if (record.region && typeof record.region === 'object') {
        normalised.region = record.region;
    } else {
        const regionInfo = findOptionByValue(region, record.region);
        if (regionInfo) {
            normalised.region = { ...regionInfo };
        } else {
            normalised.region = record.region ? { value: record.region, label: record.region } : null;
        }
    }

    // AGA Division
    if (record.agaDivision && typeof record.agaDivision === 'object') {
        normalised.agaDivision = record.agaDivision;
    } else {
        const agaInfo = findOptionByValue(agaOptions, record.agaDivision);
        if (agaInfo) {
            normalised.agaDivision = { value: agaInfo.value, label: agaInfo.label };
        } else if (record.agaDivision) {
            normalised.agaDivision = { value: record.agaDivision, label: record.agaDivision };
        }
    }

    // GS Division
    if (record.gsDivision && typeof record.gsDivision === 'object') {
        normalised.gsDivision = record.gsDivision;
    } else {
        const gsInfo = findOptionByValue(gsOptions, record.gsDivision);
        if (gsInfo) {
            normalised.gsDivision = { value: gsInfo.value, label: gsInfo.label };
        } else if (record.gsDivision) {
            normalised.gsDivision = { value: record.gsDivision, label: record.gsDivision };
        }
    }

    // Pooling Booth
    if (record.poolingBooth && typeof record.poolingBooth === 'object') {
        normalised.poolingBooth = record.poolingBooth;
    } else {
        const poolingInfo = findOptionByValue(poolingOptions, record.poolingBooth);
        if (poolingInfo) {
            normalised.poolingBooth = { value: poolingInfo.value, label: poolingInfo.label };
        } else if (record.poolingBooth) {
            normalised.poolingBooth = { value: record.poolingBooth, label: record.poolingBooth };
        }
    }

    if (!normalised.RegID) {
        normalised.RegID = generateRegId(normalised.region, normalised.gsDivision);
    }

    return normalised;
}

function normaliseCommunity(community) {
    const normalised = { ...community };
    if (community.region && !community.agaDivision) {
        const agaInfo = findOptionByValue(agaOptions, community.region);
        normalised.agaDivision = agaInfo ? { value: agaInfo.value, label: agaInfo.label } : { value: community.region, label: community.region };
    } else if (community.agaDivision && typeof community.agaDivision === 'string') {
        const agaInfo = findOptionByValue(agaOptions, community.agaDivision);
        normalised.agaDivision = agaInfo ? { value: agaInfo.value, label: agaInfo.label } : { value: community.agaDivision, label: community.agaDivision };
    }

    if (community.gsDivision && typeof community.gsDivision === 'string') {
        const gsInfo = findOptionByValue(gsOptions, community.gsDivision);
        normalised.gsDivision = gsInfo ? { value: gsInfo.value, label: gsInfo.label } : { value: community.gsDivision, label: community.gsDivision };
    }

    if (!normalised.createdAt) {
        normalised.createdAt = new Date().toISOString();
    }

    return normalised;
}

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    console.log('Desktop CRUD App loaded successfully');
    updateGreeting();
    populateDropdowns();
    loadRecords();
    loadCommunities();
    setupEventListeners();
    updateStatistics();
    setupCommunitiesHandlers();
    
    // Update copyright year
    const yearElement = document.getElementById('current-year');
    if (yearElement) {
        yearElement.textContent = new Date().getFullYear();
    }
});

// Update greeting based on time
function updateGreeting() {
    const hour = new Date().getHours();
    let greeting = '';
    
    if (hour >= 5 && hour < 12) {
        greeting = 'Good Morning!';
    } else if (hour >= 12 && hour < 17) {
        greeting = 'Good Afternoon!';
    } else if (hour >= 17 && hour < 21) {
        greeting = 'Good Evening!';
    } else {
        greeting = 'Good Night!';
    }
    
    const greetingElement = document.getElementById('greeting');
    if (greetingElement) {
        greetingElement.textContent = greeting;
    }
}

// Setup event listeners
function setupEventListeners() {
    // Add form submission
    document.getElementById('add-form').addEventListener('submit', handleAddRecord);
    document.getElementById('edit-form').addEventListener('submit', handleEditRecord);
    
    // Add community form submission
    document.getElementById('add-community-form').addEventListener('submit', handleAddCommunity);
    
    // Filter functionality for view users section
    const filterInputs = ['filter-name', 'filter-nic', 'filter-gsDivision', 'filter-poolingBooth', 'filter-priority'];
    
    // Function to apply all filters (made global for access from other functions)
    window.applyFiltersAndSearch = function() {
        const filters = {
            name: document.getElementById('filter-name')?.value.trim() || '',
            nic: document.getElementById('filter-nic')?.value.trim() || '',
            gsDivision: document.getElementById('filter-gsDivision')?.value || '',
            poolingBooth: document.getElementById('filter-poolingBooth')?.value || '',
            priority: document.getElementById('filter-priority')?.value || ''
        };
        
        const filteredRecords = records.filter(record => {
            // Apply filters
            if (filters.name && !record.name.toLowerCase().includes(filters.name.toLowerCase())) {
                return false;
            }
            if (filters.nic && !record.nic.toLowerCase().includes(filters.nic.toLowerCase())) {
                return false;
            }
            if (filters.gsDivision) {
                const gsValue = record.gsDivision?.value || record.gsDivision || '';
                if (gsValue !== filters.gsDivision) {
                    return false;
                }
            }
            if (filters.poolingBooth) {
                const poolingValue = record.poolingBooth?.value || record.poolingBooth || '';
                if (poolingValue !== filters.poolingBooth) {
                    return false;
                }
            }
            if (filters.priority && record.priority !== filters.priority) {
                return false;
            }
            
            return true;
        });
        
        // Store filtered records for pagination
        filteredRecordsForPagination = filteredRecords;
        currentPage = 1; // Reset to first page when filters change
        displayViewUsersRecords(filteredRecords);
    }
    
    // Add event listeners for filter inputs
    filterInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('input', window.applyFiltersAndSearch);
            input.addEventListener('change', window.applyFiltersAndSearch);
        }
    });
    
    // Clear filters function (made global for access from HTML)
    window.clearFilters = function() {
        const filterInputs = ['filter-name', 'filter-nic', 'filter-gsDivision', 'filter-poolingBooth', 'filter-priority'];
        filterInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) input.value = '';
        });
        // Reset pagination
        currentPage = 1;
        // Apply filters to show all records
        if (typeof window.applyFiltersAndSearch === 'function') {
            window.applyFiltersAndSearch();
        } else {
            filteredRecordsForPagination = records;
            displayViewUsersRecords(records);
        }
    };
    
    // PDF Export functionality
    const availableFields = [
        { key: 'name', label: 'Name' },
        { key: 'nic', label: 'NIC' },
        { key: 'dob', label: 'Date of Birth' },
        { key: 'politicalPartyId', label: 'Party ID' },
        { key: 'priority', label: 'Priority' },
        { key: 'RegID', label: 'Reg ID' },
        { key: 'mobile1', label: 'Mobile 1' },
        { key: 'mobile2', label: 'Mobile 2' },
        { key: 'whatsapp', label: 'WhatsApp' },
        { key: 'homeNumber', label: 'Home Number' },
        { key: 'address', label: 'Address' },
        { key: 'region', label: 'Region' },
        { key: 'agaDivision', label: 'AGA Division' },
        { key: 'gsDivision', label: 'GS Division' },
        { key: 'poolingBooth', label: 'Pooling Booth' },
        { key: 'communities', label: 'Communities' },
        { key: 'connectivity', label: 'Connectivity' },
        { key: 'createdAt', label: 'Created At' },
        { key: 'updatedAt', label: 'Updated At' }
    ];
    
    window.openPdfFieldSelection = function() {
        const modal = document.getElementById('pdf-field-selection-modal');
        const checkboxesContainer = document.getElementById('pdf-field-checkboxes');
        
        if (!modal || !checkboxesContainer) return;
        
        // Check if there are any filtered records
        if (!filteredRecordsForPagination || filteredRecordsForPagination.length === 0) {
            alert('No records to export. Please ensure there are filtered records in the table.');
            return;
        }
        
        // Populate checkboxes
        checkboxesContainer.innerHTML = availableFields.map(field => `
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 8px; border-radius: 4px; transition: background 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
                <input type="checkbox" value="${field.key}" class="pdf-field-checkbox" ${['name', 'nic', 'politicalPartyId', 'mobile1'].includes(field.key) ? 'checked' : ''}>
                <span>${field.label}</span>
            </label>
        `).join('');
        
        // Add hover effect
        const labels = checkboxesContainer.querySelectorAll('label');
        labels.forEach(label => {
            label.addEventListener('mouseenter', () => {
                label.style.background = '#f5f5f5';
            });
            label.addEventListener('mouseleave', () => {
                label.style.background = 'transparent';
            });
        });
        
        modal.style.display = 'flex';
    };
    
    window.closePdfFieldSelection = function() {
        const modal = document.getElementById('pdf-field-selection-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
    
    window.generatePdf = async function() {
        const checkboxes = document.querySelectorAll('.pdf-field-checkbox:checked');
        
        if (checkboxes.length === 0) {
            alert('Please select at least one field to export.');
            return;
        }
        
        const selectedFields = Array.from(checkboxes).map(cb => cb.value);
        
        // Get filtered records
        const dataToExport = filteredRecordsForPagination || [];
        
        if (dataToExport.length === 0) {
            alert('No records to export.');
            return;
        }
        
        // Show loading message
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #333; color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;';
        loadingMsg.textContent = 'Generating PDF... Please wait.';
        document.body.appendChild(loadingMsg);
        
        try {
            // Prepare column headers
            const headers = selectedFields.map(fieldKey => {
                const field = availableFields.find(f => f.key === fieldKey);
                return field ? field.label : fieldKey;
            });
            
            // Prepare table data
            const tableRows = dataToExport.map(record => {
                return selectedFields.map(fieldKey => {
                    let value = '';
                    
                    switch(fieldKey) {
                        case 'region':
                            value = record.region?.label || record.region?.value || record.region || '-';
                            break;
                        case 'agaDivision':
                            value = record.agaDivision?.label || record.agaDivision?.value || record.agaDivision || '-';
                            break;
                        case 'gsDivision':
                            value = record.gsDivision?.label || record.gsDivision?.value || record.gsDivision || '-';
                            break;
                        case 'poolingBooth':
                            value = record.poolingBooth?.label || record.poolingBooth?.value || record.poolingBooth || '-';
                            break;
                        case 'communities':
                            value = Array.isArray(record.communities) ? record.communities.join(', ') : (record.communities || '-');
                            break;
                        case 'dob':
                            value = record.dob ? formatDate(record.dob) : '-';
                            break;
                        case 'createdAt':
                            value = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-';
                            break;
                        case 'updatedAt':
                            value = record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '-';
                            break;
                        default:
                            value = record[fieldKey] || '-';
                    }
                    
                    return {
                        key: fieldKey,
                        value: String(value)
                    };
                });
            });
            
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 1100px; background: white;';
            document.body.appendChild(tempContainer);
            
            const rowsPerPage = 25;
            const totalPages = Math.ceil(tableRows.length / rowsPerPage);
            const pageCanvases = [];
            
            for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                const start = pageIndex * rowsPerPage;
                const pageRows = tableRows.slice(start, start + rowsPerPage);
                
                const pageContainer = document.createElement('div');
                pageContainer.style.cssText = `
                    width: 1100px;
                    padding: 20px;
                    background: #ffffff;
                    box-sizing: border-box;
                `;
                
                if (pageIndex === 0) {
                    const titleDiv = document.createElement('div');
                    titleDiv.style.cssText = 'margin-bottom: 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;';
                    titleDiv.innerHTML = `
                        <h2 style="margin: 0 0 8px 0; font-size: 22px; color: #333;">User Records Export</h2>
                        <p style="margin: 0 0 4px 0; font-size: 13px; color: #666;">Generated on: ${new Date().toLocaleString()}</p>
                        <p style="margin: 0; font-size: 13px; color: #666;">Total Records: ${dataToExport.length}</p>
                    `;
                    pageContainer.appendChild(titleDiv);
                }
                
                const table = document.createElement('table');
                table.style.cssText = 'width: 100%; border-collapse: collapse; font-family: "FM Malithi", "Malithi Web", "Iskoola Pota", "Noto Sans Sinhala", sans-serif; font-size: 12px;';
                
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');
                headerRow.style.cssText = 'background: #4285f4; color: white; font-weight: bold;';
                headers.forEach(header => {
                    const th = document.createElement('th');
                    th.style.cssText = 'padding: 10px; text-align: left; border: 1px solid #ddd; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;';
                    th.textContent = header;
                    headerRow.appendChild(th);
                });
                thead.appendChild(headerRow);
                table.appendChild(thead);
                
                const tbody = document.createElement('tbody');
                pageRows.forEach((row, rowIndex) => {
                    const tr = document.createElement('tr');
                    if ((start + rowIndex) % 2 === 0) {
                        tr.style.cssText = 'background: #f8f9fa;';
                    }
                    row.forEach(cell => {
                        const td = document.createElement('td');
                        td.style.cssText = 'padding: 9px 10px; border: 1px solid #ddd; font-family: "FM Malithi", "Malithi Web", "Iskoola Pota", "Noto Sans Sinhala", sans-serif;';
                        if (cell.key === 'dob' || cell.key === 'nic') {
                            td.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif';
                        }
                        td.textContent = cell.value;
                        tr.appendChild(td);
                    });
                    tbody.appendChild(tr);
                });
                table.appendChild(tbody);
                pageContainer.appendChild(table);
                
                tempContainer.appendChild(pageContainer);
                
                const canvas = await html2canvas(pageContainer, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                
                pageCanvases.push(canvas);
                tempContainer.removeChild(pageContainer);
            }
            
            document.body.removeChild(tempContainer);
            document.body.removeChild(loadingMsg);
            
            const { jsPDF } = window.jspdf;
            const pdfWidth = 210; // A4 width in mm
            const pdfHeight = 297; // A4 height in mm
            const doc = new jsPDF('p', 'mm', 'a4');
            
            pageCanvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const widthMM = imgWidth * 0.264583;
                const heightMM = imgHeight * 0.264583;
                const scale = Math.min(pdfWidth / widthMM, pdfHeight / heightMM);
                const renderWidth = widthMM * scale;
                const renderHeight = heightMM * scale;
                const offsetX = (pdfWidth - renderWidth) / 2;
                const offsetY = (pdfHeight - renderHeight) / 2;
                
                if (index > 0) {
                    doc.addPage();
                }
                doc.addImage(imgData, 'JPEG', offsetX, offsetY, renderWidth, renderHeight);
            });
            
            // Save PDF
            const fileName = `user_records_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            
            // Close modal
            closePdfFieldSelection();
            
            // Show success message
            alert(`PDF generated successfully! ${dataToExport.length} records exported.`);
        } catch (error) {
            console.error('Error generating PDF:', error);
            if (document.body.contains(loadingMsg)) {
                document.body.removeChild(loadingMsg);
            }
            alert('Error generating PDF. Please make sure html2canvas and jsPDF libraries are loaded.');
        }
    };
    
    // Download address list as PDF
    window.downloadAddressListPdf = async function() {
        const dataToExport = filteredRecordsForPagination || [];
        
        if (!dataToExport || dataToExport.length === 0) {
            alert('No records to export. Please ensure there are filtered records in the table.');
            return;
        }
        
        const loadingMsg = document.createElement('div');
        loadingMsg.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: #333; color: white; padding: 20px 40px; border-radius: 8px; z-index: 10000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;';
        loadingMsg.textContent = 'Preparing Address List...';
        document.body.appendChild(loadingMsg);
        
        try {
            const tempContainer = document.createElement('div');
            tempContainer.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 900px; background: white;';
            document.body.appendChild(tempContainer);
            
            const totalRecords = dataToExport.length;
            const cardsPerPage = 14; // 2 columns x 7 rows per A4 page
            const columnsPerPage = 2;
            const totalPages = Math.ceil(totalRecords / cardsPerPage);
            const pageCanvases = [];
            
            for (let pageIndex = 0; pageIndex < totalPages; pageIndex++) {
                const start = pageIndex * cardsPerPage;
                const pageRecords = dataToExport.slice(start, start + cardsPerPage);
                
                const pageContainer = document.createElement('div');
                pageContainer.style.cssText = `
                    width: 900px;
                    min-height: 1270px;
                    padding: 30px 25px;
                    background: #ffffff;
                    box-sizing: border-box;
                `;
                
                const grid = document.createElement('div');
                grid.style.cssText = `
                    display: grid;
                    grid-template-columns: repeat(${columnsPerPage}, minmax(0, 1fr));
                    gap: 28px;
                `;
                
                pageRecords.forEach((record, idx) => {
                    const globalIndex = start + idx;
                    const box = document.createElement('div');
                    box.style.cssText = `
                        border: 1px solid #d0d0d0;
                        border-radius: 12px;
                        padding: 22px 24px;
                        min-height: 180px;
                        display: flex;
                        flex-direction: column;
                        justify-content: flex-start;
                        background: linear-gradient(135deg, #ffffff 0%, #f5f9ff 100%);
                        box-shadow: 0 3px 10px rgba(0,0,0,0.05);
                    `;
                    
                    const numberBadge = document.createElement('div');
                    numberBadge.style.cssText = 'align-self: flex-end; font-size: 11px; color: #888; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;';
                    numberBadge.textContent = `#${globalIndex + 1}`;
                    box.appendChild(numberBadge);
                    
                    const nameEl = document.createElement('div');
                    nameEl.style.cssText = 'font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #1f1f1f; font-family: "FM Malithi", "Malithi Web", "Iskoola Pota", "Noto Sans Sinhala", sans-serif;';
                    nameEl.textContent = record.name ? record.name : '-';
                    box.appendChild(nameEl);
                    
                    const addressEl = document.createElement('div');
                addressEl.style.cssText = 'font-size: 18px; line-height: 1.6; color: #333; font-family: "FM Malithi", "Malithi Web", "Iskoola Pota", "Noto Sans Sinhala", sans-serif;';
                addressEl.textContent = record.address ? record.address : '-';
                    box.appendChild(addressEl);
                    
                    grid.appendChild(box);
                });
                
                // Add placeholders to fill remaining slots on the page
                const placeholdersNeeded = cardsPerPage - pageRecords.length;
                for (let i = 0; i < placeholdersNeeded; i++) {
                    const placeholder = document.createElement('div');
                    placeholder.style.cssText = `
                        border: 1px dashed rgba(200,200,200,0.5);
                        border-radius: 12px;
                        min-height: 180px;
                        background: rgba(240,243,248,0.4);
                    `;
                    grid.appendChild(placeholder);
                }
                
                pageContainer.appendChild(grid);
                tempContainer.appendChild(pageContainer);
                
                const pageCanvas = await html2canvas(pageContainer, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff'
                });
                
                pageCanvases.push(pageCanvas);
                tempContainer.removeChild(pageContainer);
            }
            
            document.body.removeChild(tempContainer);
            document.body.removeChild(loadingMsg);
            
            const { jsPDF } = window.jspdf;
            const pdfWidth = 210;
            const pdfHeight = 297;
            const doc = new jsPDF('p', 'mm', 'a4');
            
            pageCanvases.forEach((canvas, index) => {
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const widthMM = imgWidth * 0.264583;
                const heightMM = imgHeight * 0.264583;
                const scale = Math.min(pdfWidth / widthMM, pdfHeight / heightMM);
                const renderWidth = widthMM * scale;
                const renderHeight = heightMM * scale;
                const offsetX = (pdfWidth - renderWidth) / 2;
                const offsetY = (pdfHeight - renderHeight) / 2;
                
                if (index > 0) {
                    doc.addPage();
                }
                doc.addImage(imgData, 'JPEG', offsetX, offsetY, renderWidth, renderHeight);
            });
            
            const fileName = `address_list_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(fileName);
            
            alert(`Address list PDF generated successfully! ${dataToExport.length} records exported.`);
        } catch (error) {
            console.error('Error generating address list PDF:', error);
            if (document.body.contains(loadingMsg)) {
                document.body.removeChild(loadingMsg);
            }
            alert('Error generating address list PDF. Please make sure html2canvas and jsPDF libraries are loaded.');
        }
    };
    
    window.handleViewAction3 = function() {
        console.log('View Action 3 clicked');
        // Add your custom functionality here
    };
    
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

function populateDropdowns() {
    console.log('Populating dropdowns...');
    console.log('Pooling options:', poolingOptions?.length);
    console.log('GS options:', gsOptions?.length);
    console.log('AGA options:', agaOptions?.length);
    console.log('Region options:', region?.length);
    
    // Populate pooling booth options
    populateSelect('poolingBooth', poolingOptions);
    populateSelect('edit-poolingBooth', poolingOptions);
    
    // Populate GS division options
    populateSelect('gsDivision', gsOptions);
    populateSelect('edit-gsDivision', gsOptions);
    
    // Populate AGA division options
    populateSelect('agaDivision', agaOptions);
    populateSelect('edit-agaDivision', agaOptions);
    
    // Populate region options
    populateSelect('region', region);
    populateSelect('edit-region', region);
    
    // Populate filter dropdowns
    populateSelect('filter-gsDivision', gsOptions);
    populateSelect('filter-poolingBooth', poolingOptions);
    
    console.log('Dropdowns populated');
}

function populateSelect(selectId, options) {
    const select = document.getElementById(selectId);
    if (!select) return;
    
    // Save placeholder text before clearing
    const placeholderOption = select.querySelector('option[value=""]');
    const placeholderText = placeholderOption ? placeholderOption.textContent : '';
    
    // Clear and recreate placeholder
    select.innerHTML = '';
    if (placeholderText) {
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = placeholderText;
        select.appendChild(placeholder);
    }
    
    // Add options from data
    if (options && options.length > 0) {
        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            select.appendChild(optionElement);
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
    
    // Determine which remove function to use
    let removeFunction = 'removeCommunity';
    let removeParam = containerId.includes('edit') && !containerId.includes('view-edit') ? 'edit' : 'add';
    
    if (containerId.includes('view-edit')) {
        removeFunction = 'removeViewEditCommunity';
        removeParam = '';
    }
    
    container.innerHTML = communities.map(community => `
        <div class="community-tag">
            ${escapeHtml(community)}
            <button class="remove-btn" onclick="${removeFunction}('${escapeHtml(community)}'${removeParam ? `, '${removeParam}'` : ''})">&times;</button>
        </div>
    `).join('');
}

// CRUD Operations
async function loadRecords() {
    try {
        records = await ipcRenderer.invoke('read-data', 'records.json');
        // Normalise records into structured format
        records = records.map(record => normaliseRecord(record));
        // Keep a backup of loaded records
        lastSavedRecords = [...records];
        updateStatistics();
        console.log(`Loaded ${records.length} records from storage`);
        updateCommunitySuggestions();
    } catch (error) {
        console.error('Error loading records:', error);
        // If loading fails, use last saved records if available
        if (lastSavedRecords.length > 0) {
            records = [...lastSavedRecords];
            console.log('Using backup records due to loading error');
        }
        updateStatistics();
    }
}

async function saveRecords() {
    try {
        // Prevent accidental data loss - don't save if somehow we lost all data
        if (records.length === 0 && lastSavedRecords.length > 0) {
            console.warn('Prevented saving empty records when backup exists');
            records = [...lastSavedRecords];
        }
        
        const success = await ipcRenderer.invoke('write-data', 'records.json', records);
        if (success) {
            // Update backup after successful save
            lastSavedRecords = [...records];
            console.log(`Saved ${records.length} records successfully`);
        } else {
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
    
    // Check for duplicate NIC
    const nicTrimmed = data.nic.trim();
    const duplicateNIC = records.find(record => record.nic && record.nic.trim() === nicTrimmed);
    if (duplicateNIC) {
        showMessage('This NIC number already exists. Please use a different NIC.', 'error');
        return;
    }
    
    // Validate Political Party ID format
    if (!/^\d{6}$/.test(data.politicalPartyId)) {
        showMessage('Political Party ID must be exactly 6 digits', 'error');
        return;
    }
    
    const regionSelect = document.getElementById('region');
    const regionValue = formData.get('region');
    const regionInfo = findOptionByValue(region, regionValue) || (regionSelect ? {
        value: regionValue,
        label: regionSelect.options[regionSelect.selectedIndex]?.textContent.trim() || regionValue
    } : null);

    const agaSelect = document.getElementById('agaDivision');
    const agaValue = formData.get('agaDivision');
    const agaInfo = findOptionByValue(agaOptions, agaValue) || (agaSelect ? {
        value: agaValue,
        label: agaSelect.options[agaSelect.selectedIndex]?.textContent.trim() || agaValue
    } : null);

    const gsSelect = document.getElementById('gsDivision');
    const gsValue = formData.get('gsDivision');
    const gsInfo = findOptionByValue(gsOptions, gsValue) || (gsSelect ? {
        value: gsValue,
        label: gsSelect.options[gsSelect.selectedIndex]?.textContent.trim() || gsValue
    } : null);

    const poolingSelect = document.getElementById('poolingBooth');
    const poolingValue = formData.get('poolingBooth');
    const poolingInfo = findOptionByValue(poolingOptions, poolingValue) || (poolingSelect ? {
        value: poolingValue,
        label: poolingSelect.options[poolingSelect.selectedIndex]?.textContent.trim() || poolingValue
    } : null);
    
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
        region: regionInfo,
        agaDivision: agaInfo,
        gsDivision: gsInfo,
        poolingBooth: poolingInfo,
        priority: data.priority,
        connectivity: data.connectivity?.trim() || '',
        communities: [...selectedCommunities],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        RegID: generateRegId(regionInfo, gsInfo)
    };
    
    records.unshift(newRecord);
    saveRecords();
    updateStatistics();
    updateCommunitySuggestions();
    // Reload view if we're in view-users section
    if (document.getElementById('view-users-section').style.display !== 'none') {
        if (typeof window.applyFiltersAndSearch === 'function') {
            window.applyFiltersAndSearch();
        } else {
            displayViewUsersRecords(records);
        }
    }
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
    
    // Check for duplicate NIC (excluding current record)
    const nicTrimmed = data.nic.trim();
    const duplicateNIC = records.find(record => record.id !== id && record.nic && record.nic.trim() === nicTrimmed);
    if (duplicateNIC) {
        showMessage('This NIC number already exists. Please use a different NIC.', 'error');
        return;
    }
    
    // Validate Political Party ID format
    if (!/^\d{6}$/.test(data.politicalPartyId)) {
        showMessage('Political Party ID must be exactly 6 digits', 'error');
        return;
    }
    
    const recordIndex = records.findIndex(record => record.id === id);
    const regionSelect = document.getElementById('edit-region');
    const regionValue = data.region;
    const regionInfo = findOptionByValue(region, regionValue) || (regionSelect ? {
        value: regionValue,
        label: regionSelect.options[regionSelect.selectedIndex]?.textContent.trim() || regionValue
    } : null);

    const agaSelect = document.getElementById('edit-agaDivision');
    const agaValue = data.agaDivision;
    const agaInfo = findOptionByValue(agaOptions, agaValue) || (agaSelect ? {
        value: agaValue,
        label: agaSelect.options[agaSelect.selectedIndex]?.textContent.trim() || agaValue
    } : null);

    const gsSelect = document.getElementById('edit-gsDivision');
    const gsValue = data.gsDivision;
    const gsInfo = findOptionByValue(gsOptions, gsValue) || (gsSelect ? {
        value: gsValue,
        label: gsSelect.options[gsSelect.selectedIndex]?.textContent.trim() || gsValue
    } : null);

    const poolingSelect = document.getElementById('edit-poolingBooth');
    const poolingValue = data.poolingBooth;
    const poolingInfo = findOptionByValue(poolingOptions, poolingValue) || (poolingSelect ? {
        value: poolingValue,
        label: poolingSelect.options[poolingSelect.selectedIndex]?.textContent.trim() || poolingValue
    } : null);

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
            region: regionInfo,
            agaDivision: agaInfo,
            gsDivision: gsInfo,
            poolingBooth: poolingInfo,
            priority: data.priority,
            connectivity: data.connectivity?.trim() || '',
            communities: [...editSelectedCommunities],
            updatedAt: new Date().toISOString(),
            RegID: records[recordIndex].RegID || generateRegId(regionInfo, gsInfo)
        };
        
        saveRecords();
        closeEditModal();
        
        // Reload view details page if it was open
        if (currentViewingRecordNIC && document.getElementById('view-user-details-section').style.display !== 'none') {
            loadUserDetailsPage(currentViewingRecordNIC);
        }
        
        // Reload view if we're in view-users section
        if (document.getElementById('view-users-section').style.display !== 'none') {
            if (typeof window.applyFiltersAndSearch === 'function') {
                window.applyFiltersAndSearch();
            } else {
                displayViewUsersRecords(records);
            }
        }
        updateCommunitySuggestions();
        showMessage('Record updated successfully', 'success');
    }
}

window.editRecord = function(nic) {
    const record = records.find(r => r.nic && r.nic.trim() === nic.trim());
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
        document.getElementById('edit-region').value = record.region?.value || record.region || '';
        document.getElementById('edit-agaDivision').value = record.agaDivision?.value || record.agaDivision || '';
        document.getElementById('edit-gsDivision').value = record.gsDivision?.value || record.gsDivision || '';
        document.getElementById('edit-poolingBooth').value = record.poolingBooth?.value || record.poolingBooth || '';
        document.getElementById('edit-priority').value = record.priority;
        document.getElementById('edit-connectivity').value = record.connectivity || '';
        
        // Set communities
        editSelectedCommunities = [...(record.communities || [])];
        updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
        
        // Hide view details page if open
        document.getElementById('view-user-details-section').style.display = 'none';
        
        document.getElementById('edit-modal').style.display = 'flex';
    }
};

window.deleteRecord = function(nic) {
    if (confirm('Are you sure you want to delete this record?')) {
        records = records.filter(record => !record.nic || record.nic.trim() !== nic.trim());
        saveRecords();
        updateStatistics();
        // Reload view if we're in view-users section
        if (document.getElementById('view-users-section').style.display !== 'none') {
            if (typeof window.applyFiltersAndSearch === 'function') {
                window.applyFiltersAndSearch();
            } else {
                displayViewUsersRecords(records);
            }
        }
        updateCommunitySuggestions();
        showMessage('Record deleted successfully', 'success');
    }
};

window.closeEditModal = function() {
    document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('edit-form').reset();
    editSelectedCommunities = [];
    updateCommunitiesDisplay('edit-selected-communities', editSelectedCommunities);
};

// Load records for view users section
async function loadRecordsForView() {
    try {
        records = await ipcRenderer.invoke('read-data', 'records.json');
        records = records.map(record => normaliseRecord(record));
        // Keep a backup
        lastSavedRecords = [...records];
        
        // Clear filters when loading
        const filterInputs = ['filter-name', 'filter-nic', 'filter-gsDivision', 'filter-poolingBooth', 'filter-priority'];
        filterInputs.forEach(inputId => {
            const input = document.getElementById(inputId);
            if (input) input.value = '';
        });
        
        // Initialize pagination
        currentPage = 1;
        filteredRecordsForPagination = records;
        displayViewUsersRecords(records);
        updateStatistics();
        console.log('Records loaded for View Users section:', records.length);
    } catch (error) {
        console.error('Error loading records for view:', error);
        const recordsList = document.getElementById('view-records-list');
        if (recordsList) {
            // Try to use backup if available
            if (lastSavedRecords.length > 0) {
                records = [...lastSavedRecords];
                displayViewUsersRecords(records);
            } else {
                recordsList.innerHTML = '<div class="no-records">Error loading records. Please try again.</div>';
            }
        }
    }
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
    if (Number.isNaN(date.getTime())) {
        return '-';
    }
    return date.toLocaleDateString();
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
    navigateToSection('settings');
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

// Load settings page
async function loadSettingsPage() {
    try {
        const config = await ipcRenderer.invoke('get-config');
        document.getElementById('settings-data-directory').value = config.dataDirectory || '';
        document.getElementById('settings-path-display').textContent = config.dataDirectory || 'No directory selected';
    } catch (error) {
        console.error('Error loading settings:', error);
        showSettingsMessage('Error loading settings', 'error');
    }
}

// Select new directory
async function selectNewDirectory() {
    try {
        const selectedPath = await ipcRenderer.invoke('select-directory');
        if (selectedPath) {
            document.getElementById('settings-data-directory').value = selectedPath;
            document.getElementById('settings-path-display').textContent = selectedPath;
            showSettingsMessage('Directory selected successfully', 'success');
        }
    } catch (error) {
        console.error('Error selecting directory:', error);
        showSettingsMessage('Error selecting directory', 'error');
    }
}

// Save app settings
async function saveAppSettings() {
    try {
        const config = await ipcRenderer.invoke('get-config');
        config.dataDirectory = document.getElementById('settings-data-directory').value;
        const success = await ipcRenderer.invoke('save-config', config);
        if (success) {
            showSettingsMessage('Settings saved successfully', 'success');
        } else {
            showSettingsMessage('Error saving settings', 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showSettingsMessage('Error saving settings', 'error');
    }
}

// Show settings status message
function showSettingsMessage(message, type) {
    const statusDiv = document.getElementById('settings-status-message');
    statusDiv.textContent = message;
    statusDiv.className = `status-message ${type}`;
    statusDiv.style.display = 'block';
    statusDiv.style.padding = '12px';
    statusDiv.style.borderRadius = '6px';
    statusDiv.style.marginBottom = '20px';
    
    if (type === 'success') {
        statusDiv.style.background = '#d4edda';
        statusDiv.style.color = '#155724';
        statusDiv.style.border = '1px solid #c3e6cb';
    } else {
        statusDiv.style.background = '#f8d7da';
        statusDiv.style.color = '#721c24';
        statusDiv.style.border = '1px solid #f5c6cb';
    }
    
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 3000);
}

// Navigation function
function navigateToSection(section) {
    // Hide all sections
    const sections = ['landing-page', 'add-user-section', 'view-users-section', 'view-user-details-section', 'communities-section', 'settings-section', 'statistics-section'];
    sections.forEach(id => {
        const element = document.getElementById(id);
        if (element) element.style.display = 'none';
    });
    
    // Show selected section
    if (section === 'add-user') {
        document.getElementById('add-user-section').style.display = 'block';
        document.getElementById('landing-page').style.display = 'none';
    } else if (section === 'view-users') {
        document.getElementById('view-users-section').style.display = 'block';
        document.getElementById('landing-page').style.display = 'none';
        loadRecordsForView();
    } else if (section === 'view-user-details') {
        const viewDetailsSection = document.getElementById('view-user-details-section');
        if (viewDetailsSection) {
            viewDetailsSection.style.display = 'block';
            document.getElementById('landing-page').style.display = 'none';
        } else {
            console.error('view-user-details-section not found in DOM');
        }
    } else if (section === 'communities') {
        document.getElementById('communities-section').style.display = 'block';
        document.getElementById('landing-page').style.display = 'none';
        loadCommunities();
    } else if (section === 'settings') {
        document.getElementById('settings-section').style.display = 'block';
        document.getElementById('landing-page').style.display = 'none';
        loadSettingsPage();
    } else if (section === 'home') {
        document.getElementById('landing-page').style.display = 'grid';
    }
}

function displayViewUsersRecords(recordsToShow) {
    const recordsList = document.getElementById('view-records-list');
    
    // Store filtered records for pagination
    filteredRecordsForPagination = recordsToShow;
    
    if (recordsToShow.length === 0) {
        recordsList.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px;">No records found.</td></tr>';
        updatePaginationControls(0);
        return;
    }
    
    // Calculate pagination
    const totalPages = Math.ceil(recordsToShow.length / recordsPerPage);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    }
    
    const startIndex = (currentPage - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const paginatedRecords = recordsToShow.slice(startIndex, endIndex);
    
    recordsList.innerHTML = paginatedRecords.map(record => `
        <tr>
            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif !important;">${escapeHtml(record.name)}</td>
            <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;">${escapeHtml(record.nic)}</td>
            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif !important;">${escapeHtml(record.politicalPartyId)}</td>
            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif !important;">${escapeHtml(record.mobile1 || '-')}</td>
            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif !important;">${escapeHtml(record.region?.label || record.region?.value || '-')}</td>
            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif !important;">${escapeHtml(record.agaDivision?.label || record.agaDivision?.value || '-')}</td>
            <td style="white-space: nowrap; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif !important;">
                <button class="btn btn-outline" onclick="viewRecordDetails('${escapeHtml(record.nic)}')" style="margin-right: 5px; padding: 4px 8px; font-size: 0.75rem;">View More</button>
                <button class="btn btn-secondary" onclick="deleteRecord('${escapeHtml(record.nic)}')" style="padding: 4px 8px; font-size: 0.75rem;">Delete</button>
            </td>
        </tr>
    `).join('');
    
    // Update pagination controls
    updatePaginationControls(recordsToShow.length, startIndex + 1, Math.min(endIndex, recordsToShow.length));
}

function updatePaginationControls(totalRecords, startRecord = 0, endRecord = 0) {
    const totalPages = Math.ceil(totalRecords / recordsPerPage);
    const paginationInfo = document.getElementById('pagination-info');
    const paginationPages = document.getElementById('pagination-pages');
    const prevButton = document.getElementById('pagination-prev');
    const nextButton = document.getElementById('pagination-next');
    
    // Update info text
    if (paginationInfo) {
        if (totalRecords === 0) {
            paginationInfo.textContent = 'Showing 0 - 0 of 0 records';
        } else {
            paginationInfo.textContent = `Showing ${startRecord} - ${endRecord} of ${totalRecords} records`;
        }
    }
    
    // Update Previous/Next buttons
    if (prevButton) {
        prevButton.disabled = currentPage === 1;
    }
    if (nextButton) {
        nextButton.disabled = currentPage >= totalPages;
    }
    
    // Update page numbers
    if (paginationPages) {
        paginationPages.innerHTML = '';
        if (totalPages === 0) return;
        
        // Show page numbers (max 7 pages visible)
        let startPage = Math.max(1, currentPage - 3);
        let endPage = Math.min(totalPages, currentPage + 3);
        
        // Adjust if we're near the start or end
        if (endPage - startPage < 6) {
            if (startPage === 1) {
                endPage = Math.min(totalPages, startPage + 6);
            } else {
                startPage = Math.max(1, endPage - 6);
            }
        }
        
        // First page
        if (startPage > 1) {
            const firstBtn = document.createElement('button');
            firstBtn.className = 'pagination-page-btn';
            firstBtn.textContent = '1';
            firstBtn.onclick = () => goToPage(1);
            paginationPages.appendChild(firstBtn);
            
            if (startPage > 2) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                paginationPages.appendChild(ellipsis);
            }
        }
        
        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = 'pagination-page-btn';
            if (i === currentPage) {
                pageBtn.classList.add('active');
            }
            pageBtn.textContent = i.toString();
            pageBtn.onclick = () => goToPage(i);
            paginationPages.appendChild(pageBtn);
        }
        
        // Last page
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                const ellipsis = document.createElement('span');
                ellipsis.className = 'pagination-ellipsis';
                ellipsis.textContent = '...';
                paginationPages.appendChild(ellipsis);
            }
            
            const lastBtn = document.createElement('button');
            lastBtn.className = 'pagination-page-btn';
            lastBtn.textContent = totalPages.toString();
            lastBtn.onclick = () => goToPage(totalPages);
            paginationPages.appendChild(lastBtn);
        }
    }
}

// Pagination navigation functions
window.goToPage = function(page) {
    const totalPages = Math.ceil(filteredRecordsForPagination.length / recordsPerPage);
    if (page >= 1 && page <= totalPages) {
        currentPage = page;
        displayViewUsersRecords(filteredRecordsForPagination);
    }
};

window.goToPreviousPage = function() {
    if (currentPage > 1) {
        currentPage--;
        displayViewUsersRecords(filteredRecordsForPagination);
    }
};

window.goToNextPage = function() {
    const totalPages = Math.ceil(filteredRecordsForPagination.length / recordsPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        displayViewUsersRecords(filteredRecordsForPagination);
    }
};

window.changeRecordsPerPage = function() {
    const select = document.getElementById('records-per-page');
    if (select) {
        recordsPerPage = parseInt(select.value, 10);
        currentPage = 1; // Reset to first page
        displayViewUsersRecords(filteredRecordsForPagination);
    }
};

// Store current viewing record NIC
let currentViewingRecordNIC = null;
let isEditMode = false;
let originalRecordData = null;

window.viewRecordDetails = function(nic) {
    console.log('viewRecordDetails called with NIC:', nic);
    currentViewingRecordNIC = nic;
    isEditMode = false; // Reset to view mode
    navigateToSection('view-user-details');
    // Use setTimeout to ensure the section is visible before loading content
    setTimeout(() => {
        console.log('Loading user details page for NIC:', nic);
        loadUserDetailsPage(nic, false);
    }, 100);
};

function loadUserDetailsPage(nic, editMode = false) {
    console.log('loadUserDetailsPage called with NIC:', nic, 'editMode:', editMode);
    console.log('Total records:', records.length);
    
    const record = records.find(r => r.nic && r.nic.trim() === nic.trim());
    if (!record) {
        console.error('Record not found for NIC:', nic);
        console.error('Available records:', records.map(r => ({ nic: r.nic, name: r.name })));
        const content = document.getElementById('view-user-details-page-content');
        if (content) {
            content.innerHTML = '<div style="padding: 40px; text-align: center; color: #999; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;"><p>Record not found.</p></div>';
        } else {
            console.error('Content element not found when trying to show error message');
        }
        return;
    }
    
    console.log('Record found:', record.name);
    
    const content = document.getElementById('view-user-details-page-content');
    if (!content) {
        console.error('Content element not found: view-user-details-page-content');
        console.error('Section element:', document.getElementById('view-user-details-section'));
        return;
    }
    
    console.log('Content element found, populating...');
    
    // Store original data for cancel (only when entering edit mode)
    if (editMode && !originalRecordData) {
        originalRecordData = JSON.parse(JSON.stringify(record));
    }
    
    if (editMode) {
        renderEditMode(record, content);
    } else {
        renderViewMode(record, content);
    }
    
    // Update button visibility
    updateViewPageButtons(editMode);
}

function renderViewMode(record, content) {
    const createdDate = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-';
    const updatedDate = record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '-';
    
    content.innerHTML = `
        <div class="view-details-grid">
            <div class="view-details-section">
                <h3 class="view-details-section-title">Personal Information</h3>
                <div class="detail-item">
                    <strong>Name:</strong> 
                    <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.name)}</span>
                </div>
                <div class="detail-item">
                    <strong>NIC:</strong> <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">${escapeHtml(record.nic)}</span>
                </div>
                <div class="detail-item">
                    <strong>Date of Birth:</strong> <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">${formatDate(record.dob)}</span>
                </div>
                <div class="detail-item">
                    <strong>Political Party ID:</strong> ${escapeHtml(record.politicalPartyId)}
                </div>
                <div class="detail-item">
                    <strong>Priority:</strong> ${record.priority}
                </div>
                <div class="detail-item">
                    <strong>Reg ID:</strong> ${escapeHtml(record.RegID || '-')}
                </div>
            </div>
            
            <div class="view-details-section">
                <h3 class="view-details-section-title">Contact Information</h3>
                <div class="detail-item">
                    <strong>Mobile 1:</strong> ${escapeHtml(record.mobile1 || '-')}
                </div>
                <div class="detail-item">
                    <strong>Mobile 2:</strong> ${escapeHtml(record.mobile2 || '-')}
                </div>
                <div class="detail-item">
                    <strong>WhatsApp:</strong> ${escapeHtml(record.whatsapp || '-')}
                </div>
                <div class="detail-item">
                    <strong>Home Number:</strong> ${escapeHtml(record.homeNumber || '-')}
                </div>
                <div class="detail-item" style="grid-column: span 2;">
                    <strong>Address:</strong> 
                    <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.address)}</span>
                </div>
            </div>
            
            <div class="view-details-section" style="grid-column: span 2;">
                <h3 class="view-details-section-title">Location Information</h3>
                <div class="view-details-location-grid">
                    <div class="detail-item">
                        <strong>Region:</strong> 
                        <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.region?.label || record.region?.value || record.region || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <strong>AGA Division:</strong> 
                        <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.agaDivision?.label || record.agaDivision?.value || record.agaDivision || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <strong>GS Division:</strong> 
                        <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.gsDivision?.label || record.gsDivision?.value || record.gsDivision || '-')}</span>
                    </div>
                    <div class="detail-item">
                        <strong>Pooling Booth:</strong> 
                        <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.poolingBooth?.label || record.poolingBooth?.value || record.poolingBooth || '-')}</span>
                    </div>
                </div>
            </div>
            
            ${record.communities && record.communities.length > 0 ? `
                <div class="view-details-section" style="grid-column: span 2;">
                    <h3 class="view-details-section-title">Communities</h3>
                    <div class="communities-display">
                        ${record.communities.map(community => 
                            `<span class="community-badge">${escapeHtml(community)}</span>`
                        ).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${record.connectivity ? `
                <div class="view-details-section" style="grid-column: span 2;">
                    <h3 class="view-details-section-title">Connectivity</h3>
                    <div class="detail-item">
                        <span style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.connectivity)}</span>
                    </div>
                </div>
            ` : ''}
            
            <div class="view-details-section" style="grid-column: span 2; border-top: 2px solid #e0e0e0; padding-top: 15px; margin-top: 10px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.85rem; color: #888;">
                    <div><strong>Created:</strong> ${createdDate}</div>
                    <div><strong>Last Updated:</strong> ${updatedDate}</div>
                </div>
            </div>
        </div>
    `;
    
    // Update edit button to use the current record NIC
    const editBtn = document.getElementById('edit-from-view-btn');
    if (editBtn) {
        editBtn.setAttribute('data-record-nic', record.nic);
    }
    
    console.log('User details page loaded successfully');
}

function renderEditMode(record, content) {
    const createdDate = record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-';
    const updatedDate = record.updatedAt ? new Date(record.updatedAt).toLocaleDateString() : '-';
    
    // Store record ID for saving
    content.innerHTML = `
        <input type="hidden" id="view-edit-record-id" value="${record.id}">
        <input type="hidden" id="view-edit-record-nic" value="${escapeHtml(record.nic)}">
        
        <div class="view-details-grid">
            <div class="view-details-section">
                <h3 class="view-details-section-title">Personal Information</h3>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Name:</label>
                    <input type="text" id="view-edit-name" name="name" value="${escapeHtml(record.name)}" required
                        style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">NIC:</label>
                    <input type="text" id="view-edit-nic" name="nic" value="${escapeHtml(record.nic)}" required readonly
                        style="background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Date of Birth:</label>
                    <input type="date" id="view-edit-dob" name="dob" value="${record.dob}" required>
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Political Party ID:</label>
                    <input type="text" id="view-edit-politicalPartyId" name="politicalPartyId" value="${escapeHtml(record.politicalPartyId)}" pattern="\\d{6}" required>
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Priority:</label>
                    <select id="view-edit-priority" name="priority" required>
                        <option value="1" ${record.priority === '1' ? 'selected' : ''}>1</option>
                        <option value="2" ${record.priority === '2' ? 'selected' : ''}>2</option>
                        <option value="3" ${record.priority === '3' ? 'selected' : ''}>3</option>
                        <option value="4" ${record.priority === '4' ? 'selected' : ''}>4</option>
                        <option value="5" ${record.priority === '5' ? 'selected' : ''}>5</option>
                    </select>
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Reg ID:</label>
                    <input type="text" id="view-edit-regid" value="${escapeHtml(record.RegID || '-')}" readonly
                        style="background: #f5f5f5;">
                </div>
            </div>
            
            <div class="view-details-section">
                <h3 class="view-details-section-title">Contact Information</h3>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Mobile 1:</label>
                    <input type="tel" id="view-edit-mobile1" name="mobile1" value="${escapeHtml(record.mobile1 || '')}">
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Mobile 2:</label>
                    <input type="tel" id="view-edit-mobile2" name="mobile2" value="${escapeHtml(record.mobile2 || '')}">
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">WhatsApp:</label>
                    <input type="tel" id="view-edit-whatsapp" name="whatsapp" value="${escapeHtml(record.whatsapp || '')}">
                </div>
                <div class="form-group">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Home Number:</label>
                    <input type="tel" id="view-edit-homeNumber" name="homeNumber" value="${escapeHtml(record.homeNumber || '')}">
                </div>
                <div class="form-group" style="grid-column: span 2;">
                    <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Address:</label>
                    <textarea id="view-edit-address" name="address" rows="3" required
                        style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.address)}</textarea>
                </div>
            </div>
            
            <div class="view-details-section" style="grid-column: span 2;">
                <h3 class="view-details-section-title">Location Information</h3>
                <div class="view-details-location-grid">
                    <div class="form-group">
                        <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Region:</label>
                        <select id="view-edit-region" name="region" required
                            style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">
                            <option value="">wdikh f;darkak</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">AGA Division:</label>
                        <select id="view-edit-agaDivision" name="agaDivision" required
                            style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">
                            <option value="">m%dfoaYSh f,alï ld¾hd,h f;darkak</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">GS Division:</label>
                        <select id="view-edit-gsDivision" name="gsDivision" required
                            style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">
                            <option value="">.%dufiajd jiu f;darkak</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">Pooling Booth:</label>
                        <select id="view-edit-poolingBooth" name="poolingBooth" required
                            style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">
                            <option value="">Pkao uOHia:dkh wxlh f;darkak</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="view-details-section" style="grid-column: span 2;">
                <h3 class="view-details-section-title">Communities</h3>
                <div class="communities-container">
                    <input type="text" id="view-edit-community-input" list="view-edit-community-suggestions"
                        placeholder="idudðl;ajhka">
                    <datalist id="view-edit-community-suggestions"></datalist>
                    <div id="view-edit-selected-communities" class="selected-communities"></div>
                </div>
            </div>
            
            <div class="view-details-section" style="grid-column: span 2;">
                <h3 class="view-details-section-title">Connectivity</h3>
                <div class="form-group">
                    <textarea id="view-edit-connectivity" name="connectivity" rows="2"
                        style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(record.connectivity || '')}</textarea>
                </div>
            </div>
            
            <div class="view-details-section" style="grid-column: span 2; border-top: 2px solid #e0e0e0; padding-top: 15px; margin-top: 10px;">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; font-size: 0.85rem; color: #888;">
                    <div><strong>Created:</strong> ${createdDate}</div>
                    <div><strong>Last Updated:</strong> ${updatedDate}</div>
                </div>
            </div>
        </div>
    `;
    
    // Populate dropdowns
    setTimeout(() => {
        populateViewEditDropdowns(record);
        setupViewEditCommunities(record);
    }, 50);
}

function populateViewEditDropdowns(record) {
    // Populate region
    const regionSelect = document.getElementById('view-edit-region');
    if (regionSelect) {
        populateSelect('view-edit-region', region);
        const regionValue = record.region?.value || record.region || '';
        if (regionValue) {
            regionSelect.value = regionValue;
        }
    }
    
    // Populate AGA Division
    const agaSelect = document.getElementById('view-edit-agaDivision');
    if (agaSelect) {
        populateSelect('view-edit-agaDivision', agaOptions);
        const agaValue = record.agaDivision?.value || record.agaDivision || '';
        if (agaValue) {
            agaSelect.value = agaValue;
        }
    }
    
    // Populate GS Division
    const gsSelect = document.getElementById('view-edit-gsDivision');
    if (gsSelect) {
        populateSelect('view-edit-gsDivision', gsOptions);
        const gsValue = record.gsDivision?.value || record.gsDivision || '';
        if (gsValue) {
            gsSelect.value = gsValue;
        }
    }
    
    // Populate Pooling Booth
    const poolingSelect = document.getElementById('view-edit-poolingBooth');
    if (poolingSelect) {
        populateSelect('view-edit-poolingBooth', poolingOptions);
        const poolingValue = record.poolingBooth?.value || record.poolingBooth || '';
        if (poolingValue) {
            poolingSelect.value = poolingValue;
        }
    }
}

let viewEditSelectedCommunities = [];

function setupViewEditCommunities(record) {
    viewEditSelectedCommunities = [...(record.communities || [])];
    updateCommunitiesDisplay('view-edit-selected-communities', viewEditSelectedCommunities);
    
    // Setup community input handler
    const communityInput = document.getElementById('view-edit-community-input');
    if (communityInput) {
        // Remove existing listeners by cloning
        const newInput = communityInput.cloneNode(true);
        communityInput.parentNode.replaceChild(newInput, communityInput);
        
        newInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const communityName = this.value.trim();
                if (communityName && !viewEditSelectedCommunities.includes(communityName)) {
                    viewEditSelectedCommunities.push(communityName);
                    updateCommunitiesDisplay('view-edit-selected-communities', viewEditSelectedCommunities);
                    this.value = '';
                }
            }
        });
    }
    
    // Update community suggestions
    const datalist = document.getElementById('view-edit-community-suggestions');
    if (datalist) {
        const allCommunities = [...communities.map(c => c.name), ...records.flatMap(r => r.communities || [])];
        const uniqueCommunities = [...new Set(allCommunities)];
        datalist.innerHTML = uniqueCommunities.map(c => `<option value="${escapeHtml(c)}"></option>`).join('');
    }
}

window.removeViewEditCommunity = function(communityName) {
    viewEditSelectedCommunities = viewEditSelectedCommunities.filter(c => c !== communityName);
    updateCommunitiesDisplay('view-edit-selected-communities', viewEditSelectedCommunities);
};

function updateViewPageButtons(editMode) {
    const editBtn = document.getElementById('edit-from-view-btn');
    const saveBtn = document.getElementById('save-view-btn');
    const cancelBtn = document.getElementById('cancel-view-btn');
    
    if (editMode) {
        if (editBtn) editBtn.style.display = 'none';
        if (saveBtn) saveBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'inline-block';
    } else {
        if (editBtn) editBtn.style.display = 'inline-block';
        if (saveBtn) saveBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
    }
}

window.toggleEditMode = function() {
    if (!currentViewingRecordNIC) return;
    
    isEditMode = true;
    loadUserDetailsPage(currentViewingRecordNIC, true);
};

window.cancelEditMode = function() {
    if (!currentViewingRecordNIC || !originalRecordData) return;
    
    isEditMode = false;
    originalRecordData = null;
    viewEditSelectedCommunities = [];
    loadUserDetailsPage(currentViewingRecordNIC, false);
};

window.saveFromViewPage = function() {
    if (!currentViewingRecordNIC) return;
    
    const currentNic = document.getElementById('view-edit-record-nic')?.value?.trim();
    if (!currentNic) {
        showMessage('Error: Record NIC not found', 'error');
        return;
    }
    
    // Get form values
    const data = {
        name: document.getElementById('view-edit-name')?.value.trim() || '',
        nic: document.getElementById('view-edit-nic')?.value.trim() || '',
        dob: document.getElementById('view-edit-dob')?.value || '',
        politicalPartyId: document.getElementById('view-edit-politicalPartyId')?.value.trim() || '',
        priority: document.getElementById('view-edit-priority')?.value || '',
        mobile1: document.getElementById('view-edit-mobile1')?.value.trim() || '',
        mobile2: document.getElementById('view-edit-mobile2')?.value.trim() || '',
        whatsapp: document.getElementById('view-edit-whatsapp')?.value.trim() || '',
        homeNumber: document.getElementById('view-edit-homeNumber')?.value.trim() || '',
        address: document.getElementById('view-edit-address')?.value.trim() || '',
        connectivity: document.getElementById('view-edit-connectivity')?.value.trim() || '',
        region: document.getElementById('view-edit-region')?.value || '',
        agaDivision: document.getElementById('view-edit-agaDivision')?.value || '',
        gsDivision: document.getElementById('view-edit-gsDivision')?.value || '',
        poolingBooth: document.getElementById('view-edit-poolingBooth')?.value || ''
    };
    
    // Validate required fields
    if (!data.name || !data.nic || !data.address || !data.dob || !data.politicalPartyId || 
        !data.region || !data.agaDivision || !data.gsDivision || !data.poolingBooth) {
        showMessage('Please fill in all required fields', 'error');
        return;
    }
    
    // Validate NIC format
    if (data.nic.length < 9) {
        showMessage('NIC must be at least 9 characters long', 'error');
        return;
    }
    
    // Check for duplicate NIC (excluding current record)
    const nicTrimmed = data.nic.trim();
    const duplicateNIC = records.find(record => {
        const recordNic = record.nic?.trim();
        return recordNic && recordNic === nicTrimmed && recordNic !== currentNic;
    });
    if (duplicateNIC) {
        showMessage('This NIC number already exists. Please use a different NIC.', 'error');
        return;
    }
    
    // Validate Political Party ID format
    if (!/^\d{6}$/.test(data.politicalPartyId)) {
        showMessage('Political Party ID must be exactly 6 digits', 'error');
        return;
    }
    
    // Get location info objects
    const regionSelect = document.getElementById('view-edit-region');
    const regionValue = data.region;
    const regionInfo = findOptionByValue(region, regionValue) || (regionSelect ? {
        value: regionValue,
        label: regionSelect.options[regionSelect.selectedIndex]?.textContent.trim() || regionValue
    } : null);

    const agaSelect = document.getElementById('view-edit-agaDivision');
    const agaValue = data.agaDivision;
    const agaInfo = findOptionByValue(agaOptions, agaValue) || (agaSelect ? {
        value: agaValue,
        label: agaSelect.options[agaSelect.selectedIndex]?.textContent.trim() || agaValue
    } : null);

    const gsSelect = document.getElementById('view-edit-gsDivision');
    const gsValue = data.gsDivision;
    const gsInfo = findOptionByValue(gsOptions, gsValue) || (gsSelect ? {
        value: gsValue,
        label: gsSelect.options[gsSelect.selectedIndex]?.textContent.trim() || gsValue
    } : null);

    const poolingSelect = document.getElementById('view-edit-poolingBooth');
    const poolingValue = data.poolingBooth;
    const poolingInfo = findOptionByValue(poolingOptions, poolingValue) || (poolingSelect ? {
        value: poolingValue,
        label: poolingSelect.options[poolingSelect.selectedIndex]?.textContent.trim() || poolingValue
    } : null);
    
    // Find and update record
    const recordIndex = records.findIndex(record => record.nic && record.nic.trim() === currentNic);
    if (recordIndex === -1) {
        showMessage('Error: Record not found', 'error');
        return;
    }
    
    records[recordIndex] = {
        ...records[recordIndex],
        name: data.name,
        nic: data.nic,
        mobile1: data.mobile1,
        mobile2: data.mobile2,
        whatsapp: data.whatsapp,
        homeNumber: data.homeNumber,
        address: data.address,
        dob: data.dob,
        politicalPartyId: data.politicalPartyId,
        region: regionInfo,
        agaDivision: agaInfo,
        gsDivision: gsInfo,
        poolingBooth: poolingInfo,
        priority: data.priority,
        connectivity: data.connectivity,
        communities: [...viewEditSelectedCommunities],
        updatedAt: new Date().toISOString(),
        RegID: records[recordIndex].RegID || generateRegId(regionInfo, gsInfo)
    };
    
    saveRecords();
    updateStatistics();
    updateCommunitySuggestions();
    
    // Reload view details page in view mode
    isEditMode = false;
    originalRecordData = null;
    viewEditSelectedCommunities = [];
    loadUserDetailsPage(currentViewingRecordNIC, false);
    
    // Reload view if we're in view-users section
    if (document.getElementById('view-users-section').style.display !== 'none') {
        if (typeof window.applyFiltersAndSearch === 'function') {
            window.applyFiltersAndSearch();
        } else {
            displayViewUsersRecords(records);
        }
    }
    
    showMessage('Record updated successfully', 'success');
};

window.closeViewDetailsModal = function() {
    document.getElementById('view-details-modal').style.display = 'none';
};


// Community Management Functions
async function loadCommunities() {
    try {
        communities = await ipcRenderer.invoke('read-data', 'communities.json');
        communities = communities.map(community => normaliseCommunity(community));
        displayCommunities();
    } catch (error) {
        console.error('Error loading communities:', error);
        communities = [];
        displayCommunities();
    }
}

async function saveCommunities() {
    try {
        const success = await ipcRenderer.invoke('write-data', 'communities.json', communities);
        if (success) {
            console.log(`Saved ${communities.length} communities successfully`);
        }
    } catch (error) {
        console.error('Error saving communities:', error);
        showMessage('Error saving communities', 'error');
    }
}

function displayCommunities() {
    const container = document.getElementById('communities-list-container');
    if (!container) return;
    
    if (communities.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">No communities added yet.</p>';
        updateCommunitySuggestions();
        return;
    }
    
    // Display communities in a table
    container.innerHTML = `
        <div style="overflow-x: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Community Name</th>
                        <th>AGA Division</th>
                        <th>GS Division</th>
                        <th>Created At</th>
                    </tr>
                </thead>
                <tbody>
                    ${communities.map(community => `
                        <tr>
                            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(community.name)}</td>
                            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(community.agaDivision?.label || community.agaDivision?.value || community.region?.label || community.region?.value || '-')}</td>
                            <td style="font-family: 'FM Malithi', 'Malithi Web', 'Iskoola Pota', 'Noto Sans Sinhala', sans-serif;">${escapeHtml(community.gsDivision?.label || community.gsDivision?.value || '-')}</td>
                            <td style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;">${formatDate(community.createdAt)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    updateCommunitySuggestions();
}

function openAddCommunityModal() {
    document.getElementById('add-community-modal').style.display = 'flex';
    populateCommunityDropdowns();
}

function closeAddCommunityModal() {
    document.getElementById('add-community-modal').style.display = 'none';
    document.getElementById('add-community-form').reset();
}

function populateCommunityDropdowns() {
    // Populate AG Division dropdown (using agaOptions from main form)
    const agaSelect = document.getElementById('community-region');
    if (agaSelect) {
        agaSelect.innerHTML = '<option value="">m%dfoaYSh f,alï ld¾hd,h f;darkak</option>';
        agaOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            agaSelect.appendChild(optionElement);
        });
    }
    
    // Populate GS Division dropdown (using gsOptions from main form)
    const gsSelect = document.getElementById('community-gsDivision');
    if (gsSelect) {
        gsSelect.innerHTML = '<option value="">.%dufiajd jiu f;darkak</option>';
        gsOptions.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            gsSelect.appendChild(optionElement);
        });
    }
}

function handleAddCommunity(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    const newCommunity = normaliseCommunity({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        name: data.communityName.trim(),
        agaDivision: data.agaDivision,
        gsDivision: data.gsDivision,
        createdAt: new Date().toISOString()
    });
    
    communities.push(newCommunity);
    saveCommunities();
    displayCommunities();
    closeAddCommunityModal();
    showMessage('Community added successfully', 'success');
}

function updateCommunitySuggestions() {
    const addDatalist = document.getElementById('community-suggestions');
    const editDatalist = document.getElementById('edit-community-suggestions');
    
    const suggestions = new Set();
    communities.forEach(community => {
        if (community.name) suggestions.add(community.name);
    });
    records.forEach(record => {
        (record.communities || []).forEach(name => suggestions.add(name));
    });

    const optionsMarkup = Array.from(suggestions)
        .map(name => `<option value="${escapeHtml(name)}"></option>`)
        .join('');
    
    if (addDatalist) {
        addDatalist.innerHTML = optionsMarkup;
    }
    
    if (editDatalist) {
        editDatalist.innerHTML = optionsMarkup;
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const editModal = document.getElementById('edit-modal');
    const viewModal = document.getElementById('view-details-modal');
    const addCommunityModal = document.getElementById('add-community-modal');
    const pdfFieldSelectionModal = document.getElementById('pdf-field-selection-modal');
    if (e.target === editModal) {
        window.closeEditModal();
    }
    if (e.target === viewModal) {
        window.closeViewDetailsModal();
    }
    if (e.target === addCommunityModal) {
        closeAddCommunityModal();
    }
    if (e.target === pdfFieldSelectionModal) {
        window.closePdfFieldSelection();
    }
});
