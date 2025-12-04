const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const sessions = new Map();

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'websocket_progjar'
};

const JWT_SECRET = 'your-secret-key-change-this-in-production';
const express = require('express');
const http = require('http');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const os = require('os');

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));

// app.use(cors({
//     origin: (origin, callback) => {
//         callback(null, true); // terima semua origin LAN
//     },
//     credentials: true
// }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Token tidak ditemukan' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token tidak valid' });
        }
        req.user = user;
        next();
    });
}

const httpServer = http.createServer(app);

app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Semua field harus diisi' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password minimal 6 karakter' });
        }
        
        const db = await mysql.createConnection(dbConfig);
        
        const [existingUsers] = await db.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [username, email]
        );
        
        if (existingUsers.length > 0) {
            await db.end();
            return res.status(400).json({ error: 'Username atau email sudah terdaftar' });
        }
        
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);
        
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        const avatarColors = ['#ff6b9d', '#cdb4db', '#bde0fe', '#ffd166', '#06d6a0', '#118ab2'];
        const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
        
        const userId = uuidv4();
        
        await db.execute(
            `INSERT INTO users (id, username, email, password_hash, avatar_color, verification_token, is_active, is_verified) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, username, email, passwordHash, avatarColor, verificationToken, 1, 0]
        );
        
        await db.end();
        
        const token = jwt.sign(
            { userId, username, email, avatarColor, isVerified: false },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Registrasi berhasil! Silakan login.',
            token: token,
            user: {
                id: userId,
                username,
                email,
                avatarColor,
                isVerified: false
            }
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat registrasi' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username dan password harus diisi' });
        }
        
        const db = await mysql.createConnection(dbConfig);
        
        const [users] = await db.execute(
            'SELECT * FROM users WHERE username = ? OR email = ?',
            [username, username]
        );
        
        if (users.length === 0) {
            await db.end();
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        
        const user = users[0];
        
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        
        if (!isValidPassword) {
            await db.end();
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        
        await db.execute(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );
        
        await db.end();
        
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username, 
                email: user.email, 
                avatarColor: user.avatar_color,
                isVerified: user.is_verified 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Login berhasil!',
            token: token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatarColor: user.avatar_color,
                isVerified: user.is_verified
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat login' });
    }
});

app.post('/api/verify-token', authenticateToken, async (req, res) => {
    try {
        const db = await mysql.createConnection(dbConfig);
        const [users] = await db.execute(
            'SELECT id, username, email, avatar_color, is_verified FROM users WHERE id = ?',
            [req.user.userId]
        );
        await db.end();
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }
        
        const user = users[0];
        
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username, 
                email: user.email, 
                avatarColor: user.avatar_color,
                isVerified: user.is_verified 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            user: user,
            token: token
        });
        
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat verifikasi token' });
    }
});

app.post('/api/logout', authenticateToken, async (req, res) => {
    const token = req.headers['authorization'].split(' ')[1];
    
    sessions.forEach((session, sessionToken) => {
        if (session.token === token) {
            sessions.delete(sessionToken);
        }
    });
    
    res.json({
        success: true,
        message: 'Logout berhasil'
    });
});

app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const db = await mysql.createConnection(dbConfig);
        const [users] = await db.execute(
            `SELECT id, username, email, avatar_color, is_verified, created_at, last_login 
             FROM users WHERE id = ?`,
            [req.user.userId]
        );
        await db.end();
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }
        
        const user = users[0];
        
        res.json({
            success: true,
            user: user
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengambil profil' });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { username, email, avatarColor } = req.body;
        
        if (!username && !email && !avatarColor) {
            return res.status(400).json({ error: 'Tidak ada data yang diperbarui' });
        }
        
        const db = await mysql.createConnection(dbConfig);
        
        if (username) {
            const [existingUsers] = await db.execute(
                'SELECT id FROM users WHERE username = ? AND id != ?',
                [username, req.user.userId]
            );
            
            if (existingUsers.length > 0) {
                await db.end();
                return res.status(400).json({ error: 'Username sudah digunakan' });
            }
        }
        
        if (email) {
            const [existingUsers] = await db.execute(
                'SELECT id FROM users WHERE email = ? AND id != ?',
                [email, req.user.userId]
            );
            
            if (existingUsers.length > 0) {
                await db.end();
                return res.status(400).json({ error: 'Email sudah digunakan' });
            }
        }
        
        const updates = [];
        const params = [];
        
        if (username) {
            updates.push('username = ?');
            params.push(username);
        }
        
        if (email) {
            updates.push('email = ?');
            params.push(email);
        }
        
        if (avatarColor) {
            updates.push('avatar_color = ?');
            params.push(avatarColor);
        }
        
        params.push(req.user.userId);
        
        const updateQuery = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        
        await db.execute(updateQuery, params);
        
        const [users] = await db.execute(
            'SELECT id, username, email, avatar_color, is_verified FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        await db.end();
        
        const user = users[0];
        
        const token = jwt.sign(
            { 
                userId: user.id, 
                username: user.username, 
                email: user.email, 
                avatarColor: user.avatar_color,
                isVerified: user.is_verified 
            },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Profil berhasil diperbarui',
            user: user,
            token: token
        });
        
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui profil' });
    }
});

app.post('/api/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Password lama dan baru harus diisi' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
        }
        
        const db = await mysql.createConnection(dbConfig);
        
        const [users] = await db.execute(
            'SELECT password_hash FROM users WHERE id = ?',
            [req.user.userId]
        );
        
        if (users.length === 0) {
            await db.end();
            return res.status(404).json({ error: 'User tidak ditemukan' });
        }
        
        const user = users[0];
        
        const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!isValidPassword) {
            await db.end();
            return res.status(401).json({ error: 'Password lama salah' });
        }
        
        const saltRounds = 10;
        const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);
        
        await db.execute(
            'UPDATE users SET password_hash = ? WHERE id = ?',
            [newPasswordHash, req.user.userId]
        );
        
        await db.end();
        
        res.json({
            success: true,
            message: 'Password berhasil diubah'
        });
        
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat mengubah password' });
    }
});

app.post('/api/upload-preview', async (req, res) => {
    try {
        const { imageData, fileName, fileSize } = req.body;
        
        if (!imageData) {
            return res.status(400).json({ error: 'Tidak ada data gambar' });
        }

        const previewId = uuidv4();
        const fileExtension = path.extname(fileName || 'photo.jpg') || '.jpg';
        const previewFilename = `preview_${previewId}${fileExtension}`;
        const previewPath = path.join(__dirname, 'uploads', previewFilename);

        const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');
        
        fs.writeFileSync(previewPath, imageBuffer);
        
        console.log(`Preview created: ${previewFilename}`);
        
        res.json({
            success: true,
            previewUrl: `/uploads/${previewFilename}`,
            previewId: previewId,
            filename: previewFilename
        });
    } catch (error) {
        console.error('Preview upload error:', error);
        res.status(500).json({ error: 'Gagal membuat preview' });
    }
});

app.post('/api/cleanup-preview', async (req, res) => {
    try {
        const { previewId } = req.body;
        
        if (previewId) {
            const uploadsDir = path.join(__dirname, 'uploads');
            const files = fs.readdirSync(uploadsDir);
            
            files.forEach(file => {
                if (file.includes(`preview_${previewId}`)) {
                    const filePath = path.join(uploadsDir, file);
                    fs.unlinkSync(filePath);
                    console.log(`Preview cleaned: ${file}`);
                }
            });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Cleanup error:', error);
        res.status(500).json({ error: 'Gagal membersihkan preview' });
    }
});

httpServer.listen(3000, "0.0.0.0", () => {
    console.log("HTTP server running...");
});

const wss = new WebSocket.Server({
    port: 8080,
    host: '0.0.0.0'
});
const clients = new Map();
let db;

async function initializeDB() {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log("Database connected successfully");
        
        const uploadsDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadsDir)) {
            fs.mkdirSync(uploadsDir, { recursive: true });
        }
        
        await createTablesIfNotExist();
        return true;
    } catch (error) {
        console.log("Database connection failed:", error.message);
        return false;
    }
}

async function createTablesIfNotExist() {
    try {
        const [columns] = await db.execute("SHOW COLUMNS FROM chat_messages");
        const columnNames = columns.map(col => col.Field);
        
        const neededColumns = [
            { name: 'username', type: 'VARCHAR(50)', after: 'user_id' },
            { name: 'avatar_color', type: 'VARCHAR(7) DEFAULT "#ff6b9d"', after: 'username' }
        ];
        
        for (const neededCol of neededColumns) {
            if (!columnNames.includes(neededCol.name)) {
                console.log(`Adding column ${neededCol.name} to chat_messages table...`);
                try {
                    await db.execute(`ALTER TABLE chat_messages ADD COLUMN ${neededCol.name} ${neededCol.type} ${neededCol.after ? `AFTER ${neededCol.after}` : ''}`);
                } catch (alterError) {
                    console.log('Alter table error (might already exist):', alterError.message);
                }
            }
        }
        
        if (columnNames.includes('avatar_color')) {
            await db.execute("UPDATE chat_messages SET avatar_color = '#ff6b9d' WHERE avatar_color IS NULL");
        }
        
        try {
            await db.execute(`
                CREATE TABLE IF NOT EXISTS verification_codes (
                    id VARCHAR(36) PRIMARY KEY,
                    user_id VARCHAR(36) NOT NULL,
                    code VARCHAR(6) NOT NULL,
                    type ENUM('email_verification', 'password_reset') NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);
        } catch (error) {
            console.log('Verification codes table already exists');
        }
        
        console.log('Tables initialized successfully');
        
    } catch (error) {
        console.log('Table initialization error:', error.message);
    }
}

