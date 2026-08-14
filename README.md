# Commvault Lunch Portal

A web-based lunch management application that enables employees to submit lunch selections, administrators to manage menus and users, vendors to receive order summaries, and automated SMS notifications for communication.

---

## Overview

The Commvault Lunch Portal is designed to streamline the lunch ordering process by providing:

- Employee lunch selection management
- Administrative menu and user management
- Vendor order summaries
- SMS notifications via Twilio
- Reporting and tracking capabilities

---

## Repository Information

| Item | Details |
|--------|---------|
| Source Control | GitLab |
| Repository | https://git.commvault.com/adwarampudi/new-lunch.git |
| Branch | `main` |
| Main Application File | `server.js` |
| Application Directory | `C:\new-lunch` |

### Clone Repository

```bash
git clone https://git.commvault.com/adwarampudi/new-lunch.git
```

---

## System Requirements

### Required Software

- Node.js
- NPM
- NSSM (Non-Sucking Service Manager)

### Verified Versions

```text
Node.js v24.19.0
NPM 11.17.0
```

---

## Deployment Environment

| Item | Value |
|--------|--------|
| Server Name | LUNCHMENU |
| Deployment Type | Windows Virtual Machine (VM) |
| Remote Access | Remote Desktop (RDP) |
| Application Path | C:\new-lunch |
| Application Port | 4000 |
| Local URL | http://localhost:4000 |
| Service Name | LunchPortal |
| Service Manager | NSSM |

---

## Installation & Deployment

### 1. Clone the Repository

```bash
git clone https://git.commvault.com/adwarampudi/new-lunch.git
```

### 2. Navigate to Application Directory

```bash
cd C:\new-lunch
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start the Application

```bash
node server.js
```

### 5. Verify Application Access

Open a browser and navigate to:

```text
http://localhost:4000
```

---

## Running as a Windows Service

The application is configured to run as a Windows service using NSSM.

### NSSM Configuration

| Setting | Value |
|----------|--------|
| Application Path | C:\Program Files\nodejs\node.exe |
| Startup Directory | C:\new-lunch |
| Arguments | server.js |

---

## Service Management

### Start Service

```cmd
sc start LunchPortal
```

### Stop Service

```cmd
sc stop LunchPortal
```

### Check Service Status

```cmd
sc query LunchPortal
```

---

## SMS Notification System

The application uses **Twilio** for sending SMS notifications to users.

Features include:

- Lunch reminders
- Order confirmations
- Administrative notifications

---

## Verification Checklist

After deployment, verify the following:

### Node.js Version

```bash
node -v
```

### NPM Version

```bash
npm -v
```

### Service Status

```cmd
sc query LunchPortal
```

### Application Health Check

Verify the application loads successfully:

```text
http://localhost:4000
```

> **Note:** Previous documentation referenced port `3000`. The deployed application is configured for **port 4000**.

---

## Troubleshooting

### Application Fails to Start

Run the application manually to view startup errors:

```bash
node server.js
```

### Service Not Running

Verify service status:

```cmd
sc query LunchPortal
```

Restart the service if necessary:

```cmd
sc stop LunchPortal
sc start LunchPortal
```

### Dependency Issues

Reinstall dependencies:

```bash
npm install
```

---

## Disaster Recovery Procedure

If the server must be rebuilt:

1. Install Node.js
2. Install NSSM
3. Clone the repository
4. Navigate to the application directory
5. Run:

```bash
npm install
```

6. Configure NSSM using the settings above
7. Start the LunchPortal service

```cmd
sc start LunchPortal
```

8. Verify application access at:

```text
http://localhost:4000
```

---

## Application Architecture

```text
Users
  │
  ▼
Lunch Portal (Node.js)
  │
  ├── Employee Menu Selection
  ├── Admin Management
  ├── Vendor Order Summaries
  ├── Reporting
  └── Twilio SMS Notifications
```

---

## Contact Information

**Project Owner:** Ashritha Dwarampudi  
**Mentor:** Prashanti Koti  
**Application:** Commvault Lunch Portal

---

## License

Internal Commvault Application - For organizational use only.
