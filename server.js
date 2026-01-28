const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Ensure directories exist
const uploadDir = path.join(__dirname, 'uploads');
const dataFile = path.join(__dirname, 'reports.json');
const usersFile = path.join(__dirname, 'users.json');
const settingsFile = path.join(__dirname, 'settings.json');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([]));
}
if (!fs.existsSync(usersFile)) {
    const defaultUsers = [
        { id: "admin", pw: "admin123", name: "管理者", role: "master" },
        { id: "manager", pw: "manager123", name: "マネージャー", role: "Manager" },
        { id: "user", pw: "user123", name: "作業員", role: "user" },
        { id: "viewer", pw: "viewer123", name: "閲覧者", role: "viewer" }
    ];
    fs.writeFileSync(usersFile, JSON.stringify(defaultUsers, null, 2));
}

if (!fs.existsSync(settingsFile)) {
    const defaultSettings = {
        commonItems: [
            "backup（旧サーバー）",
            "旧サーバー・PoE HUB・UPS交換（写真必須）",
            "IresのID削除",
            "カメラテスト",
            "各ゲート認証テスト",
            "ロッカー動作確認",
            "最終養生確認"
        ],
        cameraSettings: [
            { id: 1, name: "項目1" },
            { id: 2, name: "項目2" },
            { id: 3, name: "項目3" },
            { id: 4, name: "項目4" }
        ]
    };
    fs.writeFileSync(settingsFile, JSON.stringify(defaultSettings, null, 2));
}

// Multer storage config
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// API Endpoints

// 1. Get all reports
app.get('/api/reports', (req, res) => {
    try {
        const data = fs.readFileSync(dataFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read reports' });
    }
});

// 2. Save/Update report
app.post('/api/reports', (req, res) => {
    try {
        const reports = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        const newReport = req.body;

        const index = reports.findIndex(r => r.id === newReport.id);
        if (index >= 0) {
            reports[index] = newReport;
        } else {
            reports.push(newReport);
        }

        fs.writeFileSync(dataFile, JSON.stringify(reports, null, 2));
        res.json({ success: true, id: newReport.id });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save report' });
    }
});

// 3. Delete report
app.delete('/api/reports/:id', (req, res) => {
    try {
        let reports = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
        reports = reports.filter(r => r.id !== req.params.id);
        fs.writeFileSync(dataFile, JSON.stringify(reports, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// 4. Get all users (Master)
app.get('/api/users', (req, res) => {
    try {
        const data = fs.readFileSync(usersFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read users' });
    }
});

// 5. Save/Update user
app.post('/api/users', (req, res) => {
    try {
        let users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        const newUser = req.body;
        const index = users.findIndex(u => u.id === newUser.id);
        if (index >= 0) users[index] = newUser;
        else users.push(newUser);
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save user' });
    }
});

// 6. Delete user
app.delete('/api/users/:id', (req, res) => {
    try {
        let users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
        users = users.filter(u => u.id !== req.params.id);
        fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// 7. Get system settings
app.get('/api/settings', (req, res) => {
    try {
        const data = fs.readFileSync(settingsFile, 'utf8');
        res.json(JSON.parse(data));
    } catch (err) {
        res.status(500).json({ error: 'Failed to read settings' });
    }
});

// 8. Update system settings
app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save settings' });
    }
});

// 7. Upload image
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl, filename: req.file.filename });
});

app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
    console.log(`Press Ctrl+C to stop the server.`);
});
