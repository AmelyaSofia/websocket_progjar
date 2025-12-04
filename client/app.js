class CollabBoardApp {
    constructor() {
        console.log('App initializing...');
        
        this.ws = null;
        this.currentUser = null;
        this.boardData = {
            columns: [],
            users: []
        };
        
        this.draggedTask = null;
        this.dragSourceColumn = null;
        this.typingTimer = null;
        this.selectedImage = null;
        this.sessionToken = null;
        this.isUploading = false;
        this.jwtToken = localStorage.getItem('jwt_token');
        this.typingUsers = new Set();

        this.initializeApp();
    }

    initializeApp() {
        console.log('Initializing app with token:', this.jwtToken ? 'Yes' : 'No');
        
        this.bindEvents();
        
        if (this.jwtToken) {
            this.verifyTokenAndAutoLogin();
        } else {
            this.showLogin();
        }
        
        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    cleanup() {
        if (this.currentUser && this.sessionToken) {
            localStorage.setItem('collabboard_session', this.sessionToken);
            localStorage.setItem('collabboard_user', JSON.stringify(this.currentUser));
        }
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    bindEvents() {
        console.log('Binding events...');
        
        const loginBtn = document.getElementById('loginBtn');
        const registerBtn = document.getElementById('registerBtn');
        const submitRegisterBtn = document.getElementById('submitRegisterBtn');
        const backToLoginBtn = document.getElementById('backToLoginBtn');
        
        if (loginBtn) loginBtn.addEventListener('click', () => this.login());
        if (registerBtn) registerBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegisterForm();
        });
        if (submitRegisterBtn) submitRegisterBtn.addEventListener('click', () => this.register());
        if (backToLoginBtn) backToLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.showLoginForm();
        });

        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.login();
            });
        }

        const registerForm = document.getElementById('registerForm');
        if (registerForm) {
            registerForm.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.register();
            });
        }

        const addTaskBtn = document.getElementById('addTaskBtn');
        const logoutBtn = document.getElementById('logoutBtn');
        if (addTaskBtn) addTaskBtn.addEventListener('click', () => this.showAddTaskModal());
        if (logoutBtn) logoutBtn.addEventListener('click', () => this.logout());

        const createTaskBtn = document.getElementById('createTaskBtn');
        const cancelTaskBtn = document.getElementById('cancelTaskBtn');
        if (createTaskBtn) createTaskBtn.addEventListener('click', () => this.createTask());
        if (cancelTaskBtn) cancelTaskBtn.addEventListener('click', () => this.hideAddTaskModal());
        
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                if (modal) modal.style.display = 'none';
            });
        });
        
        const sendBtn = document.getElementById('sendBtn');
        const chatInput = document.getElementById('chatInput');
        const clearChatBtn = document.getElementById('clearChatBtn');
        const photoUploadBtn = document.getElementById('photoUploadBtn');
        
        if (sendBtn) sendBtn.addEventListener('click', () => this.sendMessage());
        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.sendMessage();
            });
        }
        if (clearChatBtn) clearChatBtn.addEventListener('click', () => this.clearChat());
        if (photoUploadBtn) photoUploadBtn.addEventListener('click', () => this.triggerPhotoUpload());

        if (chatInput) {
            chatInput.addEventListener('input', () => this.handleTyping());
            chatInput.addEventListener('blur', () => this.stopTyping());
        }

        const taskSearch = document.getElementById('taskSearch');
        if (taskSearch) taskSearch.addEventListener('input', (e) => this.searchTasks(e.target.value));

        const profileBtn = document.getElementById('profileBtn');
        const closeProfileBtn = document.getElementById('closeProfileBtn');
        const updateProfileBtn = document.getElementById('updateProfileBtn');
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        const submitPasswordChangeBtn = document.getElementById('submitPasswordChangeBtn');
        const cancelPasswordChangeBtn = document.getElementById('cancelPasswordChangeBtn');
        
        if (profileBtn) profileBtn.addEventListener('click', () => this.showProfile());
        if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => this.hideProfile());
        if (updateProfileBtn) updateProfileBtn.addEventListener('click', () => this.updateProfile());
        if (changePasswordBtn) changePasswordBtn.addEventListener('click', () => this.showChangePassword());
        if (submitPasswordChangeBtn) submitPasswordChangeBtn.addEventListener('click', () => this.changePassword());
        if (cancelPasswordChangeBtn) cancelPasswordChangeBtn.addEventListener('click', () => this.hideChangePassword());

        window.addEventListener('click', (e) => {
            if (e.target === document.getElementById('addTaskModal')) {
                this.hideAddTaskModal();
            }
            if (e.target === document.getElementById('profileModal')) {
                this.hideProfile();
            }
            if (e.target === document.getElementById('changePasswordModal')) {
                this.hideChangePassword();
            }
        });

        this.initializePhotoUpload();
        
        console.log('Events bound successfully');
    }

    initializePhotoUpload() {
        const photoInput = document.getElementById('photoInput');
        if (photoInput) {
            photoInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handlePhotoSelect(e.target.files[0]);
                }
            });
        }
    }

    async verifyTokenAndAutoLogin() {
        console.log('Verifying token...');
        try {
            const response = await fetch('http://localhost:3000/api/verify-token', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            console.log('Token verification response:', data);
            
            if (data.success) {
                this.currentUser = data.user;
                this.jwtToken = data.token;
                localStorage.setItem('jwt_token', data.token);
                this.showApp();
                this.connectWebSocket(true);
                this.showAlert('Welcome back!', 'success');
            } else {
                localStorage.removeItem('jwt_token');
                this.showLogin();
                this.showAlert('Session expired. Please login again.', 'warning');
            }
        } catch (error) {
            console.error('Token verification failed:', error);
            localStorage.removeItem('jwt_token');
            this.showLogin();
            this.showAlert('Network error. Please login again.', 'error');
        }
    }

    showLogin() {
        console.log('Showing login page');
        document.getElementById('loginSection').classList.add('active');
        document.getElementById('appSection').classList.remove('active');
        
        if (document.getElementById('loginForm')) {
            document.getElementById('loginForm').reset();
        }
        if (document.getElementById('registerForm')) {
            document.getElementById('registerForm').reset();
        }
    }

    showLoginForm() {
        console.log('Showing login form');
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('registerForm').style.display = 'none';
    }

    showRegisterForm() {
        console.log('Showing register form');
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
    }

    showApp() {
        console.log('Showing app section');
        document.getElementById('loginSection').classList.remove('active');
        document.getElementById('appSection').classList.add('active');
        
        if (this.currentUser) {
            const userAvatar = document.getElementById('userAvatar');
            const currentUserSpan = document.getElementById('currentUser');
            
            if (userAvatar) {
                userAvatar.style.backgroundColor = this.currentUser.avatarColor;
                userAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
            }
            if (currentUserSpan) {
                currentUserSpan.textContent = this.currentUser.username;
            }
        }
    }

    async login() {
        console.log('Login attempt');
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value.trim();
        
        if (!username || !password) {
            this.showAlert('Please enter username and password', 'error');
            return;
        }

        try {
            this.showLoading();
            
            const response = await fetch('http://localhost:3000/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();
            console.log('Login response:', data);
            
            this.hideLoading();
            
            if (data.success) {
                this.currentUser = data.user;
                this.jwtToken = data.token;
                localStorage.setItem('jwt_token', data.token);
                
                this.showApp();
                this.connectWebSocket(false);
                
                this.showAlert('Login successful!', 'success');
            } else {
                this.showAlert(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.hideLoading();
            this.showAlert('Network error. Please try again.', 'error');
        }
    }

    async register() {
        console.log('Register attempt');
        const username = document.getElementById('registerUsername').value.trim();
        const email = document.getElementById('registerEmail').value.trim();
        const password = document.getElementById('registerPassword').value.trim();
        const confirmPassword = document.getElementById('registerConfirmPassword').value.trim();
        
        if (!username || !email || !password || !confirmPassword) {
            this.showAlert('All fields are required', 'error');
            return;
        }

        if (password.length < 6) {
            this.showAlert('Password must be at least 6 characters', 'error');
            return;
        }

        if (password !== confirmPassword) {
            this.showAlert('Passwords do not match', 'error');
            return;
        }

        if (!this.validateEmail(email)) {
            this.showAlert('Please enter a valid email address', 'error');
            return;
        }

        try {
            this.showLoading();
            
            const response = await fetch('http://localhost:3000/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: password
                })
            });

            const data = await response.json();
            console.log('Register response:', data);
            
            this.hideLoading();
            
            if (data.success) {
                this.showAlert('Registration successful! Please login.', 'success');
                setTimeout(() => {
                    this.showLoginForm();
                    document.getElementById('registerForm').reset();
                }, 1500);
            } else {
                this.showAlert(data.error || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Register error:', error);
            this.hideLoading();
            this.showAlert('Network error. Please try again.', 'error');
        }
    }

    logout() {
        console.log('Logging out...');
        
        if (this.jwtToken) {
            fetch('http://localhost:3000/api/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                }
            }).catch(err => console.error('Logout error:', err));
        }

        localStorage.removeItem('jwt_token');
        localStorage.removeItem('collabboard_session');
        localStorage.removeItem('collabboard_user');
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'LOGOUT' }));
            this.ws.close();
        }
        
        this.currentUser = null;
        this.jwtToken = null;
        this.sessionToken = null;
        this.boardData = { columns: [], users: [] };
        
        this.resetUI();
        
        this.showLogin();
        
        this.showAlert('Logged out successfully', 'success');
    }

    validateEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    showAlert(message, type = 'info') {
        console.log(`Alert [${type}]: ${message}`);
        
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            background: ${type === 'success' ? '#06d6a0' : 
                        type === 'error' ? '#ef476f' : 
                        type === 'warning' ? '#ffd166' : '#118ab2'};
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 9999;
            max-width: 350px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            animation: slideInRight 0.3s ease;
        `;
        
        alertDiv.innerHTML = `
            <span>${message}</span>
            <button class="alert-close" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer; margin-left: 10px;">&times;</button>
        `;
        
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        }, 5000);
        
        alertDiv.querySelector('.alert-close').addEventListener('click', () => {
            if (alertDiv.parentNode) {
                alertDiv.parentNode.removeChild(alertDiv);
            }
        });
    }

    showLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.add('active');
        }
    }

    hideLoading() {
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('active');
        }
    }

    showAddTaskModal() {
        const modal = document.getElementById('addTaskModal');
        if (modal) {
            modal.style.display = 'block';
            const taskTitle = document.getElementById('taskTitle');
            if (taskTitle) taskTitle.focus();
        }
        
        this.populateColumnSelect();
        this.populateAssignedToSelect();
    }

    hideAddTaskModal() {
        const modal = document.getElementById('addTaskModal');
        if (modal) {
            modal.style.display = 'none';
        }
        const taskForm = document.getElementById('taskForm');
        if (taskForm) taskForm.reset();
    }

    populateColumnSelect() {
        const columnSelect = document.getElementById('taskColumn');
        if (!columnSelect) return;
        
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
        if (!assignedSelect) return;
        
        assignedSelect.innerHTML = '<option value="">Unassigned</option>';
        
        this.boardData.users.forEach(user => {
            if (user.id !== this.currentUser?.id) {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.username;
                assignedSelect.appendChild(option);
            }
        });
    }

    resetTaskForm() {
        const taskTitle = document.getElementById('taskTitle');
        const taskDescription = document.getElementById('taskDescription');
        const taskColumn = document.getElementById('taskColumn');
        const taskPriority = document.getElementById('taskPriority');
        const taskAssignedTo = document.getElementById('taskAssignedTo');
        const taskDueDate = document.getElementById('taskDueDate');
        
        if (taskTitle) taskTitle.value = '';
        if (taskDescription) taskDescription.value = '';
        if (taskColumn) taskColumn.value = '';
        if (taskPriority) taskPriority.value = 'medium';
        if (taskAssignedTo) taskAssignedTo.value = '';
        if (taskDueDate) taskDueDate.value = '';
    }

    createTask() {
        const taskTitle = document.getElementById('taskTitle');
        const taskDescription = document.getElementById('taskDescription');
        const taskColumn = document.getElementById('taskColumn');
        const taskPriority = document.getElementById('taskPriority');
        const taskAssignedTo = document.getElementById('taskAssignedTo');
        const taskDueDate = document.getElementById('taskDueDate');
        
        if (!taskTitle || !taskTitle.value.trim()) {
            this.showAlert('Please enter a task title', 'error');
            return;
        }
        
        if (!taskColumn || !taskColumn.value) {
            this.showAlert('Please select a column', 'error');
            return;
        }

        this.ws.send(JSON.stringify({
            type: 'CREATE_TASK',
            taskData: {
                title: taskTitle.value.trim(),
                description: taskDescription ? taskDescription.value.trim() : '',
                columnId: taskColumn.value,
                priority: taskPriority ? taskPriority.value : 'medium',
                assignedTo: taskAssignedTo ? (taskAssignedTo.value || null) : null,
                dueDate: taskDueDate ? (taskDueDate.value || null) : null
            }
        }));

        this.hideAddTaskModal();
        this.showAlert('Task created successfully', 'success');
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

    async showProfile() {
        try {
            const response = await fetch('http://localhost:3000/api/profile', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                }
            });

            const data = await response.json();
            
            if (data.success) {
                const user = data.user;
                document.getElementById('profileUsername').value = user.username;
                document.getElementById('profileEmail').value = user.email;
                document.getElementById('profileAvatarColor').value = user.avatar_color || '#ff6b9d';
                document.getElementById('profileJoinDate').textContent = 
                    user.created_at ? new Date(user.created_at).toLocaleDateString() : '-';
                document.getElementById('profileLastLogin').textContent = 
                    user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never';
                
                document.getElementById('profileModal').style.display = 'block';
            } else {
                this.showAlert('Failed to load profile', 'error');
            }
        } catch (error) {
            console.error('Profile load error:', error);
            this.showAlert('Network error', 'error');
        }
    }

    hideProfile() {
        document.getElementById('profileModal').style.display = 'none';
        const profileForm = document.getElementById('profileForm');
        if (profileForm) profileForm.reset();
    }

    async updateProfile() {
        const username = document.getElementById('profileUsername').value.trim();
        const email = document.getElementById('profileEmail').value.trim();
        const avatarColor = document.getElementById('profileAvatarColor').value.trim();
        
        if (!username || !email) {
            this.showAlert('Username and email are required', 'error');
            return;
        }

        if (!this.validateEmail(email)) {
            this.showAlert('Please enter a valid email', 'error');
            return;
        }

        try {
            this.showLoading();
            
            const response = await fetch('http://localhost:3000/api/profile', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    avatarColor: avatarColor
                })
            });

            const data = await response.json();
            
            this.hideLoading();
            
            if (data.success) {
                this.currentUser = data.user;
                this.jwtToken = data.token;
                localStorage.setItem('jwt_token', data.token);
                
                const userAvatar = document.getElementById('userAvatar');
                const currentUserSpan = document.getElementById('currentUser');
                
                if (userAvatar) {
                    userAvatar.style.backgroundColor = this.currentUser.avatarColor;
                    userAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
                }
                if (currentUserSpan) {
                    currentUserSpan.textContent = this.currentUser.username;
                }
                
                this.showAlert('Profile updated successfully', 'success');
                this.hideProfile();
            } else {
                this.showAlert(data.error || 'Update failed', 'error');
            }
        } catch (error) {
            console.error('Update profile error:', error);
            this.hideLoading();
            this.showAlert('Network error', 'error');
        }
    }

    showChangePassword() {
        document.getElementById('changePasswordModal').style.display = 'block';
        const currentPassword = document.getElementById('currentPassword');
        if (currentPassword) currentPassword.focus();
    }

    hideChangePassword() {
        document.getElementById('changePasswordModal').style.display = 'none';
        const form = document.getElementById('changePasswordForm');
        if (form) form.reset();
    }

    async changePassword() {
        const currentPassword = document.getElementById('currentPassword').value.trim();
        const newPassword = document.getElementById('newPassword').value.trim();
        const confirmPassword = document.getElementById('confirmPassword').value.trim();
        
        if (!currentPassword || !newPassword || !confirmPassword) {
            this.showAlert('All fields are required', 'error');
            return;
        }

        if (newPassword.length < 6) {
            this.showAlert('New password must be at least 6 characters', 'error');
            return;
        }

        if (newPassword !== confirmPassword) {
            this.showAlert('New passwords do not match', 'error');
            return;
        }

        try {
            this.showLoading();
            
            const response = await fetch('http://localhost:3000/api/change-password', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.jwtToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentPassword: currentPassword,
                    newPassword: newPassword
                })
            });

            const data = await response.json();
            
            this.hideLoading();
            
            if (data.success) {
                this.showAlert('Password changed successfully', 'success');
                this.hideChangePassword();
            } else {
                this.showAlert(data.error || 'Password change failed', 'error');
            }
        } catch (error) {
            console.error('Change password error:', error);
            this.hideLoading();
            this.showAlert('Network error', 'error');
        }
    }

    connectWebSocket(isReconnect = false) {
        console.log('Connecting WebSocket, reconnect:', isReconnect);
        
        this.ws = new WebSocket('ws://localhost:8080');

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            if (isReconnect && this.sessionToken) {
                this.ws.send(JSON.stringify({
                    type: 'RECONNECT',
                    sessionToken: this.sessionToken,
                    token: this.jwtToken
                }));
            } else {
                this.ws.send(JSON.stringify({
                    type: 'JOIN_BOARD',
                    token: this.jwtToken
                }));
            }
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                console.log('WebSocket message:', data.type);
                
                if (data.sessionToken) {
                    this.sessionToken = data.sessionToken;
                    localStorage.setItem('collabboard_session', this.sessionToken);
                }
                
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing message:', error);
            }
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            if (!isReconnect) {
                this.addSystemMessage('Disconnected from board. Reconnecting...');
            }
            
            setTimeout(() => {
                if (this.currentUser && this.ws.readyState === WebSocket.CLOSED) {
                    console.log('Attempting reconnect...');
                    this.connectWebSocket(true);
                }
            }, 2000);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }

    handleMessage(data) {
        console.log('Handling message type:', data.type);
        
        switch (data.type) {
            case 'CONNECTED':
                console.log('Connected to server');
                break;

            case 'BOARD_JOINED':
                this.handleBoardJoined(data);
                break;

            case 'AUTH_REQUIRED':
            case 'AUTH_INVALID':
            case 'SESSION_EXPIRED':
                this.handleAuthError(data);
                break;

            case 'USER_JOINED':
                this.handleUserJoined(data);
                break;

            case 'USER_LEFT':
                this.handleUserLeft(data);
                break;

            case 'USER_RECONNECTED':
                this.handleUserReconnected(data);
                break;

            case 'USERS_LIST_UPDATED':
                this.handleUsersListUpdated(data);
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

            case 'IMAGE_MESSAGE':
                this.handleImageMessage(data);
                break;

            case 'IMAGE_UPLOAD_SUCCESS':
                this.handleImageUploadSuccess(data);
                break;

            case 'IMAGE_UPLOAD_ERROR':
                this.handleImageUploadError(data);
                break;

            case 'IMAGE_PREVIEW':
                this.handleImagePreview(data);
                break;

            case 'USER_TYPING':
                this.handleUserTyping(data);
                break;

            case 'USER_STOPPED_TYPING':
                this.handleUserStoppedTyping(data);
                break;

            case 'SESSION_INVALID':
                this.handleSessionInvalid(data);
                break;

            case 'LOGOUT':
                break;

            default:
                console.log('Unknown message type:', data.type);
        }
    }

    handleBoardJoined(data) {
        console.log('Board joined:', data);
        this.boardData.columns = data.columns || [];
        this.boardData.users = data.users || [];
        
        if (data.currentUser) {
            this.currentUser = data.currentUser;
            localStorage.setItem('collabboard_user', JSON.stringify(this.currentUser));
            
            const userAvatar = document.getElementById('userAvatar');
            const currentUserSpan = document.getElementById('currentUser');
            
            if (userAvatar) {
                userAvatar.style.backgroundColor = this.currentUser.avatarColor;
                userAvatar.textContent = this.currentUser.username.charAt(0).toUpperCase();
            }
            if (currentUserSpan) {
                currentUserSpan.textContent = this.currentUser.username;
            }
        }

        this.renderColumns();
        this.updateOnlineUsers();

        if (data.chatHistory) {
            this.loadChatHistory(data.chatHistory);
        }

        this.addSystemMessage(`Welcome to the board, ${this.currentUser?.username || 'User'}!`);
    }

    handleAuthError(data) {
        console.error('Auth error:', data);
        this.showAlert(data.message, 'error');
        
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('collabboard_session');
        localStorage.removeItem('collabboard_user');
        
        this.currentUser = null;
        this.jwtToken = null;
        this.sessionToken = null;
        
        this.resetUI();
        this.showLogin();
    }

    handleUserJoined(data) {
        console.log('User joined:', data.user?.username);
        this.boardData.users = data.users || [];
        this.updateOnlineUsers();
        
        if (data.user) {
            this.addActivityMessage({
                avatarColor: data.user.avatarColor || '#ff6b9d',
                username: 'System',
                message: `${data.user.username} joined the board`,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });

            this.addSystemMessage(`${data.user.username} joined the board`);
        }
    }

    handleUserLeft(data) {
        console.log('User left:', data.username);
        this.boardData.users = data.users || [];
        this.updateOnlineUsers();
        
        this.addActivityMessage({
            avatarColor: '#ff6b9d',
            username: 'System',
            message: `${data.username} left the board`,
            timestamp: data.timestamp || new Date().toLocaleTimeString()
        });

        this.addSystemMessage(`${data.username} left the board`);
    }

    handleUserReconnected(data) {
        console.log('User reconnected:', data.user?.username);
        this.boardData.users = data.users || [];
        this.updateOnlineUsers();
        
        if (data.user) {
            this.addActivityMessage({
                avatarColor: '#06d6a0',
                username: 'System',
                message: `${data.user.username} reconnected`,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });
        }
    }

    handleUsersListUpdated(data) {
        console.log('Users list updated, count:', data.users?.length);
        this.boardData.users = data.users || [];
        this.updateOnlineUsers();
    }

    handleSessionInvalid(data) {
        console.error('Session invalid:', data);
        this.handleAuthError(data);
    }

    handleTaskCreated(data) {
        console.log('Task created:', data.taskData?.title);
        this.boardData.columns = data.boardData?.columns || [];
        this.renderColumns();
        
        if (data.createdBy) {
            this.addActivityMessage({
                avatarColor: this.getUserColor(data.createdBy),
                username: data.createdBy,
                message: `Created task: "${data.taskData?.title || 'New task'}"`,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });
        }
    }

    handleTaskMoved(data) {
        console.log('Task moved by:', data.movedBy);
        this.boardData.columns = data.boardData?.columns || [];
        this.renderColumns();
        
        if (data.movedBy) {
            this.addActivityMessage({
                avatarColor: this.getUserColor(data.movedBy),
                username: data.movedBy,
                message: `Moved a task`,
                timestamp: data.timestamp || new Date().toLocaleTimeString()
            });
        }
    }

    handleChatMessage(data) {
        console.log('Chat message from:', data.username);
        this.addChatMessage(data);
    }

    handleImageMessage(data) {
        console.log('Image message from:', data.username);
        this.addImageMessage(data);
    }

    handleImageUploadSuccess(data) {
        console.log('Image upload success');
        this.addSystemMessage('Photo uploaded successfully!');
    }

    handleImageUploadError(data) {
        console.error('Image upload error:', data.error);
        this.showAlert('Failed to upload photo: ' + (data.error || 'Unknown error'), 'error');
        this.isUploading = false;
    }

    handleImagePreview(data) {
        console.log('Image preview received');
        this.showImagePreview(data.previewData, data.filename);
    }

    handleUserTyping(data) {
        console.log('User typing:', data.username);
        if (data.username && data.username !== this.currentUser?.username) {
            this.typingUsers.add(data.username);
            this.updateTypingIndicator();
        }
    }

    handleUserStoppedTyping(data) {
        console.log('User stopped typing:', data.username);
        if (data.username) {
            this.typingUsers.delete(data.username);
            this.updateTypingIndicator();
        }
    }

    updateOnlineUsers() {
        const usersList = document.getElementById('usersList');
        const onlineCount = document.getElementById('onlineCount');
        
        if (!usersList) return;
        
        usersList.innerHTML = '';
        
        if (onlineCount) {
            onlineCount.textContent = this.boardData.users.length.toString();
        }

        this.boardData.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            userElement.innerHTML = `
                <div class="user-avatar" style="background-color: ${user.avatarColor || '#ff6b9d'}">
                    ${user.username?.charAt(0).toUpperCase() || '?'}
                </div>
                <span>${user.username || 'Unknown'}</span>
                <div class="online-dot"></div>
            `;
            usersList.appendChild(userElement);
        });
    }

    renderColumns() {
        const columnsContainer = document.getElementById('columnsContainer');
        if (!columnsContainer) return;
        
        columnsContainer.innerHTML = '';

        this.boardData.columns.forEach(column => {
            const columnElement = document.createElement('div');
            columnElement.className = `column column-${(column.name || '').toLowerCase().replace(' ', '-')}`;
            columnElement.dataset.columnId = column.id;
            
            const columnClass = this.getColumnClass(column.name);
            
            columnElement.innerHTML = `
                <div class="column-header ${columnClass}">
                    <h3>
                        <i class="fas ${this.getColumnIcon(column.name)}"></i>
                        ${column.name || 'Unnamed Column'}
                    </h3>
                    <span class="task-count">${column.tasks?.length || 0}</span>
                </div>
                <div class="tasks-list" data-column-id="${column.id}">
                    ${this.renderTasks(column.tasks || [])}
                </div>
            `;

            columnsContainer.appendChild(columnElement);
        });

        this.initializeDragAndDrop();
    }

    getColumnClass(columnName) {
        if (!columnName) return 'column-todo';
        
        const classes = {
            'To Do': 'column-todo',
            'In Progress': 'column-progress', 
            'Done': 'column-done',
            '📋 Todo': 'column-todo',
            '🔄 In Progress': 'column-progress', 
            '✅ Done': 'column-done'
        };
        return classes[columnName] || 'column-todo';
    }

    getColumnIcon(columnName) {
        if (!columnName) return 'fa-clipboard-list';
        
        const icons = {
            'To Do': 'fa-clipboard-list',
            'In Progress': 'fa-sync-alt',
            'Done': 'fa-check-circle',
            '📋 Todo': 'fa-clipboard-list',
            '🔄 In Progress': 'fa-sync-alt',
            '✅ Done': 'fa-check-circle'
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
                    <div class="task-title">${this.escapeHtml(task.title || 'Untitled')}</div>
                    <div class="task-priority priority-${task.priority || 'medium'}"></div>
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

    sendMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput) return;
        
        const message = chatInput.value.trim();
        
        if (message && this.ws) {
            this.ws.send(JSON.stringify({
                type: 'SEND_MESSAGE',
                message: message
            }));
            chatInput.value = '';
            this.stopTyping();
        }
    }

    clearChat() {
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="system-message welcome">
                    <i class="fas fa-rocket"></i>
                    Welcome to team collaboration! Start chatting with your team.
                </div>
            `;
        }
    }

    triggerPhotoUpload() {
        const photoInput = document.getElementById('photoInput');
        if (photoInput) {
            photoInput.click();
        }
    }

    async handlePhotoSelect(file) {
    const maxSize = 5 * 1024 * 1024;
    
    if (file.size > maxSize) {
        this.showAlert('Ukuran gambar maksimal 5MB', 'error');
        return;
    }

    if (!file.type.startsWith('image/')) {
        this.showAlert('Harap pilih file gambar', 'error');
        return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
        this.showAlert('Hanya format JPEG, PNG, GIF, dan WebP yang diperbolehkan', 'error');
        return;
    }

    this.selectedImage = file;
    this.isUploading = true;

    let previewId = null;

    try {
        const previewData = await this.uploadPreview(file);
        
        if (!previewData || !previewData.success) {
            throw new Error(previewData?.error || 'Gagal membuat preview');
        }
        
        previewId = this.showImagePreview(previewData.previewUrl, file.name);
        
        await this.uploadPhotoToWebSocket(file);
        
        if (previewId) {
            this.updatePreviewStatus(previewId, 'success');
        }
        
        this.isUploading = false;
        this.selectedImage = null;
        
        const photoInput = document.getElementById('photoInput');
        if (photoInput) {
            photoInput.value = '';
        }
        
        setTimeout(() => {
            this.showAlert('Foto berhasil dikirim!', 'success');
        }, 1000);
        
    } catch (error) {
        console.error('Error uploading photo:', error);
        
        this.isUploading = false;
        this.selectedImage = null;
        
        if (previewId) {
            this.updatePreviewStatus(previewId, 'error');
        } else {
            this.removeImagePreview();
        }
        
        let errorMessage = 'Gagal mengupload foto';
        if (error.message.includes('size') || error.message.includes('besar')) {
            errorMessage = 'Gambar terlalu besar (maksimal 5MB)';
        } else if (error.message.includes('type') || error.message.includes('format')) {
            errorMessage = 'Format gambar tidak didukung';
        } else if (error.message.includes('network') || error.message.includes('jaringan')) {
            errorMessage = 'Kesalahan jaringan. Coba lagi';
        } else if (error.message.includes('timeout')) {
            errorMessage = 'Upload timeout. Coba lagi';
        }
        
        this.showAlert(errorMessage, 'error');
    }
}

    removeImagePreview() {
        const previews = document.querySelectorAll('.image-preview, .uploading-indicator');
        previews.forEach(preview => preview.remove());
    }

    async uploadPreview(file) {
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const response = await fetch('http://localhost:3000/api/upload-preview', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            imageData: e.target.result,
                            fileName: file.name,
                            fileSize: file.size
                        })
                    });

                    const data = await response.json();
                    
                    if (data.success) {
                        resolve(data);
                    } else {
                        reject(new Error(data.error || 'Preview upload failed'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    async uploadPhotoToWebSocket(file) {
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = async (e) => {
                try {
                    const img = new Image();
                    img.onload = () => {
                        const base64Data = e.target.result.split(',')[1];
                        
                        if (!base64Data) {
                            reject(new Error('Invalid image data'));
                            return;
                        }

                        const imageData = {
                            originalName: file.name,
                            size: file.size,
                            data: base64Data,
                            width: img.width,
                            height: img.height
                        };

                        console.log('Sending image to WebSocket:', {
                            filename: file.name,
                            size: file.size
                        });

                        this.ws.send(JSON.stringify({
                            type: 'UPLOAD_IMAGE',
                            imageData: imageData
                        }));

                        this.isUploading = false;
                        resolve();
                    };
                    img.onerror = (error) => {
                        console.error('Image load error:', error);
                        reject(new Error('Failed to load image'));
                    };
                    img.src = e.target.result;
                } catch (error) {
                    console.error('Error in uploadPhotoToWebSocket:', error);
                    reject(error);
                }
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read file'));
            };
            reader.readAsDataURL(file);
        });
    }

    showImagePreview(imageUrl, filename) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;
    
    const previewId = `preview_${Date.now()}`;
    
    const previewElement = document.createElement('div');
    previewElement.className = 'message image-preview';
    previewElement.id = previewId;
    previewElement.dataset.filename = filename;
    
    previewElement.innerHTML = `
        <div class="message-header">
            <div class="message-avatar" style="background-color: ${this.currentUser?.avatarColor || '#ff6b9d'}">
                ${this.currentUser?.username?.charAt(0).toUpperCase() || 'Y'}
            </div>
            <span class="message-username">${this.currentUser?.username || 'You'}</span>
            <small class="message-time" id="time_${previewId}">Mengirim...</small>
        </div>
        <div class="image-container">
            <div class="image-wrapper" style="padding-bottom: 75%">
                <img src="${imageUrl}" alt="Preview" class="chat-image">
                <div class="image-overlay" id="overlay_${previewId}">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span class="image-size">Mengirim...</span>
                </div>
            </div>
            <div class="image-filename">${this.escapeHtml(filename)}</div>
        </div>
    `;

    chatMessages.appendChild(previewElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return previewId;
}

updatePreviewStatus(previewId, status = 'success') {
    const previewElement = document.getElementById(previewId);
    if (!previewElement) {
        console.warn(`Preview dengan ID ${previewId} tidak ditemukan`);
        return;
    }
    
    const timeElement = document.getElementById(`time_${previewId}`);
    const overlayElement = document.getElementById(`overlay_${previewId}`);
    
    if (!timeElement || !overlayElement) {
        console.warn(`Element tidak ditemukan untuk preview ${previewId}`);
        return;
    }
    
    if (status === 'success') {
        timeElement.textContent = new Date().toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        
        overlayElement.innerHTML = `
            <i class="fas fa-check-circle" style="color: #06d6a0"></i>
            <span class="image-size" style="color: #06d6a0">Terkirim</span>
        `;
        
        setTimeout(() => {
            overlayElement.style.opacity = '0';
            setTimeout(() => {
                overlayElement.style.display = 'none';
            }, 300);
        }, 2000);
        
    } else if (status === 'error') {
        timeElement.textContent = 'Gagal';
        timeElement.style.color = '#ef476f';
        
        overlayElement.innerHTML = `
            <i class="fas fa-exclamation-circle" style="color: #ef476f"></i>
            <span class="image-size" style="color: #ef476f">Gagal</span>
        `;
    }
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

    updateTypingIndicator() {
        const typingIndicator = document.getElementById('typingIndicator');
        if (!typingIndicator) return;
        
        if (this.typingUsers.size > 0) {
            const users = Array.from(this.typingUsers);
            const typingText = users.length === 1 ? 
                `${users[0]} is typing...` : 
                `${users.join(', ')} are typing...`;
            
            typingIndicator.innerHTML = `
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                <span class="typing-text">${typingText}</span>
            `;
            typingIndicator.style.display = 'flex';
        } else {
            typingIndicator.style.display = 'none';
        }
    }

    loadChatHistory(chatHistory) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const welcomeMessage = chatMessages.querySelector('.welcome');
        chatMessages.innerHTML = '';
        if (welcomeMessage) {
            chatMessages.appendChild(welcomeMessage);
        }

        if (!Array.isArray(chatHistory)) return;
        
        chatHistory.forEach(message => {
            if (message.message_type === 'text') {
                this.addChatMessage({
                    username: message.username,
                    message: message.message,
                    avatarColor: message.avatar_color,
                    timestamp: message.created_at ? new Date(message.created_at).toLocaleTimeString() : 'Just now'
                }, false);
            } else if (message.message_type === 'image') {
                this.addImageMessage({
                    username: message.username,
                    avatarColor: message.avatar_color,
                    filename: message.file_name,
                    imageUrl: message.file_url,
                    thumbnailUrl: message.thumbnail_url,
                    fileSize: message.file_size,
                    width: message.width,
                    height: message.height,
                    timestamp: message.created_at ? new Date(message.created_at).toLocaleTimeString() : 'Just now'
                }, false);
            }
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
        if (!activityFeed) return;
        
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
        if (!chatMessages) return;
        
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

    addImageMessage(data, highlight = true) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;
        
        const messageElement = document.createElement('div');
        messageElement.className = `message image-message ${highlight ? 'highlight' : ''}`;
        
        const aspectRatio = data.width && data.height ? (data.height / data.width * 100) : 75;
        
        messageElement.innerHTML = `
            <div class="message-header">
                <div class="message-avatar" style="background-color: ${data.avatarColor}">
                    ${data.username.charAt(0).toUpperCase()}
                </div>
                <span class="message-username">${data.username}</span>
                <small class="message-time">${data.timestamp}</small>
            </div>
            <div class="image-container">
                <a href="http://localhost:3000${data.imageUrl}" target="_blank" class="image-link">
                    <div class="image-wrapper" style="padding-bottom: ${Math.min(aspectRatio, 100)}%">
                        <img src="http://localhost:3000${data.thumbnailUrl || data.imageUrl}" 
                             alt="${this.escapeHtml(data.filename)}" 
                             class="chat-image"
                             loading="lazy">
                        <div class="image-overlay">
                            <i class="fas fa-expand"></i>
                            <span class="image-size">${this.formatFileSize(data.fileSize)}</span>
                        </div>
                    </div>
                </a>
                <div class="image-filename">${this.escapeHtml(data.filename)}</div>
                <button class="download-btn" onclick="app.downloadFile('${data.imageUrl}', '${data.filename}')">
                    <i class="fas fa-download"></i> Download
                </button>
            </div>
        `;

        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        const previewElements = chatMessages.querySelectorAll('.image-preview');
        previewElements.forEach(el => el.remove());

        if (highlight) {
            setTimeout(() => {
                messageElement.classList.remove('highlight');
            }, 2000);
        }
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

    formatFileSize(bytes) {
        if (!bytes) return '0 Bytes';
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getUserColor(username) {
        if (!username) return '#cdb4db';
        const user = this.boardData.users.find(u => u.username === username);
        return user?.avatarColor || '#cdb4db';
    }

    resetUI() {
        const usersList = document.getElementById('usersList');
        const columnsContainer = document.getElementById('columnsContainer');
        const chatMessages = document.getElementById('chatMessages');
        const activityFeed = document.getElementById('activityFeed');
        const onlineCount = document.getElementById('onlineCount');
        const currentUser = document.getElementById('currentUser');
        const userAvatar = document.getElementById('userAvatar');
        
        if (usersList) usersList.innerHTML = '';
        if (columnsContainer) columnsContainer.innerHTML = '';
        if (chatMessages) {
            chatMessages.innerHTML = `
                <div class="system-message welcome">
                    <i class="fas fa-rocket"></i>
                    Welcome to team collaboration! Start chatting with your team.
                </div>
            `;
        }
        if (activityFeed) activityFeed.innerHTML = '';
        if (onlineCount) onlineCount.textContent = '0';
        if (currentUser) currentUser.textContent = 'Guest';
        if (userAvatar) {
            userAvatar.style.backgroundColor = '';
            userAvatar.textContent = '';
        }
    }
}

console.log('Loading app...');
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, creating app instance');
    try {
        window.app = new CollabBoardApp();
        console.log('App instance created successfully');
    } catch (error) {
        console.error('Failed to create app instance:', error);
        alert('Failed to initialize application. Please check console for errors.');
    }
});

const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    .alert {
        animation: slideInRight 0.3s ease;
    }
`;
document.head.appendChild(style);