function broadcastToBoard(boardId, message, excludeClient = null) {
    let sentCount = 0;
    clients.forEach((clientData, client) => {
        if (clientData.boardId === boardId && client !== excludeClient && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
            sentCount++;
        }
    });
    console.log(`Broadcast to ${sentCount} users: ${message.type}`);
}

function getBoardUsers(boardId) {
    const users = [];
    clients.forEach((clientData) => {
        if (clientData.boardId === boardId) {
            users.push({
                id: clientData.userId,
                username: clientData.username,
                email: clientData.email,
                avatarColor: clientData.avatarColor,
                isOnline: true
            });
        }
    });
    return users;
}

function verifyWebSocketToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

async function getBoardData(boardId) {
    try {
        const [columns] = await db.execute(
            'SELECT * FROM columns WHERE board_id = ? ORDER BY position',
            [boardId]
        );

        const boardData = {
            columns: []
        };

        for (const column of columns) {
            const [tasks] = await db.execute(
                `SELECT t.*, 
                 u1.username as created_by_name,
                 u1.avatar_color as created_by_avatar,
                 u2.username as assigned_to_name,
                 u2.avatar_color as assigned_to_avatar
                 FROM tasks t 
                 LEFT JOIN users u1 ON t.created_by = u1.id 
                 LEFT JOIN users u2 ON t.assigned_to = u2.id
                 WHERE t.column_id = ? 
                 ORDER BY t.position`,
                [column.id]
            );

            boardData.columns.push({
                ...column,
                tasks: tasks
            });
        }

        return boardData;
    } catch (error) {
        console.log('Board data error:', error.message);
        return { columns: [] };
    }
}

