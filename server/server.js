const WebSocket = require('ws');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'websocket_progjar'
};

const express = require('express');
const http = require('http');

const app = express();

app.use(express.static(path.join(__dirname, '../client')));

const httpServer = http.createServer(app);

httpServer.listen(3000, () => {
    console.log("HTTP server running at http://localhost:3000");
});

const server = new WebSocket.Server({ port: 8080 });
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
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100),
            avatar_color VARCHAR(7) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        
        `CREATE TABLE IF NOT EXISTS boards (
            id VARCHAR(36) PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            description TEXT,
            created_by VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS columns (
            id VARCHAR(36) PRIMARY KEY,
            board_id VARCHAR(36) NOT NULL,
            title VARCHAR(100) NOT NULL,
            position INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS tasks (
            id VARCHAR(36) PRIMARY KEY,
            column_id VARCHAR(36) NOT NULL,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            position INT NOT NULL,
            created_by VARCHAR(36) NOT NULL,
            assigned_to VARCHAR(36),
            due_date DATE,
            priority ENUM('low', 'medium', 'high') DEFAULT 'medium',
            status ENUM('pending', 'in_progress', 'completed') DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (column_id) REFERENCES columns(id),
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (assigned_to) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS chat_messages (
            id VARCHAR(36) PRIMARY KEY,
            board_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            message TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )`,
        
        `CREATE TABLE IF NOT EXISTS activities (
            id VARCHAR(36) PRIMARY KEY,
            board_id VARCHAR(36) NOT NULL,
            user_id VARCHAR(36) NOT NULL,
            action_type VARCHAR(50) NOT NULL,
            description TEXT NOT NULL,
            task_id VARCHAR(36),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (board_id) REFERENCES boards(id),
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (task_id) REFERENCES tasks(id)
        )`
    ];

    for (const tableSql of tables) {
        try {
            await db.execute(tableSql);
        } catch (error) {
            console.log('Table creation error:', error.message);
        }
    }

    await seedInitialData();
}

