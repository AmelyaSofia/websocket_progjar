class CollabBoardApp {
    constructor() {
        this.ws = null;
        this.currentUser = null;
        this.boardData = {
            columns: [],
            users: []
        };
        
        this.draggedTask = null;
        this.dragSourceColumn = null;
        this.typingTimer = null;
        this.selectedFile = null;

        this.initializeApp();
    }

    initializeApp() {
        this.bindEvents();
        this.showLogin();
        
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
        
        window.addEventListener('unload', () => {
            this.cleanup();
        });
    }

    cleanup() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    bindEvents() {
        document.getElementById('joinBtn').addEventListener('click', () => this.joinBoard());
        document.getElementById('usernameInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinBoard();
        });
        document.getElementById('emailInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinBoard();
        });

        document.getElementById('addTaskBtn').addEventListener('click', () => this.showAddTaskModal());
        document.getElementById('leaveBtn').addEventListener('click', () => this.leaveBoard());

        document.getElementById('createTaskBtn').addEventListener('click', () => this.createTask());
        document.getElementById('cancelTaskBtn').addEventListener('click', () => this.hideAddTaskModal());
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });
        
        document.getElementById('sendBtn').addEventListener('click', () => this.sendMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });

        document.getElementById('clearChatBtn').addEventListener('click', () => this.clearChat());
        document.getElementById('fileUploadBtn').addEventListener('click', () => this.showFileUploadModal());

        document.getElementById('chatInput').addEventListener('input', () => this.handleTyping());
        document.getElementById('chatInput').addEventListener('blur', () => this.stopTyping());

        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('addTaskModal')) {
                this.hideAddTaskModal();
            }
            if (e.target === document.getElementById('fileUploadModal')) {
                this.hideFileUploadModal();
            }
        });

        document.getElementById('taskSearch').addEventListener('input', (e) => this.searchTasks(e.target.value));

        this.initializeFileUpload();
    }

    initializeFileUpload() {
        const fileInput = document.getElementById('fileInput');
        const fileUploadArea = document.getElementById('fileUploadArea');
        const browseFilesBtn = document.getElementById('browseFilesBtn');
        const uploadFileBtn = document.getElementById('uploadFileBtn');
        const cancelFileBtn = document.getElementById('cancelFileBtn');

        browseFilesBtn.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        fileUploadArea.addEventListener('click', () => fileInput.click());
        
        fileUploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileUploadArea.classList.add('drag-over');
        });
        
        fileUploadArea.addEventListener('dragleave', () => {
            fileUploadArea.classList.remove('drag-over');
        });
        
        fileUploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            fileUploadArea.classList.remove('drag-over');
            if (e.dataTransfer.files.length > 0) {
                this.handleFileSelect(e.dataTransfer.files[0]);
            }
        });

        uploadFileBtn.addEventListener('click', () => this.uploadFile());
        cancelFileBtn.addEventListener('click', () => this.hideFileUploadModal());
    }

    showLogin() {
        document.getElementById('onlineCount').textContent = '0';
        document.getElementById('currentUser').textContent = 'You';
        document.getElementById('userAvatar').style.backgroundColor = '';
        document.getElementById('userAvatar').textContent = '';
        
        document.getElementById('loginSection').classList.add('active');
        document.getElementById('appSection').classList.remove('active');
    }

    showApp() {
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('appSection').classList.add('active');
    }

    joinBoard() {
        const username = document.getElementById('usernameInput').value.trim();
        const email = document.getElementById('emailInput').value.trim();
        
        if (!username) {
            alert('Please enter your name');
            return;
        }

        if (!email) {
            alert('Please enter your email');
            return;
        }

        if (!this.validateEmail(email)) {
            alert('Please enter a valid email address');
            return;
        }

        document.getElementById('loadingOverlay').classList.add('active');
        this.connectWebSocket(username, email);
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    connectWebSocket(username, email) {
        this.ws = new WebSocket('ws://localhost:8080');

        this.ws.onopen = () => {
            this.ws.send(JSON.stringify({
                type: 'JOIN_BOARD',
                username: username,
                email: email
            }));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.ws.onclose = () => {
            document.getElementById('loadingOverlay').classList.remove('active');
            this.addSystemMessage('Disconnected from board. Reconnecting...');
            
            setTimeout(() => {
                if (this.ws.readyState === WebSocket.CLOSED) {
                    this.connectWebSocket(this.currentUser?.username || 'User', this.currentUser?.email || 'user@example.com');
                }
            }, 3000);
        };

        this.ws.onerror = (error) => {
            document.getElementById('loadingOverlay').classList.remove('active');
            this.addSystemMessage('Failed to connect to board server');
        };
    }

    handleMessage(data) {
        switch (data.type) {
            case 'CONNECTED':
                document.getElementById('loadingOverlay').classList.remove('active');
                break;

            case 'BOARD_JOINED':
                this.handleBoardJoined(data);
                break;

            case 'USER_JOINED':
                this.handleUserJoined(data);
                break;

            case 'USER_LEFT':
                this.handleUserLeft(data);
                break;

            case 'TASK_CREATED':
                this.handleTaskCreated(data);
                break;

            case 'TASK_MOVED':
                this.handleTaskMoved(data);
                break;

            case 'CHAT_MESSAGE':
                this.handleChatMessage(data);
                break;

            case 'FILE_MESSAGE':
                this.handleFileMessage(data);
                break;

            case 'USER_TYPING':
                this.handleUserTyping(data);
                break;

            case 'USER_STOPPED_TYPING':
                this.handleUserStoppedTyping(data);
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    }

    handleBoardJoined(data) {
        this.currentUser = data.currentUser;
        this.boardData.columns = data.columns;
        this.boardData.users = data.users;

        this.showApp();
        this.updateUserInterface();
        this.renderColumns();
        this.updateOnlineUsers();

        document.getElementById('userAvatar').style.backgroundColor = this.currentUser.avatarColor;
        document.getElementById('userAvatar').textContent = this.currentUser.username.charAt(0).toUpperCase();
        document.getElementById('currentUser').textContent = this.currentUser.username;

        if (data.chatHistory) {
            this.loadChatHistory(data.chatHistory);
        }

        this.addSystemMessage(`Welcome to the board, ${this.currentUser.username}!`);
    }

    handleUserJoined(data) {
        this.boardData.users = data.users;
        this.updateOnlineUsers();
        
        this.addActivityMessage({
            avatarColor: data.user.avatarColor,
            username: 'System',
            message: `${data.user.username} joined the board`,
            timestamp: data.timestamp
        });

        this.addSystemMessage(`${data.user.username} joined the board`);
    }

    handleUserLeft(data) {
        this.boardData.users = data.users;
        this.updateOnlineUsers();
        
        this.addActivityMessage({
            avatarColor: '#ff6b9d',
            username: 'System',
            message: `${data.username} left the board`,
            timestamp: data.timestamp
        });

        this.addSystemMessage(`${data.username} left the board`);
    }

    handleTaskCreated(data) {
        this.boardData.columns = data.boardData.columns;
        this.renderColumns();
        
        this.addActivityMessage({
            avatarColor: this.getUserColor(data.createdBy),
            username: data.createdBy,
            message: `Created task: "${data.taskData.title}"`,
            timestamp: data.timestamp
        });
    }

    handleTaskMoved(data) {
        this.boardData.columns = data.boardData.columns;
        this.renderColumns();
        
        this.addActivityMessage({
            avatarColor: this.getUserColor(data.movedBy),
            username: data.movedBy,
            message: `Moved a task`,
            timestamp: data.timestamp
        });
    }

    handleChatMessage(data) {
        this.addChatMessage(data);
    }

    handleFileMessage(data) {
        this.addFileMessage(data);
    }

    handleUserTyping(data) {
        this.showTypingIndicator(data.username);
    }

    handleUserStoppedTyping(data) {
        this.hideTypingIndicator(data.username);
    }

    updateUserInterface() {
        this.updateOnlineUsers();
        this.populateColumnSelect();
        this.populateAssignedToSelect();
    }

    updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        const onlineCount = document.getElementById('onlineCount');
        
        usersList.innerHTML = '';
        onlineCount.textContent = this.boardData.users.length;

        this.boardData.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = `
                <div class="user-avatar" style="background-color: ${user.avatarColor}">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
                <span>${user.username}</span>
                <div class="online-dot"></div>
            `;
            usersList.appendChild(userElement);
        });
    }

    renderColumns() {
        const columnsContainer = document.getElementById('columnsContainer');
        columnsContainer.innerHTML = '';

        this.boardData.columns.forEach(column => {
            const columnElement = document.createElement('div');
            columnElement.className = `column column-${column.name.toLowerCase().replace(' ', '-')}`;
            columnElement.dataset.columnId = column.id;
            
            const columnClass = this.getColumnClass(column.name);
            
            columnElement.innerHTML = `
                <div class="column-header ${columnClass}">
                    <h3>
                        <i class="fas ${this.getColumnIcon(column.name)}"></i>
                        ${column.name}
                    </h3>
                    <span class="task-count">${column.tasks.length}</span>
                </div>
                <div class="tasks-list" data-column-id="${column.id}">
                    ${this.renderTasks(column.tasks)}
                </div>
            `;

            columnsContainer.appendChild(columnElement);
        });

        this.initializeDragAndDrop();
    }

    getColumnClass(columnName) {
        const classes = {
            'Todo': 'column-todo',
            'In Progress': 'column-progress', 
            'Done': 'column-done'
        };
        return classes[columnName] || 'column-todo';
    }

    getColumnIcon(columnName) {
        const icons = {
            'Todo': 'fa-clipboard-list',
            'In Progress': 'fa-sync-alt',
            'Done': 'fa-check-circle'
        };
        return icons[columnName] || 'fa-clipboard-list';
    }

    renderTasks(tasks) {
        if (tasks.length === 0) {
            return `
                <div class="empty-column">
                    <i class="fas fa-inbox"></i>
                    <p>No tasks yet</p>
                </div>
            `;
        }

        return tasks.map(task => `
            <div class="task-item" data-task-id="${task.id}" draggable="true">
                <div class="task-header">
                    <div class="task-title">${this.escapeHtml(task.title)}</div>
                    <div class="task-priority priority-${task.priority}"></div>
                </div>
                ${task.description ? `<div class="task-description">${this.escapeHtml(task.description)}</div>` : ''}
                <div class="task-meta">
                    <div class="task-author">
                        <div class="task-author-avatar" style="background-color: ${this.getUserColor(task.created_by_name)}">
                            ${task.created_by_name?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <span>${task.created_by_name || 'Unknown'}</span>
                    </div>
                    ${task.assigned_to_name ? `
                        <div class="task-assignee">
                            <small>Assigned to: ${task.assigned_to_name}</small>
                        </div>
                    ` : ''}
                    ${task.due_date ? `
                        <div class="task-due-date">
                            <small>Due: ${new Date(task.due_date).toLocaleDateString()}</small>
                        </div>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    initializeDragAndDrop() {
        const taskItems = document.querySelectorAll('.task-item');
        const columns = document.querySelectorAll('.tasks-list');

        taskItems.forEach(task => {
            task.addEventListener('dragstart', (e) => {
                this.draggedTask = task;
                this.dragSourceColumn = task.closest('.tasks-list');
                e.dataTransfer.effectAllowed = 'move';
                task.classList.add('dragging');
            });

            task.addEventListener('dragend', () => {
                task.classList.remove('dragging');
                this.draggedTask = null;
                this.dragSourceColumn = null;
            });
        });

        columns.forEach(column => {
            column.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                column.classList.add('drag-over');
            });

            column.addEventListener('dragleave', () => {
                column.classList.remove('drag-over');
            });

            column.addEventListener('drop', (e) => {
                e.preventDefault();
                column.classList.remove('drag-over');
                
                if (this.draggedTask && this.dragSourceColumn !== column) {
                    this.handleTaskDrop(this.draggedTask, column);
                }
            });
        });
    }

    handleTaskDrop(taskElement, targetColumn) {
        const taskId = taskElement.dataset.taskId;
        const sourceColumnId = this.dragSourceColumn.dataset.columnId;
        const targetColumnId = targetColumn.dataset.columnId;

        if (sourceColumnId === targetColumnId) return;

        this.ws.send(JSON.stringify({
            type: 'MOVE_TASK',
            taskId: taskId,
            newColumnId: targetColumnId,
            newPosition: 0
        }));
    }

    showAddTaskModal() {
        document.getElementById('addTaskModal').style.display = 'block';
        document.getElementById('taskTitle').focus();
    }

    hideAddTaskModal() {
        document.getElementById('addTaskModal').style.display = 'none';
        this.resetTaskForm();
    }

    resetTaskForm() {
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskPriority').value = 'medium';
        document.getElementById('taskAssignedTo').value = '';
        document.getElementById('taskDueDate').value = '';
    }

    showFileUploadModal() {
        document.getElementById('fileUploadModal').style.display = 'block';
        this.resetFileUpload();
    }

    hideFileUploadModal() {
        document.getElementById('fileUploadModal').style.display = 'none';
        this.resetFileUpload();
    }

    resetFileUpload() {
        this.selectedFile = null;
        document.getElementById('fileInput').value = '';
        document.getElementById('filePreview').classList.remove('active');
        document.getElementById('uploadFileBtn').disabled = true;
    }

    populateColumnSelect() {
        const columnSelect = document.getElementById('taskColumn');
        columnSelect.innerHTML = '<option value="">Select column...</option>';
        
        this.boardData.columns.forEach(column => {
            const option = document.createElement('option');
            option.value = column.id;
            option.textContent = column.name;
            columnSelect.appendChild(option);
        });
    }

    populateAssignedToSelect() {
        const assignedSelect = document.getElementById('taskAssignedTo');
        assignedSelect.innerHTML = '<option value="">Unassigned</option>';
        
        this.boardData.users.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.username;
            assignedSelect.appendChild(option);
        });
    }

    createTask() {
        const title = document.getElementById('taskTitle').value.trim();
        const description = document.getElementById('taskDescription').value.trim();
        const columnId = document.getElementById('taskColumn').value;
        const priority = document.getElementById('taskPriority').value;
        const assignedTo = document.getElementById('taskAssignedTo').value;
        const dueDate = document.getElementById('taskDueDate').value;

        if (!title) {
            alert('Please enter a task title');
            return;
        }

        if (!columnId) {
            alert('Please select a column');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'CREATE_TASK',
            taskData: {
                title: title,
                description: description,
                columnId: columnId,
                priority: priority,
                assignedTo: assignedTo || null,
                dueDate: dueDate || null
            }
        }));

        this.hideAddTaskModal();
    }

    sendMessage() {
        const input = document.getElementById('chatInput');
        const message = input.value.trim();
        
        if (message && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'SEND_MESSAGE',
                message: message
            }));
            input.value = '';
            this.stopTyping();
        }
    }

    clearChat() {
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.innerHTML = `
            <div class="system-message">
                Chat cleared
            </div>
        `;
    }

    handleFileSelect(file) {
        const maxSize = 10 * 1024 * 1024;
        
        if (file.size > maxSize) {
            alert('File size must be less than 10MB');
            return;
        }

        this.selectedFile = file;
        
        const filePreview = document.getElementById('filePreview');
        const fileIcon = this.getFileIcon(file.type);
        
        filePreview.innerHTML = `
            <div class="file-preview-icon">
                <i class="fas ${fileIcon}"></i>
            </div>
            <div class="file-preview-info">
                <div class="file-preview-name">${file.name}</div>
                <div class="file-preview-size">${this.formatFileSize(file.size)}</div>
            </div>
            <button class="remove-file" onclick="app.removeSelectedFile()">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        filePreview.classList.add('active');
        document.getElementById('uploadFileBtn').disabled = false;
    }

    removeSelectedFile() {
        this.selectedFile = null;
        document.getElementById('filePreview').classList.remove('active');
        document.getElementById('fileInput').value = '';
        document.getElementById('uploadFileBtn').disabled = true;
    }

    uploadFile() {
        if (!this.selectedFile || !this.ws) return;

        const reader = new FileReader();
        
        reader.onload = (e) => {
            const fileData = {
                originalName: this.selectedFile.name,
                size: this.selectedFile.size,
                mimeType: this.selectedFile.type,
                data: e.target.result.split(',')[1]
            };

            this.ws.send(JSON.stringify({
                type: 'UPLOAD_FILE',
                fileData: fileData
            }));

            this.hideFileUploadModal();
        };

        reader.readAsDataURL(this.selectedFile);
    }

    getFileIcon(mimeType) {
        if (mimeType.startsWith('image/')) return 'fa-file-image';
        if (mimeType.startsWith('video/')) return 'fa-file-video';
        if (mimeType.startsWith('audio/')) return 'fa-file-audio';
        if (mimeType.includes('pdf')) return 'fa-file-pdf';
        if (mimeType.includes('word')) return 'fa-file-word';
        if (mimeType.includes('excel')) return 'fa-file-excel';
        if (mimeType.includes('zip')) return 'fa-file-archive';
        return 'fa-file';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    handleTyping() {
        if (!this.typingTimer) {
            this.ws.send(JSON.stringify({
                type: 'TYPING_START'
            }));
        }

        clearTimeout(this.typingTimer);
        this.typingTimer = setTimeout(() => {
            this.stopTyping();
        }, 1000);
    }

    stopTyping() {
        if (this.typingTimer) {
            clearTimeout(this.typingTimer);
            this.typingTimer = null;
            this.ws.send(JSON.stringify({
                type: 'TYPING_STOP'
            }));
        }
    }

    showTypingIndicator(username) {
        let typingIndicator = document.getElementById('typingIndicator');
        if (!typingIndicator) {
            typingIndicator = document.createElement('div');
            typingIndicator.id = 'typingIndicator';
            typingIndicator.className = 'typing-indicator';
            document.getElementById('chatMessages').appendChild(typingIndicator);
        }
        
        const usersTyping = typingIndicator.dataset.users ? 
            new Set(typingIndicator.dataset.users.split(',')) : new Set();
        usersTyping.add(username);
        
        typingIndicator.dataset.users = Array.from(usersTyping).join(',');
        typingIndicator.innerHTML = `
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
            <span class="typing-text">${Array.from(usersTyping).join(', ')} is typing...</span>
        `;
        typingIndicator.style.display = 'flex';
    }

    hideTypingIndicator(username) {
        const typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            const usersTyping = typingIndicator.dataset.users ? 
                new Set(typingIndicator.dataset.users.split(',')) : new Set();
            usersTyping.delete(username);
            
            if (usersTyping.size === 0) {
                typingIndicator.style.display = 'none';
            } else {
                typingIndicator.dataset.users = Array.from(usersTyping).join(',');
                typingIndicator.innerHTML = `
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                    <span class="typing-text">${Array.from(usersTyping).join(', ')} is typing...</span>
                `;
            }
        }
    }

    searchTasks(query) {
        const taskItems = document.querySelectorAll('.task-item');
        const searchTerm = query.toLowerCase();

        taskItems.forEach(task => {
            const title = task.querySelector('.task-title').textContent.toLowerCase();
            const description = task.querySelector('.task-description')?.textContent.toLowerCase() || '';
            
            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                task.style.display = 'block';
            } else {
                task.style.display = 'none';
            }
        });
    }

    leaveBoard() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        
        this.currentUser = null;
        this.boardData = {
            columns: [],
            users: []
        };
        
        document.getElementById('usersList').innerHTML = '';
        document.getElementById('columnsContainer').innerHTML = '';
        document.getElementById('chatMessages').innerHTML = `
            <div class="system-message welcome">
                <i class="fas fa-rocket"></i>
                Welcome to team collaboration! Start chatting with your team.
            </div>
        `;
        document.getElementById('activityFeed').innerHTML = '';
        
        document.getElementById('usernameInput').value = '';
        document.getElementById('emailInput').value = '';
        
        this.showLogin();
    }

    loadChatHistory(chatHistory) {
        const chatMessages = document.getElementById('chatMessages');
        
        const welcomeMessage = chatMessages.querySelector('.welcome');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }

        chatHistory.forEach(message => {
            this.addChatMessage({
                username: message.username,
                message: message.message,
                avatarColor: message.avatar_color,
                timestamp: new Date(message.created_at).toLocaleTimeString()
            }, false);
        });
    }

    addSystemMessage(message) {
        this.addActivityMessage({
            avatarColor: '#ff6b9d',
            username: 'System',
            message: message,
            timestamp: new Date().toLocaleTimeString()
        });
    }

    addActivityMessage(data) {
        const activityFeed = document.getElementById('activityFeed');
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        
        activityItem.innerHTML = `
            <div class="activity-avatar" style="background-color: ${data.avatarColor}">
                ${data.username.charAt(0).toUpperCase()}
            </div>
            <div class="activity-content">
                <p><strong>${data.username}</strong> ${data.message}</p>
                <small>${data.timestamp}</small>
            </div>
        `;

        activityFeed.appendChild(activityItem);
        activityFeed.scrollTop = activityFeed.scrollHeight;
    }

    addChatMessage(data, highlight = true) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${highlight ? 'highlight' : ''}`;
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar" style="background-color: ${data.avatarColor}">
                    ${data.username.charAt(0).toUpperCase()}
                </div>
                <span class="message-username">${data.username}</span>
                <small class="message-time">${data.timestamp}</small>
            </div>
            <div class="message-content">${this.escapeHtml(data.message)}</div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        if (highlight) {
            setTimeout(() => {
                messageElement.classList.remove('highlight');
            }, 2000);
        }
    }

    addFileMessage(data) {
        const chatMessages = document.getElementById('chatMessages');
        const messageElement = document.createElement('div');
        messageElement.className = 'message file-message highlight';
        
        const fileIcon = this.getFileIcon(data.mimeType);
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar" style="background-color: ${this.getUserColor(data.uploadedBy)}">
                    ${data.uploadedBy.charAt(0).toUpperCase()}
                </div>
                <span class="message-username">${data.uploadedBy}</span>
                <small class="message-time">${data.timestamp}</small>
            </div>
            <div class="file-preview">
                <div class="file-icon">
                    <i class="fas ${fileIcon}"></i>
                </div>
                <div class="file-info">
                    <div class="file-name">${this.escapeHtml(data.filename)}</div>
                    <div class="file-size">${this.formatFileSize(data.fileSize)}</div>
                </div>
                <button class="download-btn" onclick="app.downloadFile('${data.fileUrl}', '${data.filename}')">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        setTimeout(() => {
            messageElement.classList.remove('highlight');
        }, 2000);
    }

    downloadFile(fileUrl, filename) {
        const link = document.createElement('a');
        link.href = `http://localhost:3000${fileUrl}`;
        link.download = filename;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getUserColor(username) {
        const user = this.boardData.users.find(u => u.username === username);
        return user?.avatarColor || '#cdb4db';
    }

    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new CollabBoardApp();
});