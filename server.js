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

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify([]));
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

// 4. Upload image
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