async function getChatHistory(boardId, limit = 50) {
    try {
        console.log(`Fetching chat history for board: ${boardId}, limit: ${limit}`);

        let limitNum = parseInt(limit);
        if (isNaN(limitNum) || limitNum <= 0) {
            limitNum = 50;
        }
        if (limitNum > 1000) {
            limitNum = 1000;
        }
        const [messages] = await db.execute(
            `SELECT 
                cm.id,
                cm.board_id,
                cm.user_id,
                COALESCE(cm.username, u.username) as username,
                COALESCE(cm.avatar_color, u.avatar_color, '#ff6b9d') as avatar_color,
                cm.message,
                cm.message_type,
                cm.file_name,
                cm.file_url,
                cm.file_size,
                cm.thumbnail_url,
                cm.width,
                cm.height,
                DATE_FORMAT(cm.created_at, '%H:%i:%s') as created_at
            FROM chat_messages cm
            LEFT JOIN users u ON cm.user_id = u.id
            WHERE cm.board_id = ?
            ORDER BY cm.created_at ASC
            LIMIT ${limitNum}`,  
            [boardId]  
        );
        
        console.log(`✅ Fetched ${messages.length} chat messages successfully`);
        return messages;
    } catch (error) {
        console.error('❌ Chat history error:', error.message);
        console.error('Query parameters:', { boardId, limit });
        return [];
    }
}

