# SFSPh1 Homeowners Association - Vehicle Registration & RFID Management Portal

A modern, responsive web application for **San Francisco South Phase 1 (SFSPh1) Homeowners Association**. It provides contactless vehicle registration, QR code access for mobile homeowners, automated Radio Frequency Identification (RFID) credential generation, a realistic printable windshield decal studio, real-time photo verification, and an interactive guardhouse barrier gate simulator with streamlined visitor plate & driver ID capture.

---

## 🌟 Key Features

### 1. 📱 Mobile Registration via QR Code
- **Dynamic QR Code**: Prominently displayed on the hero section and within an official Guardhouse Bulletin Poster.
- **Mobile Friendly**: Homeowners can scan the QR code with any iPhone or Android camera to jump straight to the vehicle registration form.
- **Printable Flyer**: Includes a ready-to-print official SFSPh1 HOA bulletin notice with instructions for residents.

### 2. 📸 Resident Photo Verification (Owner & Vehicle Images)
- **Driver / Owner Portrait Upload**: Stores driver profile photos for guard verification.
- **Vehicle Image Upload**: Captures front/side vehicle photos showing make, model, and body color.
- **Fast Demo Autofill**: Single-click demo presets populate realistic sample photos for testing.

### 3. 🚨 Streamlined Visitor Clearance (Captured Plate & Valid ID Only)
- **Automatic Pop-up Window**: When an unregistered vehicle or guest approaches the gate, the **Visitor Clearance Window** pops up showing **Captured Plate Number** and **Driver's Valid ID Card** only.
- **Auto-Fill Data & Automatic Registration**: The system automatically recognizes the plate, matches the driver's verified ID card, auto-fills visit details, and registers the visitor with a single click.
- **Instant Barrier Gate Clearance**: Clicking **"Register Visitor & Open Gate"** instantly authorizes entry, lifts the barrier boom arm, plays the chime, and displays the captured plate and valid ID on the guard monitor.

### 4. 🏷️ Automated RFID Generation (Radio Frequency Identification)
- **EPC Gen2 UHF Standard**: Generates unique 96-bit hexadecimal tag IDs (e.g., `E280-6901-44B2-9A01`).
- **Wiegand 26/34-bit Facility Code**: Integrated with SFSPh1 Facility Code `084` and unique 5-digit card IDs.
- **Serial Tracking**: Unique serial numbers (e.g., `SFS1-UHF-2026-00104`).
- **Auto Expiration**: Automatically computes 1-year validity for renewal cycles.
- **Decal Types**: Supports both *Windshield Inside-Mount Decals* (cars, SUVs, vans) and *Headlight RFID Stickers* (motorcycles, e-bikes).

### 5. 🪪 Visual RFID Windshield Decal Studio
- Realistic, high-security printable RFID pass:
  - SFSPh1 Official HOA Emblem & Gold Holographic Security Seal
  - High-contrast Plate Number & Vehicle Classification badge
  - Microstrip UHF antenna background pattern
  - Encoded Code128 Barcode for guard scanning
  - Verification QR Code containing encrypted vehicle metadata
  - Embedded owner and vehicle photo thumbnails

### 6. 🚧 Smart Barrier Gate & Guard Console Simulator
- **Live Monitor HUD**:
  - Displays high-contrast **Vehicle Plate Number**, **Vehicle Photo**, and **Owner Portrait**.
  - For visitors: displays the **Captured Visitor Plate** and verified **Driver's Valid ID Card**.
  - Dual-tone harmonic audio chime synthesizer (built with Web Audio API).
  - Smooth motorized 3D barrier boom arm animation.
  - Real-time timestamped audit log of all resident and visitor entries.

### 7. 📋 Master Vehicle & RFID Registry Database
- **Live Search & Filter**: Search by Plate Number, Resident Name, Address (Block & Lot), or RFID Tag ID.
- **Status Tabs**: Quickly filter by *All*, *Active RFID*, *Pending Tag*, and *Suspended*.
- **Export to CSV**: Export the entire registry to Excel/CSV for official HOA board records.
- **Persistent Storage**: Uses browser `localStorage` so changes persist across refreshes.

---

## 🚀 How to Run

1. Open `index.html` in any web browser (Google Chrome, Microsoft Edge, Mozilla Firefox, or Brave).
2. No Node.js or Python backend is required — everything runs self-contained in the browser with CDN-backed styling and icons.

---

## 🏢 Subdivision Specifications
- **Community**: San Francisco South Phase 1 Homeowners Association (SFSPh1 HOA)
- **Facility Code**: `084`
- **RFID Frequency**: 865 - 928 MHz (UHF Gen2 EPC ISO 18000-6C)
- **Read Range**: 3 - 5 meters (long-range barrier gate transceiver)
