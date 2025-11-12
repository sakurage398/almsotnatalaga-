document.addEventListener("DOMContentLoaded", function () {
    const adminMenu = document.querySelector(".admin-menu");
    const dropdown = document.querySelector(".dropdown");
    const logoutBtn = document.querySelector(".logout-btn");
    const modal = document.querySelector(".modal");
    const yesBtn = document.querySelector(".yes-btn");
    const noBtn = document.querySelector(".no-btn");
    const videoElement = document.getElementById('video');
    const canvasElement = document.getElementById('canvas');
    const canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });
    const scanResult = document.getElementById('scan-result');
    const scanDetails = document.getElementById('scan-details');
    
    let scanning = true;
    let currentScanInProgress = false;
    let recentScans = [];
    let lastScanTime = {};
    let lastScannedCode = null;
    let scanDebounceTimer = null;
    let warningToastShown = false;
    let scanCooldownTimers = {};
    const SCAN_COOLDOWN = 60000;
    const MAX_RECENT_SCANS = 10;
    const SCAN_DEBOUNCE = 1000;
    const SCAN_RESET_DELAY = 1500;

    function loadLastScanTime() {
        const saved = localStorage.getItem('lastScanTime');
        if (saved) {
            try {
                lastScanTime = JSON.parse(saved);
            } catch (e) {
                lastScanTime = {};
            }
        }
    }

    function saveLastScanTime() {
        try {
            localStorage.setItem('lastScanTime', JSON.stringify(lastScanTime));
        } catch (e) {
            clearOldStorageData();
        }
    }

    function cleanupOldScanTimes() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        
        for (const qrCode in lastScanTime) {
            if (lastScanTime[qrCode] < oneDayAgo) {
                delete lastScanTime[qrCode];
            }
        }
        saveLastScanTime();
    }

    function clearOldStorageData() {
        try {
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);
            let count = 0;
            
            for (const qrCode in lastScanTime) {
                if (lastScanTime[qrCode] < oneHourAgo && count < 10) {
                    delete lastScanTime[qrCode];
                    count++;
                }
            }
            localStorage.setItem('lastScanTime', JSON.stringify(lastScanTime));
        } catch (e) {}
    }

    adminMenu.addEventListener("click", function (event) {
        event.stopPropagation();
        dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", function () {
        dropdown.style.display = "none";
    });
    
    logoutBtn.addEventListener("click", function () {
        modal.style.display = "flex";
    });

    yesBtn.addEventListener("click", function () {
        window.location.href = "login.html";
    });

    noBtn.addEventListener("click", function () {
        modal.style.display = "none";
    });

    function showToast(message, type = 'success') {
        const toastContainer = document.querySelector('.toast-container');
        const toastId = 'toast-' + Date.now();
        
        const toastHTML = `
            <div id="${toastId}" class="toast align-items-center text-white bg-${type} border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="fas ${getToastIcon(type)} me-2"></i>
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        
        toastContainer.insertAdjacentHTML('beforeend', toastHTML);
        
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 2000
        });
        
        toast.show();
        
        toastElement.addEventListener('hidden.bs.toast', function () {
            toastElement.remove();
        });
    }

    function getToastIcon(type) {
        switch(type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            case 'info': return 'fa-info-circle';
            default: return 'fa-bell';
        }
    }

    function canScanAgain(qrCode) {
        const now = Date.now();
        if (!lastScanTime[qrCode]) {
            return true;
        }
        
        const timeSinceLastScan = now - lastScanTime[qrCode];
        return timeSinceLastScan >= SCAN_COOLDOWN;
    }

    function updateLastScanTime(qrCode) {
        lastScanTime[qrCode] = Date.now();
        saveLastScanTime();
        
        if (scanCooldownTimers[qrCode]) {
            clearTimeout(scanCooldownTimers[qrCode]);
        }
        
        scanCooldownTimers[qrCode] = setTimeout(() => {
            delete lastScanTime[qrCode];
            delete scanCooldownTimers[qrCode];
            saveLastScanTime();
        }, SCAN_COOLDOWN);
    }

    function resetScanInterface() {
        if (scanDebounceTimer) {
            clearTimeout(scanDebounceTimer);
            scanDebounceTimer = null;
        }
        
        warningToastShown = false;
        
        setTimeout(() => {
            scanResult.textContent = "Ready for next scan";
            scanResult.className = "mb-1 text-dark";
            scanDetails.textContent = "Position QR code in camera view";
            lastScannedCode = null;
        }, SCAN_RESET_DELAY);
    }

    async function initializeCamera() {
        try {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                throw new Error('Media devices not supported in this browser');
            }
            
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });
            
            videoElement.srcObject = stream;
            videoElement.play();
            
            videoElement.onloadedmetadata = () => {
                canvasElement.width = videoElement.videoWidth;
                canvasElement.height = videoElement.videoHeight;
                requestAnimationFrame(scanQRCode);
            };
            
        } catch (error) {
            showToast(`Camera error: ${error.message}`, 'error');
            
            try {
                const fallbackStream = await navigator.mediaDevices.getUserMedia({ 
                    video: true 
                });
                videoElement.srcObject = fallbackStream;
                videoElement.play();
                
                videoElement.onloadedmetadata = () => {
                    canvasElement.width = videoElement.videoWidth;
                    canvasElement.height = videoElement.videoHeight;
                    requestAnimationFrame(scanQRCode);
                };
                
                showToast("Camera started with default settings", 'info');
            } catch (fallbackError) {
                showToast("Camera cannot be accessed. Please check permissions.", 'error');
            }
        }
    }

    function initializeAutoReset() {
        checkAndResetAtMidnight();
        setInterval(checkAndResetAtMidnight, 60000);
    }

    function checkAndResetAtMidnight() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        if (currentHour === 0 && currentMinute === 0) {
            resetRecentScans();
        }
    }

    function resetRecentScans() {
        recentScans = [];
        localStorage.removeItem('recentScans');
        
        lastScanTime = {};
        localStorage.removeItem('lastScanTime');
        
        for (const timerId in scanCooldownTimers) {
            clearTimeout(scanCooldownTimers[timerId]);
        }
        scanCooldownTimers = {};
        
        updateRecentScansDisplay();
        showToast('Recent scans have been reset for the day', 'info');
    }

    function addToRecentScans(memberData, memberType) {
        const now = new Date();

        const scanData = {
            id: memberData[memberType + '_number'],
            name: memberData.name,
            timestamp: now.toISOString(),
            type: memberType
        };
        
        recentScans.unshift(scanData);
        
        try {
            localStorage.setItem('recentScans', JSON.stringify(recentScans));
        } catch (e) {
            console.error('Error saving to localStorage:', e);
           
            while (recentScans.length > 20 && e.name === 'QuotaExceededError') {
                recentScans.pop();
            }
            try {
                localStorage.setItem('recentScans', JSON.stringify(recentScans));
            } catch (e2) {
                console.error('Failed to save after cleanup:', e2);
            }
        }
        
        updateRecentScansDisplay();
        return true;
    }

    function updateRecentScansDisplay() {
        const container = document.getElementById('scanned-users');
        container.innerHTML = '';
        
        const scansToShow = recentScans.slice(0, 5);
        const extraScans = Math.max(0, recentScans.length - 5);
        
        if (recentScans.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.className = 'scanned-user-avatar empty-message';
            emptyMessage.textContent = '0';
            emptyMessage.title = 'No recent scans';
            container.appendChild(emptyMessage);
        } else {
            scansToShow.forEach(scan => {
                const avatar = document.createElement('div');
                avatar.className = 'scanned-user-avatar';
           
                const initials = scan.name.split(' ').map(n => n[0]).join('').toUpperCase();
                avatar.textContent = initials.length > 2 ? initials.substring(0, 2) : initials;
                
                avatar.title = scan.name;
                container.appendChild(avatar);
            });
            
            if (extraScans > 0) {
                const moreElement = document.createElement('div');
                moreElement.className = 'scanned-user-avatar more-count';
                moreElement.textContent = `+${extraScans}`;
                moreElement.title = `${extraScans} more scanned users`;
                container.appendChild(moreElement);
            }
        }
    }

    function debugRecentScans() {
            console.log('Current recentScans:', recentScans);
            console.log('LocalStorage recentScans:', localStorage.getItem('recentScans'));
            console.log('Recent scans length:', recentScans.length);
        }

       
        function loadRecentScans() {
            try {
                const savedScans = localStorage.getItem('recentScans');
                console.log('Loading from localStorage:', savedScans);
                if (savedScans) {
                    recentScans = JSON.parse(savedScans);
                    console.log('Parsed recentScans:', recentScans);
                } else {
                    recentScans = [];
                }
            } catch (e) {
                console.error('Error loading recent scans:', e);
                recentScans = [];
            }
            
            loadLastScanTime();
            cleanupOldScanTimes();
            
            initializeAutoReset();
            updateRecentScansDisplay();
            
          
            debugRecentScans();
        }
   
    function loadRecentScans() {
        try {
            const savedScans = localStorage.getItem('recentScans');
            if (savedScans) {
                recentScans = JSON.parse(savedScans);
            } else {
                recentScans = [];
            }
        } catch (e) {
            console.error('Error loading recent scans:', e);
            recentScans = [];
        }
        
        loadLastScanTime();
        cleanupOldScanTimes();
        
        initializeAutoReset();
        updateRecentScansDisplay();
    }

    loadRecentScans();

    function displayUserData(memberType, memberData) {
        document.getElementById('scan-prompt').classList.add('hidden');
        document.getElementById('user-details-section').classList.remove('hidden');
        
        document.querySelector('.recently-scanned').style.display = 'block';

        document.getElementById('user-name').textContent = memberData.name || 'N/A';
        document.getElementById('user-id').textContent = memberData[memberType + '_number'] || 'N/A';
        document.getElementById('user-department').textContent = memberData.department || 'N/A';
        
        if (memberType === 'student') {
            document.getElementById('user-program').textContent = `${memberData.program || 'N/A'} - ${memberData.year_level || 'N/A'} (${memberData.block || 'N/A'})`;
        } else if (memberType === 'faculty') {
            document.getElementById('user-program').textContent = memberData.program || 'N/A';
        } else {
            document.getElementById('user-program').textContent = memberData.role || 'N/A';
        }

        const statusElement = document.getElementById('user-status');
        statusElement.textContent = memberData.registration_status || 'Unknown';
        statusElement.className = 'status-badge ' + 
            (memberData.registration_status === 'Registered' ? 'bg-success' : 'bg-warning text-dark');

        const profilePic = document.getElementById('profile-picture');
        const noPic = document.getElementById('no-picture');
        
        if (memberData.picture && memberData.picture.trim() !== '') {
            profilePic.src = memberData.picture;
            profilePic.style.display = 'block';
            noPic.style.display = 'none';
        } else {
            profilePic.style.display = 'none';
            noPic.style.display = 'flex';
        }

        fetchAttendanceRecords(memberType, memberData[memberType + '_number']);
    }

    function fetchAttendanceRecords(memberType, memberNumber) {
        $.ajax({
            url: 'PHP/fetch_attendance.php',
            type: 'POST',
            data: {
                idNumber: memberNumber,
                userType: memberType
            },
            dataType: 'json',
            success: function(data) {
                if (data.success) {
                    const tbody = document.getElementById('attendance-data');
                    tbody.innerHTML = '';

                    data.attendance.forEach(record => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
                            <td>${record.time_in || '-'}</td>
                            <td>${record.time_out || '-'}</td>
                            <td>${record.log_date}</td>
                        `;
                        tbody.appendChild(row);
                    });
                }
            },
            error: function(xhr, status, error) {}
        });
    }

    function processScan(code) {
        if (currentScanInProgress) {
            return;
        }
        
        currentScanInProgress = true;
        lastScannedCode = code;

        scanResult.textContent = "Scanning...";
        scanResult.className = "mb-1 text-info";
        scanDetails.textContent = "";
        
        const currentDate = new Date().toISOString().split('T')[0];
        
        $.ajax({
            url: 'PHP/process_scan.php',
            type: 'POST',
            data: {
                qrCode: code,
                scanDate: currentDate
            },
            dataType: 'json',
            success: function(data) {
                if (data.success) {
                    const memberType = data.memberType;
                    const memberData = data.data;
                    
                    const currentTime = new Date();
                    const formattedTime = currentTime.toLocaleTimeString('en-US', {
                        hour: 'numeric', 
                        minute: '2-digit',
                        hour12: true
                    });
                    const formattedDate = currentTime.toLocaleDateString('en-US');
                    
                    scanResult.textContent = `Scanned Successfully: ${memberType.charAt(0).toUpperCase() + memberType.slice(1)}`;
                    scanResult.className = "mb-1 text-success";
                    scanDetails.textContent = `ID: ${code} - Time ${data.timeType}: ${formattedTime} - Date: ${formattedDate}`;
                    
                    showToast(`Attendance recorded for ${memberData.name} (${data.timeType})`, 'success');
                    
                    if (data.timeType === 'In') {
                        updateLastScanTime(code);
                    } else if (data.timeType === 'Out') {
                        updateLastScanTime(code);
                        setTimeout(() => {
                            delete lastScanTime[code];
                            saveLastScanTime();
                        }, 60000);
                    }
                    
                    addToRecentScans(memberData, memberType);
                    displayUserData(memberType, memberData);
                    
                } else {
                    if (data.cooldown) {
                        const now = Date.now();
                        const timeSinceLastScan = now - lastScanTime[code];
                        const remainingTime = Math.ceil((SCAN_COOLDOWN - timeSinceLastScan) / 1000);
                        
                        scanResult.textContent = "Please wait before scanning again";
                        scanResult.className = "mb-1 text-warning";
                        scanDetails.textContent = `Wait ${remainingTime} seconds`;
                        
                        showToast(`Please wait ${remainingTime} seconds before scanning again`, 'warning');
                    } else {
                        document.querySelector('.recently-scanned').style.display = 'block';
                        
                        if (data.memberType) {
                            const memberType = data.memberType.charAt(0).toUpperCase() + data.memberType.slice(1);
                            scanResult.textContent = `${memberType} QR Code Not Registered`;
                            scanDetails.textContent = data.message;
                            
                            showToast("QR code not registered. Contact administrator.", 'danger');
                        } else {
                            scanResult.textContent = data.message || "No record found";
                            showToast(data.message || "Scan failed", 'error');
                        }
                        
                        scanResult.className = "mb-1 text-danger";
                    }
                }
                
                currentScanInProgress = false;
                resetScanInterface();
            },
            error: function(xhr, status, error) {
                scanResult.textContent = "Server Error";
                scanResult.className = "mb-1 text-danger";
                scanDetails.textContent = "Please check server logs";
                
                showToast("Server error occurred", 'error');
                
                currentScanInProgress = false;
                resetScanInterface();
            }
        });
    }

    function scanQRCode() {
        if (!scanning) return;
        
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
            const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
            
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert"
            });
            
            if (code && /^\d{8}$/.test(code.data)) {
                if (code.data === lastScannedCode && currentScanInProgress) {
                    requestAnimationFrame(scanQRCode);
                    return;
                }
                
                if (scanDebounceTimer) {
                    clearTimeout(scanDebounceTimer);
                }
                
                if (!canScanAgain(code.data)) {
                    const now = Date.now();
                    const timeSinceLastScan = now - lastScanTime[code.data];
                    const remainingTime = Math.ceil((SCAN_COOLDOWN - timeSinceLastScan) / 1000);
                    
                    scanResult.textContent = "Please wait before scanning again";
                    scanResult.className = "mb-1 text-warning";
                    scanDetails.textContent = `Wait ${remainingTime} seconds`;
                    
                    if (!warningToastShown) {
                        showToast(`Please wait ${remainingTime} seconds`, 'warning');
                        warningToastShown = true;
                        
                        setTimeout(() => {
                            warningToastShown = false;
                        }, 2000);
                    }
                    
                    scanDebounceTimer = setTimeout(() => {
                        scanResult.textContent = "Ready for next scan";
                        scanResult.className = "mb-1 text-dark";
                        scanDetails.textContent = "";
                        lastScannedCode = null;
                        warningToastShown = false;
                    }, 2000);
                    
                    requestAnimationFrame(scanQRCode);
                    return;
                }
                
                warningToastShown = false;
                processScan(code.data);
                
                scanDebounceTimer = setTimeout(() => {
                    lastScannedCode = null;
                }, SCAN_DEBOUNCE);
            } else {
                warningToastShown = false;
            }
        }
        
        requestAnimationFrame(scanQRCode);
    }

    initializeCamera();
});