async function logActivity(boardId, userId, actionType, description, taskId = null, fileId = null) {
    try {
        const actionTypeMapping = {
            'image_upload': 'file_upload',
            'user_reconnect': 'user_join'
        };
        
        const validActionType = actionTypeMapping[actionType] || actionType;
        
        console.log(`Logging activity: ${actionType} -> ${validActionType} - ${description}`);
        
        await db.execute(
            'INSERT INTO activities (id, board_id, user_id, action_type, description, task_id, file_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [uuidv4(), boardId, userId, validActionType, description, taskId, fileId]
        );
        
        console.log(`Activity logged successfully`);
    } catch (error) {
        console.log('Activity log error:', error.message);
        console.log('Error details:', {
            boardId,
            userId,
            actionType,
            description,
            error: error.message
        });
    }
}

async function saveChatMessage(boardId, userId, username, avatarColor, message) {
    try {
        const messageId = uuidv4();
        await db.execute(
            'INSERT INTO chat_messages (id, board_id, user_id, username, avatar_color, message, message_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [messageId, boardId, userId, username, avatarColor, message, 'text']
        );
        console.log('Chat message saved to database');
        return messageId;
    } catch (error) {
        console.log('Save chat message error:', error.message);
        return null;
    }
}

async function saveImage(imageData, boardId, userId, username, avatarColor) {
    try {
        console.log('Saving image for user:', username, {
            originalName: imageData.originalName,
            size: imageData.size,
            width: imageData.width,
            height: imageData.height
        });

        if (!imageData.data) {
            throw new Error('No image data received');
        }

        const imageId = uuidv4();
        const originalName = imageData.originalName || 'photo.jpg';
        const fileExtension = path.extname(originalName) || '.jpg';
        const filename = `${imageId}${fileExtension}`;
        const thumbnailFilename = `${imageId}_thumb${fileExtension}`;
        const filePath = path.join(__dirname, 'uploads', filename);
        const thumbnailPath = path.join(__dirname, 'uploads', thumbnailFilename);
        
        let imageBuffer;
        try {
            imageBuffer = Buffer.from(imageData.data, 'base64');
            
            if (imageBuffer.length === 0) {
                throw new Error('Empty image buffer');
            }
            
            const maxSize = 5 * 1024 * 1024;
            if (imageBuffer.length > maxSize) {
                throw new Error(`Image size ${imageBuffer.length} bytes exceeds maximum ${maxSize} bytes`);
            }
            
            console.log(`Image buffer size: ${imageBuffer.length} bytes`);
            
        } catch (bufferError) {
            console.error('Buffer creation error:', bufferError);
            throw new Error('Invalid image data format');
        }
        
        fs.writeFileSync(filePath, imageBuffer);
        console.log(`Original image saved: ${filename}`);
        
        let width = imageData.width || 0;
        let height = imageData.height || 0;
        let thumbnailWidth = 0;
        let thumbnailHeight = 0;

        try {
            const metadata = await sharp(imageBuffer).metadata();
            width = metadata.width || width;
            height = metadata.height || height;
            
            await sharp(imageBuffer)
                .resize(300, 300, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .toFile(thumbnailPath);
            
            const thumbMetadata = await sharp(thumbnailPath).metadata();
            thumbnailWidth = thumbMetadata.width || 300;
            thumbnailHeight = thumbMetadata.height || 300;
            
            console.log(`Thumbnail created: ${thumbnailFilename} (${thumbnailWidth}x${thumbnailHeight})`);
            
        } catch (sharpError) {
            console.log('Sharp processing error, using fallback:', sharpError.message);
            thumbnailWidth = Math.min(width || 300, 300);
            thumbnailHeight = Math.min(height || 300, 300);
        }
        
        await db.execute(
            `INSERT INTO chat_messages 
             (id, board_id, user_id, username, avatar_color, message, message_type, file_name, file_url, file_size, thumbnail_url, width, height) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                imageId, 
                boardId || 'default-board', 
                userId, 
                username || 'Unknown',
                avatarColor || '#ff6b9d',
                `📷 ${originalName}`,
                'image', 
                originalName, 
                `/uploads/${filename}`,
                imageData.size || imageBuffer.length,
                `/uploads/${thumbnailFilename}`,
                thumbnailWidth,
                thumbnailHeight
            ]
        );
        
        console.log(`Image saved to database: ${filename}`);
        
        return {
            id: imageId,
            filename: filename,
            thumbnailFilename: thumbnailFilename,
            width: thumbnailWidth,
            height: thumbnailHeight
        };
        
    } catch (error) {
        console.error('Save image error:', error.message);
        console.error('Error stack:', error.stack);
        return null;
    }
}

async function getMessage(messageId) {
    try {
        const [messages] = await db.execute(
            `SELECT cm.*, u.username, u.avatar_color 
             FROM chat_messages cm 
             JOIN users u ON cm.user_id = u.id 
             WHERE cm.id = ?`,
            [messageId]
        );
        return messages[0] || null;
    } catch (error) {
        console.log('Get message error:', error.message);
        return null;
    }
}

async function createTask(taskData, userId, username) {
    try {
        const taskId = uuidv4();
        
        const [positions] = await db.execute(
            'SELECT MAX(position) as maxPos FROM tasks WHERE column_id = ?',
            [taskData.columnId]
        );
        const position = (positions[0].maxPos || 0) + 1;

        await db.execute(
            `INSERT INTO tasks (id, column_id, title, description, position, created_by, assigned_to, due_date, priority, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                taskId, 
                taskData.columnId, 
                taskData.title, 
                taskData.description || '', 
                position, 
                userId,
                taskData.assignedTo || null,
                taskData.dueDate || null,
                taskData.priority || 'medium', 
                'pending'
            ]
        );

        await logActivity('default-board', userId, 'task_create', 
            `${username} created task "${taskData.title}"`, taskId);

        return taskId;
    } catch (error) {
        console.log('Create task error:', error.message);
        return null;
    }
}

async function moveTask(taskId, newColumnId, newPosition, userId, username) {
    try {
        const [tasks] = await db.execute(
            'SELECT title, column_id FROM tasks WHERE id = ?',
            [taskId]
        );

        if (tasks.length === 0) return false;

        const task = tasks[0];
        const oldColumnId = task.column_id;

        let status = 'pending';
        if (newColumnId.includes('progress')) status = 'in_progress';
        if (newColumnId.includes('done')) status = 'completed';

        await db.execute(
            'UPDATE tasks SET column_id = ?, position = ?, status = ? WHERE id = ?',
            [newColumnId, newPosition, status, taskId]
        );

        await logActivity('default-board', userId, 'task_move', 
            `${username} moved task "${task.title}"`, taskId);

        return true;
    } catch (error) {
        console.log('Move task error:', error.message);
        return false;
    }
}

wss.on('connection', (ws) => {
    const clientId = uuidv4();
    console.log(`Client connected: ${clientId}`);

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`Received: ${message.type} from ${message.username || 'unknown'}`);

            const existingClientData = clients.get(ws);
            
            switch (message.type) {
                case 'JOIN_BOARD':
                    if (!message.token) {
                        ws.send(JSON.stringify({
                            type: 'AUTH_REQUIRED',
                            message: 'Authentication required. Please login first.'
                        }));
                        ws.close();
                        return;
                    }
                    
                    const decoded = verifyWebSocketToken(message.token);
                    if (!decoded) {
                        ws.send(JSON.stringify({
                            type: 'AUTH_INVALID',
                            message: 'Invalid token. Please login again.'
                        }));
                        ws.close();
                        return;
                    }
                    
                    const [users] = await db.execute(
                        'SELECT id, username, email, avatar_color, is_verified FROM users WHERE id = ?',
                        [decoded.userId]
                    );
                    
                    if (users.length === 0) {
                        ws.send(JSON.stringify({
                            type: 'USER_NOT_FOUND',
                            message: 'User not found. Please register first.'
                        }));
                        ws.close();
                        return;
                    }
                    
                    const user = users[0];
                    
                    const userData = {
                        clientId,
                        username: user.username,
                        email: user.email,
                        boardId: 'default-board',
                        userId: user.id,
                        avatarColor: user.avatar_color,
                        sessionToken: uuidv4(),
                        token: message.token
                    };
                    
                    sessions.set(userData.sessionToken, {
                        userId: userData.userId,
                        username: userData.username,
                        email: userData.email,
                        avatarColor: userData.avatarColor,
                        boardId: 'default-board',
                        token: message.token,
                        createdAt: Date.now()
                    });
                    
                    clients.set(ws, userData);

                    const boardData = await getBoardData('default-board');
                    const chatHistory = await getChatHistory('default-board');
                    
                    ws.send(JSON.stringify({
                        type: 'BOARD_JOINED',
                        board: { id: 'default-board', name: 'Team Project Board' },
                        users: getBoardUsers('default-board'),
                        columns: boardData.columns,
                        chatHistory: chatHistory,
                        currentUser: {
                            id: userData.userId,
                            username: userData.username,
                            email: userData.email,
                            avatarColor: userData.avatarColor,
                            isVerified: user.is_verified
                        },
                        sessionToken: userData.sessionToken
                    }));

                    broadcastToBoard('default-board', {
                        type: 'USER_JOINED',
                        user: {
                            id: userData.userId,
                            username: userData.username,
                            email: userData.email,
                            avatarColor: userData.avatarColor,
                            isVerified: user.is_verified
                        },
                        users: getBoardUsers('default-board'),
                        timestamp: new Date().toLocaleTimeString()
                    }, ws);

                    broadcastToBoard('default-board', {
                        type: 'USERS_LIST_UPDATED',
                        users: getBoardUsers('default-board'),
                        timestamp: new Date().toLocaleTimeString()
                    }, ws);

                    await logActivity('default-board', userData.userId, 'user_join', 
                        `${userData.username} joined the board`);
                    break;

                case 'RECONNECT':
                    const sessionData = sessions.get(message.sessionToken);
                    
                    if (sessionData) {
                        const decodedToken = verifyWebSocketToken(sessionData.token);
                        if (!decodedToken) {
                            ws.send(JSON.stringify({
                                type: 'SESSION_EXPIRED',
                                message: 'Session expired. Please login again.'
                            }));
                            ws.close();
                            return;
                        }
                        
                        const reconnectClientData = {
                            clientId,
                            username: sessionData.username,
                            email: sessionData.email,
                            boardId: sessionData.boardId,
                            userId: sessionData.userId,
                            avatarColor: sessionData.avatarColor,
                            token: sessionData.token
                        };
                        
                        clients.set(ws, reconnectClientData);

                        const boardData = await getBoardData('default-board');
                        const chatHistory = await getChatHistory('default-board');
                        
                        ws.send(JSON.stringify({
                            type: 'BOARD_JOINED',
                            board: { id: 'default-board', name: 'Team Project Board' },
                            users: getBoardUsers('default-board'),
                            columns: boardData.columns,
                            chatHistory: chatHistory,
                            currentUser: {
                                id: sessionData.userId,
                                username: sessionData.username,
                                email: sessionData.email,
                                avatarColor: sessionData.avatarColor
                            },
                            sessionToken: message.sessionToken
                        }));

                        broadcastToBoard('default-board', {
                            type: 'USER_RECONNECTED',
                            user: {
                                id: sessionData.userId,
                                username: sessionData.username,
                                email: sessionData.email,
                                avatarColor: sessionData.avatarColor
                            },
                            users: getBoardUsers('default-board'),
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);

                        broadcastToBoard('default-board', {
                            type: 'USERS_LIST_UPDATED',
                            users: getBoardUsers('default-board'),
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);

                        await logActivity('default-board', sessionData.userId, 'user_reconnect', 
                            `${sessionData.username} reconnected to the board`);
                    } else {
                        ws.send(JSON.stringify({
                            type: 'SESSION_INVALID',
                            message: 'Session expired. Please login again.'
                        }));
                        ws.close();
                    }
                    break;

                case 'CREATE_TASK':
                    if (existingClientData) {
                        const taskId = await createTask(message.taskData, existingClientData.userId, existingClientData.username);
                        
                        if (taskId) {
                            const updatedBoard = await getBoardData('default-board');
                            
                            broadcastToBoard('default-board', {
                                type: 'TASK_CREATED',
                                taskId: taskId,
                                taskData: message.taskData,
                                createdBy: existingClientData.username,
                                boardData: updatedBoard,
                                timestamp: new Date().toLocaleTimeString()
                            });
                        }
                    }
                    break;

                case 'MOVE_TASK':
                    if (existingClientData) {
                        const success = await moveTask(
                            message.taskId, 
                            message.newColumnId, 
                            message.newPosition,
                            existingClientData.userId,
                            existingClientData.username
                        );
                        
                        if (success) {
                            const updatedBoard = await getBoardData('default-board');
                            
                            broadcastToBoard('default-board', {
                                type: 'TASK_MOVED',
                                taskId: message.taskId,
                                newColumnId: message.newColumnId,
                                newPosition: message.newPosition,
                                movedBy: existingClientData.username,
                                boardData: updatedBoard,
                                timestamp: new Date().toLocaleTimeString()
                            });
                        }
                    }
                    break;

                case 'SEND_MESSAGE':
                    if (existingClientData && message.message.trim()) {
                        console.log('Saving chat message from:', existingClientData.username);
                        
                        const messageId = await saveChatMessage(
                            'default-board', 
                            existingClientData.userId, 
                            existingClientData.username,
                            existingClientData.avatarColor,
                            message.message.trim()
                        );
                        
                        if (messageId) {
                            const savedMessage = await getMessage(messageId);
                            
                            const chatMessage = {
                                type: 'CHAT_MESSAGE',
                                messageId: messageId,
                                username: existingClientData.username,
                                message: message.message.trim(),
                                avatarColor: existingClientData.avatarColor,
                                timestamp: new Date().toLocaleTimeString()
                            };
                            
                            console.log('Broadcasting chat message');
                            broadcastToBoard('default-board', chatMessage);

                            await logActivity('default-board', existingClientData.userId, 'chat_message', 
                                `${existingClientData.username}: ${message.message.trim()}`);
                        }
                    }
                    break;

                case 'UPLOAD_IMAGE':
                    if (existingClientData && message.imageData) {
                        console.log(`Uploading image from ${existingClientData.username}:`, {
                            filename: message.imageData.originalName,
                            size: message.imageData.size,
                            dataLength: message.imageData.data?.length
                        });
                        
                        const imageResult = await saveImage(
                            message.imageData, 
                            'default-board', 
                            existingClientData.userId,
                            existingClientData.username,
                            existingClientData.avatarColor
                        );
                        
                        if (imageResult) {
                            const imageInfo = await getMessage(imageResult.id);
                            
                            if (imageInfo) {
                                ws.send(JSON.stringify({
                                    type: 'IMAGE_UPLOAD_SUCCESS',
                                    messageId: imageResult.id,
                                    imageUrl: imageInfo.file_url,
                                    thumbnailUrl: imageInfo.thumbnail_url,
                                    timestamp: new Date().toLocaleTimeString()
                                }));
                                
                                broadcastToBoard('default-board', {
                                    type: 'IMAGE_MESSAGE',
                                    messageId: imageResult.id,
                                    username: existingClientData.username,
                                    avatarColor: existingClientData.avatarColor,
                                    filename: imageInfo.file_name,
                                    imageUrl: imageInfo.file_url,
                                    thumbnailUrl: imageInfo.thumbnail_url,
                                    fileSize: imageInfo.file_size,
                                    width: imageInfo.width,
                                    height: imageInfo.height,
                                    timestamp: new Date().toLocaleTimeString()
                                }, ws);

                                await logActivity('default-board', existingClientData.userId, 'image_upload', 
                                    `${existingClientData.username} uploaded image: ${imageInfo.file_name}`);
                                    
                            } else {
                                ws.send(JSON.stringify({
                                    type: 'IMAGE_UPLOAD_ERROR',
                                    error: 'Failed to retrieve image info from database'
                                }));
                            }
                        } else {
                            console.error('Image save returned null');
                            ws.send(JSON.stringify({
                                type: 'IMAGE_UPLOAD_ERROR',
                                error: 'Failed to save image to server'
                            }));
                        }
                    } else {
                        console.error('No client data or image data');
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'IMAGE_UPLOAD_ERROR',
                                error: 'Invalid upload request'
                            }));
                        }
                    }
                    break;

                case 'TYPING_START':
                    if (existingClientData) {
                        broadcastToBoard('default-board', {
                            type: 'USER_TYPING',
                            username: existingClientData.username,
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);
                    }
                    break;

                case 'TYPING_STOP':
                    if (existingClientData) {
                        broadcastToBoard('default-board', {
                            type: 'USER_STOPPED_TYPING',
                            username: existingClientData.username,
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);
                    }
                    break;
                    
                case 'PREVIEW_IMAGE':
                    if (existingClientData && message.imageData) {
                        ws.send(JSON.stringify({
                            type: 'IMAGE_PREVIEW',
                            previewData: message.imageData.data,
                            filename: message.imageData.originalName,
                            timestamp: new Date().toLocaleTimeString()
                        }));
                    }
                    break;
                    
                case 'LOGOUT':
                    if (existingClientData) {
                        clients.delete(ws);
                        
                        sessions.forEach((session, token) => {
                            if (session.userId === existingClientData.userId) {
                                sessions.delete(token);
                            }
                        });
                        
                        broadcastToBoard('default-board', {
                            type: 'USER_LEFT',
                            username: existingClientData.username,
                            users: getBoardUsers('default-board'),
                            timestamp: new Date().toLocaleTimeString()
                        });
                        
                        broadcastToBoard('default-board', {
                            type: 'USERS_LIST_UPDATED',
                            users: getBoardUsers('default-board'),
                            timestamp: new Date().toLocaleTimeString()
                        });
                        
                        await logActivity('default-board', existingClientData.userId, 'user_leave', 
                            `${existingClientData.username} logged out`);
                        
                        ws.close();
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', async () => {
        const clientData = clients.get(ws);
        if (clientData) {
            console.log(`Client disconnected: ${clientData.username}`);
            
            clients.delete(ws);
            
            broadcastToBoard('default-board', {
                type: 'USER_LEFT',
                username: clientData.username,
                users: getBoardUsers('default-board'),
                timestamp: new Date().toLocaleTimeString()
            });

            broadcastToBoard('default-board', {
                type: 'USERS_LIST_UPDATED',
                users: getBoardUsers('default-board'),
                timestamp: new Date().toLocaleTimeString()
            });

            await logActivity('default-board', clientData.userId, 'user_leave', 
                `${clientData.username} left the board`);
        }
    });

    ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Welcome to Collaborative To-Do Board! Please authenticate to join the board.',
        timestamp: new Date().toLocaleTimeString()
    }));
});