async function seedInitialData() {
    try {
        const defaultBoardId = 'default-board';
        
        const [existingBoards] = await db.execute('SELECT id FROM boards WHERE id = ?', [defaultBoardId]);
        if (existingBoards.length === 0) {
            const defaultUserId = 'system-user';
            
            await db.execute(
                'INSERT IGNORE INTO users (id, username, email, avatar_color) VALUES (?, ?, ?, ?)',
                [defaultUserId, 'system', 'system@example.com', '#666666']
            );
            
            await db.execute(
                'INSERT INTO boards (id, name, description, created_by) VALUES (?, ?, ?, ?)',
                [defaultBoardId, 'Team Project Board', 'Collaborative task management', defaultUserId]
            );
            
            const columns = [
                { id: uuidv4(), title: 'To Do', position: 0 },
                { id: uuidv4(), title: 'In Progress', position: 1 },
                { id: uuidv4(), title: 'Done', position: 2 }
            ];
            
            for (const column of columns) {
                await db.execute(
                    'INSERT INTO columns (id, board_id, title, position) VALUES (?, ?, ?, ?)',
                    [column.id, defaultBoardId, column.title, column.position]
                );
                
                if (column.title === 'To Do') {
                    await db.execute(
                        `INSERT INTO tasks (id, column_id, title, description, position, created_by, priority, status) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [uuidv4(), column.id, 'Welcome to CollabBoard!', 'This is a sample task. Drag me to different column...', 0, defaultUserId, 'medium', 'pending']
                    );
                }
            }
            
            console.log('Initial data seeded successfully');
        }
    } catch (error) {
        console.log('Initial data seeding error:', error.message);
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

async function ensureUserExists(userId, username, email = null) {
    try {
        const [existingUsers] = await db.execute('SELECT id, email, avatar_color FROM users WHERE username = ?', [username]);
        
        if (existingUsers.length > 0) {
            const existingUser = existingUsers[0];
            
            if (!existingUser.email && email) {
                await db.execute('UPDATE users SET email = ? WHERE id = ?', [email, existingUser.id]);
                console.log(`Updated email for user: ${username}`);
            }
            
            console.log(`User exists: ${username}`);
            return {
                userId: existingUser.id,
                email: existingUser.email || email,
                avatarColor: existingUser.avatar_color,
                isNew: false
            };
        } else {
            const avatarColors = ['#ff6b9d', '#cdb4db', '#bde0fe', '#ffd166', '#06d6a0', '#118ab2'];
            const avatarColor = avatarColors[Math.floor(Math.random() * avatarColors.length)];
            
            const userEmail = email || `${username}@example.com`;
            
            await db.execute(
                'INSERT INTO users (id, username, email, avatar_color) VALUES (?, ?, ?, ?)',
                [userId, username, userEmail, avatarColor]
            );
            console.log(`Created new user: ${username}`);
            return {
                userId: userId,
                email: userEmail,
                avatarColor: avatarColor,
                isNew: true
            };
        }
    } catch (error) {
        console.log('User creation/check failed:', error.message);
        return {
            userId: userId,
            email: email || `${username}@example.com`,
            avatarColor: '#ff6b9d',
            isNew: false
        };
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
        const [messages] = await db.execute(
            `SELECT cm.*, u.username, u.avatar_color 
             FROM chat_messages cm 
             JOIN users u ON cm.user_id = u.id 
             WHERE cm.board_id = ? 
             ORDER BY cm.created_at DESC 
             LIMIT 50`,
            [boardId]
        );
        return messages.reverse();
    } catch (error) {
        console.log('Chat history error:', error.message);
        return [];
    }
}

async function logActivity(boardId, userId, actionType, description, taskId = null) {
    try {
        await db.execute(
            'INSERT INTO activities (id, board_id, user_id, action_type, description, task_id) VALUES (?, ?, ?, ?, ?, ?)',
            [uuidv4(), boardId, userId, actionType, description, taskId]
        );
    } catch (error) {
        console.log('Activity log error:', error.message);
    }
}

async function saveChatMessage(boardId, userId, message) {
    try {
        const messageId = uuidv4();
        await db.execute(
            'INSERT INTO chat_messages (id, board_id, user_id, message) VALUES (?, ?, ?, ?)',
            [messageId, boardId, userId, message]
        );
        console.log('Chat message saved to database');
        return true;
    } catch (error) {
        console.log('Save chat message error:', error.message);
        return false;
    }
}

async function saveFile(fileData, boardId, userId) {
    try {
        const fileId = uuidv4();
        const fileExtension = path.extname(fileData.originalName);
        const filename = `${fileId}${fileExtension}`;
        const filePath = path.join(__dirname, 'uploads', filename);
        
        const fileBuffer = Buffer.from(fileData.data, 'base64');
        fs.writeFileSync(filePath, fileBuffer);
        
        await db.execute(
            'INSERT INTO files (id, board_id, user_id, filename, original_name, size, mime_type, url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [fileId, boardId, userId, filename, fileData.originalName, fileData.size, fileData.mimeType, `/files/${filename}`]
        );
        
        return fileId;
    } catch (error) {
        console.log('Save file error:', error.message);
        return null;
    }
}

async function getFile(fileId) {
    try {
        const [files] = await db.execute(
            'SELECT * FROM files WHERE id = ?',
            [fileId]
        );
        return files[0] || null;
    } catch (error) {
        console.log('Get file error:', error.message);
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

server.on('connection', (ws) => {
    const clientId = uuidv4();
    console.log(`Client connected: ${clientId}`);

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data);
            console.log(`Received: ${message.type} from ${message.username || 'unknown'}`);

            const clientData = clients.get(ws);
            
            switch (message.type) {
                case 'JOIN_BOARD':
                    const userData = {
                        clientId,
                        username: message.username,
                        email: message.email,
                        boardId: 'default-board',
                        userId: uuidv4(),
                        avatarColor: '#ff6b9d'
                    };
                    clients.set(ws, userData);

                    const userResult = await ensureUserExists(userData.userId, userData.username, userData.email);
                    
                    userData.userId = userResult.userId;
                    userData.email = userResult.email;
                    userData.avatarColor = userResult.avatarColor;

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
                            avatarColor: userData.avatarColor
                        }
                    }));

                    broadcastToBoard('default-board', {
                        type: 'USER_JOINED',
                        user: {
                            id: userData.userId,
                            username: userData.username,
                            email: userData.email,
                            avatarColor: userData.avatarColor
                        },
                        users: getBoardUsers('default-board'),
                        timestamp: new Date().toLocaleTimeString()
                    }, ws);

                    await logActivity('default-board', userData.userId, 'user_join', 
                        `${userData.username} joined the board`);
                    break;

                case 'CREATE_TASK':
                    if (clientData) {
                        const taskId = await createTask(message.taskData, clientData.userId, clientData.username);
                        
                        if (taskId) {
                            const updatedBoard = await getBoardData('default-board');
                            
                            broadcastToBoard('default-board', {
                                type: 'TASK_CREATED',
                                taskId: taskId,
                                taskData: message.taskData,
                                createdBy: clientData.username,
                                boardData: updatedBoard,
                                timestamp: new Date().toLocaleTimeString()
                            });
                        }
                    }
                    break;

                case 'MOVE_TASK':
                    if (clientData) {
                        const success = await moveTask(
                            message.taskId, 
                            message.newColumnId, 
                            message.newPosition,
                            clientData.userId,
                            clientData.username
                        );
                        
                        if (success) {
                            const updatedBoard = await getBoardData('default-board');
                            
                            broadcastToBoard('default-board', {
                                type: 'TASK_MOVED',
                                taskId: message.taskId,
                                newColumnId: message.newColumnId,
                                newPosition: message.newPosition,
                                movedBy: clientData.username,
                                boardData: updatedBoard,
                                timestamp: new Date().toLocaleTimeString()
                            });
                        }
                    }
                    break;

                case 'SEND_MESSAGE':
                    if (clientData && message.message.trim()) {
                        console.log('Saving chat message from:', clientData.username);
                        
                        const saved = await saveChatMessage('default-board', clientData.userId, message.message.trim());
                        
                        if (saved) {
                            const chatMessage = {
                                type: 'CHAT_MESSAGE',
                                username: clientData.username,
                                message: message.message.trim(),
                                avatarColor: clientData.avatarColor,
                                timestamp: new Date().toLocaleTimeString()
                            };
                            
                            console.log('Broadcasting chat message');
                            broadcastToBoard('default-board', chatMessage);

                            await logActivity('default-board', clientData.userId, 'chat_message', 
                                `${clientData.username}: ${message.message.trim()}`);
                        }
                    }
                    break;

                case 'UPLOAD_FILE':
                    if (clientData && message.fileData) {
                        const fileId = await saveFile(message.fileData, 'default-board', clientData.userId);
                        
                        if (fileId) {
                            const fileInfo = await getFile(fileId);
                            
                            broadcastToBoard('default-board', {
                                type: 'FILE_MESSAGE',
                                fileId: fileId,
                                filename: fileInfo.original_name,
                                uploadedBy: clientData.username,
                                fileUrl: fileInfo.url,
                                fileSize: fileInfo.size,
                                mimeType: fileInfo.mime_type,
                                timestamp: new Date().toLocaleTimeString()
                            });

                            await logActivity('default-board', clientData.userId, 'file_upload', 
                                `${clientData.username} uploaded file: ${fileInfo.original_name}`);
                        }
                    }
                    break;

                case 'TYPING_START':
                    if (clientData) {
                        broadcastToBoard('default-board', {
                            type: 'USER_TYPING',
                            username: clientData.username,
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);
                    }
                    break;

                case 'TYPING_STOP':
                    if (clientData) {
                        broadcastToBoard('default-board', {
                            type: 'USER_STOPPED_TYPING',
                            username: clientData.username,
                            timestamp: new Date().toLocaleTimeString()
                        }, ws);
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
            
            broadcastToBoard('default-board', {
                type: 'USER_LEFT',
                username: clientData.username,
                users: getBoardUsers('default-board'),
                timestamp: new Date().toLocaleTimeString()
            });

            await logActivity('default-board', clientData.userId, 'user_leave', 
                `${clientData.username} left the board`);

            clients.delete(ws);
        }
    });

    ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Welcome to Collaborative To-Do Board!',
        timestamp: new Date().toLocaleTimeString()
    }));
});

console.log('Collaborative To-Do Board Server running on port 8080');
initializeDB().then(success => {
    if (success) {
        console.log('Server ready for real-time collaboration!');
    }
});