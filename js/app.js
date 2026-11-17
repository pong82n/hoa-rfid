// SFSPh1 Homeowners Association - Core Application Logic
// Author: SFSPh1 HOA IT & Security Committee

class SFSHOAApp {
    constructor() {
        this.STORAGE_KEY = 'sfsph1_hoa_data_v1';
        this.state = {
            community: null,
            vehicles: [],
            gateLogs: [],
            activeFilter: 'all',
            searchQuery: '',
            selectedVehicleForDecal: null,
            audioEnabled: true
        };

        this.audioCtx = null;
        this.init();
    }

    init() {
        this.loadData();
        this.initAudio();
        this.initEventListeners();
        this.renderStats();
        this.renderVehiclesTable();
        this.renderGateLogs();
        this.renderRegistrationQRCode();
        this.populateGateSimulatorDropdown();
        this.checkUrlForAction();
    }

    // Initialize or load from LocalStorage
    loadData() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                this.state.community = parsed.community || SFS_INITIAL_DATA.community;
                this.state.vehicles = parsed.vehicles || SFS_INITIAL_DATA.vehicles;
                this.state.gateLogs = parsed.gateLogs || SFS_INITIAL_DATA.gateLogs;
                return;
            } catch (e) {
                console.warn('Failed parsing stored HOA data, loading defaults.', e);
            }
        }
        // Fallback to initial seed data
        this.state.community = SFS_INITIAL_DATA.community;
        this.state.vehicles = JSON.parse(JSON.stringify(SFS_INITIAL_DATA.vehicles));
        this.state.gateLogs = JSON.parse(JSON.stringify(SFS_INITIAL_DATA.gateLogs));
        this.saveData();
    }

    saveData() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            community: this.state.community,
            vehicles: this.state.vehicles,
            gateLogs: this.state.gateLogs
        }));
    }

    // Audio synthesizer for RFID scanner & gate chimes
    initAudio() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.audioCtx = new AudioContext();
            }
        } catch (e) {
            console.log('Web Audio not supported or blocked');
        }
    }

    playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
        if (!this.state.audioEnabled) return;
        try {
            if (!this.audioCtx) this.initAudio();
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            if (!this.audioCtx) return;

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

            gain.gain.setValueAtTime(gainVal, this.audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            osc.start();
            osc.stop(this.audioCtx.currentTime + duration);
        } catch (err) {
            // Audio error silenced
        }
    }

    playBeep(mode = 'success') {
        if (mode === 'scan') {
            this.playTone(880, 'sine', 0.08, 0.12);
        } else if (mode === 'granted') {
            // Harmonic chime: C5 -> E5 -> G5
            this.playTone(523.25, 'sine', 0.15, 0.12);
            setTimeout(() => this.playTone(659.25, 'sine', 0.18, 0.12), 120);
            setTimeout(() => this.playTone(783.99, 'sine', 0.35, 0.15), 240);
        } else if (mode === 'denied') {
            // Low saw wave alert
            this.playTone(160, 'sawtooth', 0.3, 0.2);
            setTimeout(() => this.playTone(130, 'sawtooth', 0.4, 0.25), 180);
        }
    }

    // ==========================================
    // RFID GENERATION ENGINE
    // ==========================================
    generateRFIDObject(vehicleType = 'Car') {
        const randHex = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1).toUpperCase();
        const randId = Math.floor(10000 + Math.random() * 90000);
        const randSerial = Math.floor(100 + Math.random() * 900);

        const now = new Date();
        const issueDate = now.toISOString().split('T')[0];
        
        // Expiry 1 year ahead
        const expDate = new Date(now);
        expDate.setFullYear(expDate.getFullYear() + 1);
        const expiryDate = expDate.toISOString().split('T')[0];

        // Decal tag type based on vehicle
        let tagType = "Windshield Decal (Anti-Tamper)";
        if (vehicleType.toLowerCase().includes('motor') || vehicleType.toLowerCase().includes('bike')) {
            tagType = "Headlight RFID Sticker";
        }

        return {
            tagId: `E280-6901-${randHex()}-${randHex()}`,
            wiegandCode: `FC:${this.state.community.facilityCode}-ID:${randId}`,
            serialNumber: `SFS1-UHF-${now.getFullYear()}-${randSerial}`,
            frequency: "865-928 MHz (UHF Gen2 EPC)",
            issueDate: issueDate,
            expiryDate: expiryDate,
            status: "active",
            tagType: tagType
        };
    }

    generateRFIDForVehicle(vehicleId) {
        const vehicle = this.state.vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;

        vehicle.rfid = this.generateRFIDObject(vehicle.vehicleType);
        this.saveData();
        this.renderStats();
        this.renderVehiclesTable();
        this.populateGateSimulatorDropdown();
        this.showToast(`RFID Tag ${vehicle.rfid.tagId} successfully generated for ${vehicle.plateNumber}!`, 'success');
        this.playBeep('granted');

        if (window.confetti) {
            window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.8 } });
        }
    }

    reissueRFID(vehicleId) {
        if (!confirm('Reissuing an RFID tag will deactivate the old tag immediately. Continue?')) return;
        this.generateRFIDForVehicle(vehicleId);
    }

    toggleRFIDStatus(vehicleId) {
        const vehicle = this.state.vehicles.find(v => v.id === vehicleId);
        if (!vehicle || !vehicle.rfid) return;

        vehicle.rfid.status = vehicle.rfid.status === 'active' ? 'suspended' : 'active';
        this.saveData();
        this.renderStats();
        this.renderVehiclesTable();
        this.populateGateSimulatorDropdown();
        this.showToast(`Vehicle ${vehicle.plateNumber} RFID status changed to: ${vehicle.rfid.status.toUpperCase()}`, 'info');
    }

    deleteVehicle(vehicleId) {
        const vehicle = this.state.vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        if (!confirm(`Are you sure you want to remove registration for Plate ${vehicle.plateNumber} (${vehicle.ownerName})?`)) return;

        this.state.vehicles = this.state.vehicles.filter(v => v.id !== vehicleId);
        this.saveData();
        this.renderStats();
        this.renderVehiclesTable();
        this.populateGateSimulatorDropdown();
        this.showToast(`Vehicle ${vehicle.plateNumber} removed from registry.`, 'warning');
    }

    // ==========================================
    // QR CODE RENDERING ENGINE
    // ==========================================
    renderRegistrationQRCode() {
        const qrContainer = document.getElementById('registrationQrCode');
        const modalQrContainer = document.getElementById('posterModalQrCode');
        if (!qrContainer) return;

        qrContainer.innerHTML = '';
        if (modalQrContainer) modalQrContainer.innerHTML = '';

        // Registration form URL (uses current page with #register hash)
        const currentUrl = window.location.href.split('#')[0] + '#register';

        // Check if QRCode is available
        if (typeof QRCode !== 'undefined') {
            new QRCode(qrContainer, {
                text: currentUrl,
                width: 140,
                height: 140,
                colorDark: "#0f172a",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });

            if (modalQrContainer) {
                new QRCode(modalQrContainer, {
                    text: currentUrl,
                    width: 200,
                    height: 200,
                    colorDark: "#0f172a",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.H
                });
            }
        } else {
            // High reliability fallback SVG
            const fallback = this.generateFallbackQRSvg(currentUrl);
            qrContainer.innerHTML = fallback;
            if (modalQrContainer) modalQrContainer.innerHTML = fallback;
        }
    }

    generateFallbackQRSvg(text) {
        // SVG representation of a clean QR Code
        return `
            <div class="flex flex-col items-center justify-center p-2 bg-white rounded border border-slate-200">
                <svg class="w-32 h-32 text-slate-800" viewBox="0 0 100 100" fill="currentColor">
                    <rect x="10" y="10" width="25" height="25" fill="#0f172a"/>
                    <rect x="15" y="15" width="15" height="15" fill="#ffffff"/>
                    <rect x="18" y="18" width="9" height="9" fill="#0f172a"/>
                    
                    <rect x="65" y="10" width="25" height="25" fill="#0f172a"/>
                    <rect x="70" y="15" width="15" height="15" fill="#ffffff"/>
                    <rect x="73" y="18" width="9" height="9" fill="#0f172a"/>
                    
                    <rect x="10" y="65" width="25" height="25" fill="#0f172a"/>
                    <rect x="15" y="70" width="15" height="15" fill="#ffffff"/>
                    <rect x="18" y="73" width="9" height="9" fill="#0f172a"/>

                    <!-- Data dots mockup -->
                    <rect x="42" y="12" width="6" height="6" fill="#0f172a"/>
                    <rect x="52" y="20" width="6" height="6" fill="#0f172a"/>
                    <rect x="42" y="32" width="16" height="6" fill="#0f172a"/>
                    <rect x="12" y="45" width="6" height="12" fill="#0f172a"/>
                    <rect x="25" y="50" width="8" height="8" fill="#0f172a"/>
                    <rect x="42" y="45" width="16" height="16" fill="#0284c7"/>
                    <rect x="68" y="45" width="10" height="6" fill="#0f172a"/>
                    <rect x="80" y="55" width="10" height="8" fill="#0f172a"/>
                    <rect x="42" y="72" width="12" height="12" fill="#0f172a"/>
                    <rect x="65" y="75" width="8" height="16" fill="#0f172a"/>
                    <rect x="80" y="70" width="12" height="8" fill="#0f172a"/>
                </svg>
                <span class="text-[10px] text-slate-500 font-mono mt-1">Scan for SFSPh1 Form</span>
            </div>
        `;
    }

    // ==========================================
    // VEHICLE RFID DECAL / STICKER MODAL
    // ==========================================
    openDecalStudio(vehicleId) {
        const vehicle = this.state.vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;

        // Auto-generate RFID if missing
        if (!vehicle.rfid) {
            vehicle.rfid = this.generateRFIDObject(vehicle.vehicleType);
            this.saveData();
            this.renderStats();
            this.renderVehiclesTable();
            this.populateGateSimulatorDropdown();
        }

        this.state.selectedVehicleForDecal = vehicle;
        const modal = document.getElementById('decalModal');
        if (!modal) return;

        // Populate Decal Data
        document.getElementById('decalPlate').textContent = vehicle.plateNumber;
        document.getElementById('decalType').textContent = vehicle.vehicleType.toUpperCase();
        document.getElementById('decalModel').textContent = `${vehicle.make} ${vehicle.model} (${vehicle.year})`;
        document.getElementById('decalOwner').textContent = vehicle.ownerName;
        document.getElementById('decalAddress').textContent = `${vehicle.blockLot}, ${vehicle.street}`;
        document.getElementById('decalTagId').textContent = vehicle.rfid.tagId;
        document.getElementById('decalWiegand').textContent = vehicle.rfid.wiegandCode;
        document.getElementById('decalSerial').textContent = vehicle.rfid.serialNumber;
        document.getElementById('decalExpiry').textContent = `VALID THRU: ${vehicle.rfid.expiryDate}`;
        document.getElementById('decalTagType').textContent = vehicle.rfid.tagType;

        const statusBadge = document.getElementById('decalStatusBadge');
        if (statusBadge) {
            if (vehicle.rfid.status === 'active') {
                statusBadge.className = 'px-2 py-0.5 rounded text-xs font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300';
                statusBadge.textContent = 'ACTIVE RFID PASS';
            } else {
                statusBadge.className = 'px-2 py-0.5 rounded text-xs font-bold uppercase bg-red-100 text-red-800 border border-red-300';
                statusBadge.textContent = vehicle.rfid.status.toUpperCase();
            }
        }

        // Generate Decal QR Code
        const decalQrEl = document.getElementById('decalQrCode');
        if (decalQrEl) {
            decalQrEl.innerHTML = '';
            const verifyData = JSON.stringify({
                hoa: "SFSPh1",
                plate: vehicle.plateNumber,
                tag: vehicle.rfid.tagId,
                wiegand: vehicle.rfid.wiegandCode,
                owner: vehicle.ownerName,
                address: vehicle.blockLot,
                validUntil: vehicle.rfid.expiryDate
            });

            if (typeof QRCode !== 'undefined') {
                new QRCode(decalQrEl, {
                    text: verifyData,
                    width: 76,
                    height: 76,
                    colorDark: "#0f172a",
                    colorLight: "#ffffff",
                    correctLevel: QRCode.CorrectLevel.M
                });
            }
        }

        // Generate Barcode on decal if JsBarcode is present
        const barcodeCanvas = document.getElementById('decalBarcodeCanvas');
        if (barcodeCanvas && typeof JsBarcode !== 'undefined') {
            try {
                JsBarcode(barcodeCanvas, vehicle.rfid.tagId.replace(/-/g, ''), {
                    format: "CODE128",
                    width: 1.5,
                    height: 32,
                    displayValue: false,
                    margin: 0
                });
            } catch (e) {
                console.warn('Barcode generation fallback', e);
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

    closeDecalStudio() {
        const modal = document.getElementById('decalModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    printDecal() {
        window.print();
    }

    // ==========================================
    // GATE SIMULATOR (BARRIER & RFID READER)
    // ==========================================
    populateGateSimulatorDropdown() {
        const select = document.getElementById('simulatorVehicleSelect');
        if (!select) return;

        select.innerHTML = '<option value="">-- Choose a Registered Vehicle to Tap --</option>';

        this.state.vehicles.forEach(veh => {
            const hasRfid = veh.rfid && veh.rfid.tagId;
            const rfidText = hasRfid ? `[${veh.rfid.tagId}]` : '[NO RFID TAG]';
            const statusText = hasRfid ? `(${veh.rfid.status.toUpperCase()})` : '(PENDING)';
            
            const option = document.createElement('option');
            option.value = veh.id;
            option.textContent = `${veh.plateNumber} - ${veh.ownerName} - ${veh.make} ${veh.model} ${rfidText} ${statusText}`;
            select.appendChild(option);
        });

        // Add special test options
        const guestOption = document.createElement('option');
        guestOption.value = 'test_unregistered';
        guestOption.textContent = '⚠️ [TEST] Unknown Vehicle / Unregistered RFID (E280-9999-0000-DEAD)';
        select.appendChild(guestOption);

        const expiredOption = document.createElement('option');
        expiredOption.value = 'test_expired';
        expiredOption.textContent = '⛔ [TEST] Suspended/Expired RFID Tag';
        select.appendChild(expiredOption);
    }

    handleGateVehicleSelect(e) {
        const val = e.target.value;
        const tagInput = document.getElementById('manualRfidInput');
        if (!tagInput) return;

        if (val === 'test_unregistered') {
            tagInput.value = 'E280-9999-0000-DEAD';
            return;
        }
        if (val === 'test_expired') {
            tagInput.value = 'E280-6901-EXPD-9999';
            return;
        }

        const vehicle = this.state.vehicles.find(v => v.id === val);
        if (vehicle && vehicle.rfid) {
            tagInput.value = vehicle.rfid.tagId;
        } else if (vehicle) {
            tagInput.value = 'NO_TAG_ASSIGNED';
        } else {
            tagInput.value = '';
        }
    }

    simulateGateTap() {
        const tagInput = document.getElementById('manualRfidInput');
        const gateSelect = document.getElementById('simulatorGateSelect');
        const dirSelect = document.getElementById('simulatorDirectionSelect');
        
        let scannedTag = tagInput ? tagInput.value.trim() : '';
        const gateName = gateSelect ? gateSelect.value : 'Gate 1 - Main North Entrance';
        const direction = dirSelect ? dirSelect.value : 'ENTRY';

        if (!scannedTag) {
            this.showToast('Please select a vehicle or enter an RFID Tag ID to scan.', 'warning');
            return;
        }

        // Play scanner blip
        this.playBeep('scan');

        // Visual sensor wave pulse
        const sensor = document.getElementById('gateRfidSensor');
        if (sensor) {
            sensor.classList.add('ring-8', 'ring-sky-400', 'bg-sky-500');
            setTimeout(() => {
                sensor.classList.remove('ring-8', 'ring-sky-400', 'bg-sky-500');
            }, 600);
        }

        // Find matching vehicle
        const matchedVehicle = this.state.vehicles.find(v => v.rfid && v.rfid.tagId.toLowerCase() === scannedTag.toLowerCase());

        const gateArm = document.getElementById('simulatorGateArm');
        const ledIndicator = document.getElementById('simulatorLed');
        const statusScreen = document.getElementById('gateStatusDisplay');
        const statusSubtext = document.getElementById('gateSubtextDisplay');

        const now = new Date();
        const timestamp = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();

        if (matchedVehicle && matchedVehicle.rfid.status === 'active') {
            // ACCESS GRANTED
            this.playBeep('granted');

            if (ledIndicator) {
                ledIndicator.classList.remove('red');
                ledIndicator.classList.add('green');
            }

            if (gateArm) {
                gateArm.classList.add('is-open');
            }

            if (statusScreen) {
                statusScreen.className = 'text-xl font-black text-emerald-400 font-mono tracking-wide';
                statusScreen.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400 mr-2"></i>ACCESS GRANTED`;
            }

            if (statusSubtext) {
                statusSubtext.innerHTML = `
                    <div class="text-xs text-emerald-200 mt-1">
                        <b>${matchedVehicle.plateNumber}</b> | ${matchedVehicle.ownerName} (${matchedVehicle.blockLot})<br>
                        <span class="text-slate-400">Barrier Open. Proceed with caution (Max 20 kph).</span>
                    </div>
                `;
            }

            // Log access
            this.addGateLog({
                id: 'log-' + Date.now(),
                timestamp: timestamp,
                gate: gateName,
                plateNumber: matchedVehicle.plateNumber,
                ownerName: matchedVehicle.ownerName,
                vehicleModel: `${matchedVehicle.make} ${matchedVehicle.model}`,
                rfidTag: matchedVehicle.rfid.tagId,
                direction: direction,
                status: 'GRANTED',
                reason: 'Valid SFSPh1 Resident Pass'
            });

            this.showToast(`Access Granted for ${matchedVehicle.plateNumber} (${matchedVehicle.ownerName})`, 'success');

            // Reset barrier after 4.5 seconds
            setTimeout(() => {
                if (gateArm) gateArm.classList.remove('is-open');
                if (ledIndicator) {
                    ledIndicator.classList.remove('green');
                    ledIndicator.classList.add('red');
                }
                if (statusScreen) {
                    statusScreen.className = 'text-lg font-bold text-slate-300 font-mono';
                    statusScreen.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400 mr-2"></i>GATE READY - TAP RFID`;
                }
                if (statusSubtext) {
                    statusSubtext.innerHTML = `<span class="text-xs text-slate-400">Drive up close to RFID transceiver (within 3-5 meters)</span>`;
                }
            }, 4500);

        } else {
            // ACCESS DENIED
            this.playBeep('denied');

            if (ledIndicator) {
                ledIndicator.classList.remove('green');
                ledIndicator.classList.add('red');
            }

            if (statusScreen) {
                statusScreen.className = 'text-xl font-black text-red-400 font-mono tracking-wide';
                statusScreen.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-red-500 mr-2"></i>ACCESS DENIED`;
            }

            let reason = 'Unregistered / Invalid RFID Tag';
            let ownerName = 'Visitor / Unregistered';
            let plate = 'UNKNOWN';
            let model = 'Unknown Vehicle';

            if (matchedVehicle && matchedVehicle.rfid.status !== 'active') {
                reason = `Tag is ${matchedVehicle.rfid.status.toUpperCase()}`;
                ownerName = matchedVehicle.ownerName;
                plate = matchedVehicle.plateNumber;
                model = `${matchedVehicle.make} ${matchedVehicle.model}`;
            }

            if (statusSubtext) {
                statusSubtext.innerHTML = `
                    <div class="text-xs text-red-200 mt-1">
                        <b>${reason}</b><br>
                        <span class="text-slate-300">Please report to Guardhouse for manual verification.</span>
                    </div>
                `;
            }

            // Log access
            this.addGateLog({
                id: 'log-' + Date.now(),
                timestamp: timestamp,
                gate: gateName,
                plateNumber: plate,
                ownerName: ownerName,
                vehicleModel: model,
                rfidTag: scannedTag,
                direction: direction,
                status: 'DENIED',
                reason: reason
            });

            this.showToast(`Access Denied: ${reason}`, 'error');

            setTimeout(() => {
                if (statusScreen) {
                    statusScreen.className = 'text-lg font-bold text-slate-300 font-mono';
                    statusScreen.innerHTML = `<i class="fa-solid fa-tower-broadcast text-sky-400 mr-2"></i>GATE READY - TAP RFID`;
                }
                if (statusSubtext) {
                    statusSubtext.innerHTML = `<span class="text-xs text-slate-400">Drive up close to RFID transceiver (within 3-5 meters)</span>`;
                }
            }, 3500);
        }
    }

    addGateLog(log) {
        this.state.gateLogs.unshift(log);
        // keep max 50 recent logs
        if (this.state.gateLogs.length > 50) {
            this.state.gateLogs.pop();
        }
        this.saveData();
        this.renderGateLogs();
    }

    clearGateLogs() {
        if (!confirm('Clear all access history logs?')) return;
        this.state.gateLogs = [];
        this.saveData();
        this.renderGateLogs();
        this.showToast('Gate access logs cleared.', 'info');
    }

    // ==========================================
    // VEHICLE REGISTRATION FORM
    // ==========================================
    handleRegistrationSubmit(e) {
        e.preventDefault();
        const form = e.target;
        
        const ownerName = form.ownerName.value.trim();
        const ownerType = form.ownerType.value;
        const contact = form.contact.value.trim();
        const email = form.email.value.trim();
        const blockLot = form.blockLot.value.trim();
        const street = form.street.value.trim();
        const vehicleType = form.vehicleType.value;
        const plateNumber = form.plateNumber.value.trim().toUpperCase();
        const make = form.make.value.trim();
        const model = form.model.value.trim();
        const year = form.year.value.trim();
        const color = form.color.value.trim();
        const autoIssueRfid = form.autoIssueRfid.checked;

        // Check if plate already registered
        const duplicate = this.state.vehicles.find(v => v.plateNumber.replace(/\s+/g, '') === plateNumber.replace(/\s+/g, ''));
        if (duplicate) {
            alert(`A vehicle with Plate Number "${plateNumber}" is already registered under ${duplicate.ownerName}.`);
            return;
        }

        const newVehicle = {
            id: 'veh-' + Date.now(),
            ownerName,
            ownerType,
            contact,
            email,
            blockLot,
            street,
            vehicleType,
            plateNumber,
            make,
            model,
            year: year || '2024',
            color: color || 'Standard',
            rfid: autoIssueRfid ? this.generateRFIDObject(vehicleType) : null,
            registeredAt: new Date().toISOString()
        };

        this.state.vehicles.unshift(newVehicle);
        this.saveData();
        this.renderStats();
        this.renderVehiclesTable();
        this.populateGateSimulatorDropdown();

        form.reset();

        if (autoIssueRfid) {
            this.showToast(`Vehicle ${plateNumber} registered and RFID Tag ${newVehicle.rfid.tagId} issued!`, 'success');
            this.openDecalStudio(newVehicle.id);
        } else {
            this.showToast(`Vehicle ${plateNumber} registered successfully! RFID generation is pending approval.`, 'info');
        }

        // Scroll to vehicles table
        const tableSec = document.getElementById('registrySection');
        if (tableSec) {
            tableSec.scrollIntoView({ behavior: 'smooth' });
        }
    }

    fillSampleForm(type = 'car') {
        const form = document.getElementById('vehicleRegistrationForm');
        if (!form) return;

        if (type === 'suv') {
            form.ownerName.value = 'Carlos Mendoza';
            form.ownerType.value = 'Homeowner';
            form.contact.value = '0917-888-4321';
            form.email.value = 'carlos.mendoza@gmail.com';
            form.blockLot.value = 'Blk 5 Lot 18';
            form.street.value = 'Narra Boulevard';
            form.vehicleType.value = 'SUV';
            form.plateNumber.value = 'NBC ' + Math.floor(1000 + Math.random() * 9000);
            form.make.value = 'Mitsubishi';
            form.model.value = 'Montero Sport GT';
            form.year.value = '2024';
            form.color.value = 'Diamond White';
        } else if (type === 'moto') {
            form.ownerName.value = 'Mark Anthony Tan';
            form.ownerType.value = 'Tenant';
            form.contact.value = '0922-999-5566';
            form.email.value = 'mark.tan@techph.com';
            form.blockLot.value = 'Blk 3 Lot 9';
            form.street.value = 'Palm Drive';
            form.vehicleType.value = 'Motorcycle';
            form.plateNumber.value = Math.floor(100 + Math.random() * 900) + ' NCD';
            form.make.value = 'Honda';
            form.model.value = 'ADV 160';
            form.year.value = '2023';
            form.color.value = 'Matte Red';
        } else {
            form.ownerName.value = 'Elena Gutierrez';
            form.ownerType.value = 'Homeowner';
            form.contact.value = '0915-444-7788';
            form.email.value = 'elena.gutierrez@yahoo.com';
            form.blockLot.value = 'Blk 8 Lot 4';
            form.street.value = 'Mahogany Street';
            form.vehicleType.value = 'Sedan';
            form.plateNumber.value = 'CAE ' + Math.floor(1000 + Math.random() * 9000);
            form.make.value = 'Toyota';
            form.model.value = 'Corolla Altis Hybrid';
            form.year.value = '2024';
            form.color.value = 'Celestite Gray';
        }
        form.autoIssueRfid.checked = true;
        this.showToast('Sample form filled for testing!', 'info');
    }

    // ==========================================
    // RENDERING TABLES & STATS
    // ==========================================
    renderStats() {
        const totalVehicles = this.state.vehicles.length;
        const activeRfids = this.state.vehicles.filter(v => v.rfid && v.rfid.status === 'active').length;
        const pendingRfids = this.state.vehicles.filter(v => !v.rfid).length;
        const totalPassesToday = this.state.gateLogs.length;

        document.getElementById('statTotalVehicles').textContent = totalVehicles;
        document.getElementById('statActiveRfids').textContent = activeRfids;
        document.getElementById('statPendingRfids').textContent = pendingRfids;
        document.getElementById('statGateEntries').textContent = totalPassesToday;

        // Update badge counters on filter tabs
        const badgeAll = document.getElementById('badgeFilterAll');
        const badgeActive = document.getElementById('badgeFilterActive');
        const badgePending = document.getElementById('badgeFilterPending');
        if (badgeAll) badgeAll.textContent = totalVehicles;
        if (badgeActive) badgeActive.textContent = activeRfids;
        if (badgePending) badgePending.textContent = pendingRfids;
    }

    renderVehiclesTable() {
        const tbody = document.getElementById('vehiclesTableBody');
        if (!tbody) return;

        let filtered = this.state.vehicles;

        // Filter tab
        if (this.state.activeFilter === 'active') {
            filtered = filtered.filter(v => v.rfid && v.rfid.status === 'active');
        } else if (this.state.activeFilter === 'pending') {
            filtered = filtered.filter(v => !v.rfid);
        } else if (this.state.activeFilter === 'suspended') {
            filtered = filtered.filter(v => v.rfid && v.rfid.status === 'suspended');
        }

        // Search query
        if (this.state.searchQuery) {
            const q = this.state.searchQuery.toLowerCase();
            filtered = filtered.filter(v => 
                v.plateNumber.toLowerCase().includes(q) ||
                v.ownerName.toLowerCase().includes(q) ||
                v.blockLot.toLowerCase().includes(q) ||
                v.make.toLowerCase().includes(q) ||
                v.model.toLowerCase().includes(q) ||
                (v.rfid && v.rfid.tagId.toLowerCase().includes(q))
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-12 text-center text-slate-400">
                        <i class="fa-solid fa-car-tunnel text-4xl mb-3 text-slate-300 block"></i>
                        <p class="font-medium text-slate-600">No vehicles match your filter criteria.</p>
                        <p class="text-xs text-slate-400 mt-1">Try adjusting search or register a new vehicle above.</p>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = filtered.map(v => {
            const hasRfid = !!v.rfid;
            let statusBadge = '';

            if (!hasRfid) {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span> Pending RFID
                </span>`;
            } else if (v.rfid.status === 'active') {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Active
                </span>`;
            } else {
                statusBadge = `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span> Suspended
                </span>`;
            }

            const rfidInfo = hasRfid ? `
                <div class="font-mono text-xs text-slate-900 font-bold tracking-tight">${v.rfid.tagId}</div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                    <span>${v.rfid.wiegandCode}</span>
                    <span class="text-slate-300">•</span>
                    <span class="text-sky-600">${v.rfid.tagType.split(' ')[0]}</span>
                </div>
            ` : `
                <div class="text-xs text-slate-400 italic">No RFID tag assigned yet</div>
                <button onclick="app.generateRFIDForVehicle('${v.id}')" class="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    <i class="fa-solid fa-microchip"></i> Issue RFID Now
                </button>
            `;

            return `
                <tr class="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                                <i class="${this.getVehicleIcon(v.vehicleType)}"></i>
                            </div>
                            <div>
                                <div class="font-black text-slate-900 font-mono tracking-wider text-base">${v.plateNumber}</div>
                                <div class="text-xs text-slate-500">${v.make} ${v.model} (${v.color})</div>
                            </div>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm font-semibold text-slate-800">${v.ownerName}</div>
                        <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span class="px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">${v.ownerType}</span>
                            <span>${v.contact}</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        <div class="text-sm text-slate-700 font-medium">${v.blockLot}</div>
                        <div class="text-xs text-slate-400">${v.street}</div>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${rfidInfo}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap">
                        ${statusBadge}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div class="flex items-center justify-end gap-1.5">
                            ${hasRfid ? `
                                <button onclick="app.openDecalStudio('${v.id}')" title="View & Print RFID Windshield Decal" class="p-2 text-slate-600 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition-colors border border-transparent hover:border-sky-200">
                                    <i class="fa-solid fa-id-card"></i>
                                </button>
                                <button onclick="app.toggleRFIDStatus('${v.id}')" title="Toggle Active/Suspended" class="p-2 text-slate-600 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors border border-transparent hover:border-amber-200">
                                    <i class="fa-solid fa-power-off"></i>
                                </button>
                                <button onclick="app.reissueRFID('${v.id}')" title="Reissue New RFID Tag" class="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                    <i class="fa-solid fa-arrows-rotate"></i>
                                </button>
                            ` : `
                                <button onclick="app.generateRFIDForVehicle('${v.id}')" title="Generate RFID Tag" class="px-2.5 py-1 text-xs font-bold bg-sky-600 text-white rounded-lg hover:bg-sky-700 shadow-sm transition-all flex items-center gap-1">
                                    <i class="fa-solid fa-microchip"></i> Issue RFID
                                </button>
                            `}
                            <button onclick="app.deleteVehicle('${v.id}')" title="Delete Vehicle" class="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    getVehicleIcon(type) {
        const t = (type || '').toLowerCase();
        if (t.includes('moto') || t.includes('bike')) return 'fa-solid fa-motorcycle text-indigo-500';
        if (t.includes('suv')) return 'fa-solid fa-truck-pickup text-emerald-600';
        if (t.includes('truck') || t.includes('pickup')) return 'fa-solid fa-truck text-amber-600';
        if (t.includes('van') || t.includes('mpv')) return 'fa-solid fa-van-shuttle text-cyan-600';
        return 'fa-solid fa-car-side text-blue-600';
    }

    renderGateLogs() {
        const tbody = document.getElementById('gateLogsTableBody');
        if (!tbody) return;

        if (this.state.gateLogs.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="px-6 py-8 text-center text-slate-400">
                        <i class="fa-solid fa-clock-rotate-left text-2xl mb-2 text-slate-300 block"></i>
                        No gate access logs recorded yet. Use the Gate Simulator above to simulate vehicle scans!
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = this.state.gateLogs.slice(0, 20).map(log => {
            const isGranted = log.status === 'GRANTED';
            const statusClass = isGranted ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200';
            const icon = isGranted ? 'fa-solid fa-circle-check text-emerald-500' : 'fa-solid fa-circle-xmark text-red-500';
            const dirIcon = log.direction === 'ENTRY' ? 'fa-solid fa-arrow-right-to-bracket text-emerald-600' : 'fa-solid fa-arrow-right-from-bracket text-amber-600';

            return `
                <tr class="hover:bg-slate-50 transition-colors border-b border-slate-100 text-xs">
                    <td class="px-4 py-3 whitespace-nowrap font-mono text-slate-500">
                        ${log.timestamp}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1 font-semibold text-slate-700">
                            <i class="${dirIcon}"></i> ${log.direction}
                        </span>
                        <div class="text-[10px] text-slate-400">${log.gate}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <div class="font-bold text-slate-900 font-mono">${log.plateNumber}</div>
                        <div class="text-[11px] text-slate-500">${log.vehicleModel || 'N/A'}</div>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap font-medium text-slate-700">
                        ${log.ownerName}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap font-mono text-[11px] text-slate-600">
                        ${log.rfidTag}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold border ${statusClass}">
                            <i class="${icon}"></i> ${log.status}
                        </span>
                        <div class="text-[10px] text-slate-400 mt-0.5 truncate max-w-[140px]" title="${log.reason}">${log.reason}</div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ==========================================
    // EXPORT TO CSV
    // ==========================================
    exportToCSV() {
        if (this.state.vehicles.length === 0) {
            this.showToast('No vehicle records to export.', 'warning');
            return;
        }

        const headers = ["Plate Number", "Owner Name", "Type", "Contact", "Email", "Address", "Street", "Vehicle Classification", "Make", "Model", "Year", "Color", "RFID Tag ID", "Wiegand Code", "RFID Serial", "Status", "Issue Date", "Expiry Date"];
        const rows = this.state.vehicles.map(v => [
            `"${v.plateNumber}"`,
            `"${v.ownerName}"`,
            `"${v.ownerType}"`,
            `"${v.contact}"`,
            `"${v.email}"`,
            `"${v.blockLot}"`,
            `"${v.street}"`,
            `"${v.vehicleType}"`,
            `"${v.make}"`,
            `"${v.model}"`,
            `"${v.year}"`,
            `"${v.color}"`,
            `"${v.rfid ? v.rfid.tagId : 'NONE'}"`,
            `"${v.rfid ? v.rfid.wiegandCode : 'NONE'}"`,
            `"${v.rfid ? v.rfid.serialNumber : 'NONE'}"`,
            `"${v.rfid ? v.rfid.status : 'PENDING'}"`,
            `"${v.rfid ? v.rfid.issueDate : 'NONE'}"`,
            `"${v.rfid ? v.rfid.expiryDate : 'NONE'}"`
        ]);

        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `SFSPh1_HOA_Vehicle_Registry_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('Registry CSV downloaded successfully!', 'success');
    }

    // ==========================================
    // TOAST NOTIFICATIONS & MODALS
    // ==========================================
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-item flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border text-sm max-w-md bg-white ';

        let icon = 'fa-solid fa-circle-info text-blue-500';
        let borderColor = 'border-blue-200';

        if (type === 'success') {
            icon = 'fa-solid fa-circle-check text-emerald-500';
            borderColor = 'border-emerald-300';
        } else if (type === 'warning') {
            icon = 'fa-solid fa-triangle-exclamation text-amber-500';
            borderColor = 'border-amber-300';
        } else if (type === 'error') {
            icon = 'fa-solid fa-circle-exclamation text-red-500';
            borderColor = 'border-red-300';
        }

        toast.classList.add(borderColor);
        toast.innerHTML = `
            <i class="${icon} text-lg shrink-0"></i>
            <div class="flex-1 font-medium text-slate-800">${message}</div>
            <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-slate-600 p-1">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            if (toast.parentElement) {
                toast.classList.add('opacity-0', 'transition-opacity', 'duration-300');
                setTimeout(() => toast.remove(), 300);
            }
        }, 4000);
    }

    openPosterModal() {
        const modal = document.getElementById('qrPosterModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
        }
    }

    closePosterModal() {
        const modal = document.getElementById('qrPosterModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    }

    checkUrlForAction() {
        if (window.location.hash === '#register') {
            const formSec = document.getElementById('register');
            if (formSec) {
                setTimeout(() => formSec.scrollIntoView({ behavior: 'smooth' }), 200);
            }
        }
    }

    // ==========================================
    // EVENT LISTENERS BINDING
    // ==========================================
    initEventListeners() {
        // Registration Form
        const regForm = document.getElementById('vehicleRegistrationForm');
        if (regForm) {
            regForm.addEventListener('submit', (e) => this.handleRegistrationSubmit(e));
        }

        // Search Input
        const searchInput = document.getElementById('registrySearchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.state.searchQuery = e.target.value.trim();
                this.renderVehiclesTable();
            });
        }

        // Filter Tabs
        const filterBtns = document.querySelectorAll('.filter-tab-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                filterBtns.forEach(b => {
                    b.classList.remove('bg-sky-600', 'text-white', 'shadow-sm');
                    b.classList.add('text-slate-600', 'hover:bg-slate-100');
                });
                const clicked = e.currentTarget;
                clicked.classList.add('bg-sky-600', 'text-white', 'shadow-sm');
                clicked.classList.remove('text-slate-600', 'hover:bg-slate-100');
                this.state.activeFilter = clicked.dataset.filter || 'all';
                this.renderVehiclesTable();
            });
        });

        // Gate Simulator select vehicle
        const simSelect = document.getElementById('simulatorVehicleSelect');
        if (simSelect) {
            simSelect.addEventListener('change', (e) => this.handleGateVehicleSelect(e));
        }

        // Simulator Tap Button
        const simTapBtn = document.getElementById('simulatorTapBtn');
        if (simTapBtn) {
            simTapBtn.addEventListener('click', () => this.simulateGateTap());
        }

        // Reset Data Button
        const resetBtn = document.getElementById('btnResetSampleData');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset all vehicles and gate logs back to initial SFSPh1 HOA demonstration data?')) {
                    localStorage.removeItem(this.STORAGE_KEY);
                    this.loadData();
                    this.renderStats();
                    this.renderVehiclesTable();
                    this.renderGateLogs();
                    this.populateGateSimulatorDropdown();
                    this.showToast('Data reset to demonstration seed.', 'info');
                }
            });
        }
    }
}

// Instantiate on DOM ready
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new SFSHOAApp();
});