setInterval(() => {
    const now = Date.now();
    let cleanedCount = 0;
    
    sessions.forEach((session, token) => {
        if (now - session.createdAt > 24 * 60 * 60 * 1000) {
            sessions.delete(token);
            cleanedCount++;
        }
    });
    
    if (cleanedCount > 0) {
        console.log(`Session cleanup: Removed ${cleanedCount} expired sessions`);
    }
}, 60 * 60 * 1000);

setInterval(() => {
    const uploadsDir = path.join(__dirname, 'uploads');
    if (fs.existsSync(uploadsDir)) {
        const files = fs.readdirSync(uploadsDir);
        let cleanedCount = 0;
        
        files.forEach(file => {
            if (file.startsWith('preview_')) {
                const filePath = path.join(uploadsDir, file);
                const stats = fs.statSync(filePath);
                const now = Date.now();
                
                if (now - stats.mtimeMs > 60 * 60 * 1000) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            }
        });
        
        if (cleanedCount > 0) {
            console.log(`Preview cleanup: Removed ${cleanedCount} old preview files`);
        }
    }
}, 30 * 60 * 1000);

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    let wifiIP = null;
    let ethernetIP = null;

    for (const name in interfaces) {
        for (const iface of interfaces[name]) {

            if (iface.family !== 'IPv4' || iface.internal) continue;

            if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wifi')) {
                return iface.address;
            }

            if (name.toLowerCase().includes('ethernet') && !name.toLowerCase().includes('vEthernet')) {
                ethernetIP = iface.address;
            }
        }
    }

    if (ethernetIP) return ethernetIP;

    return 'localhost';
}

console.log('Note: Install dependencies with: npm install bcrypt jsonwebtoken cookie-parser cors sharp');

initializeDB().then(success => {
    if (success) {
        const ip = getLocalIP();
        console.log('Server ready for real-time collaboration!');
        console.log(`HTTP Server: http://${ip}:3000`);
        console.log(`WebSocket Server: ws://${ip}:8080`);
    }
});