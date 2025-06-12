// レンダラープロセス用JavaScript（IPC通信版）
class ANICCARenderer {
    constructor() {
        this.isNarrating = false;
        this.currentLanguage = 'ja';
        this.commentaryCount = 0;
        
        // 翻訳データ
        this.translations = {
            ja: {
                'subtitle': 'AI Screen Narrator - あなたの画面を理解し、実況します',
                'start-btn': '▶️ 実況開始',
                'stop-btn': '⏹️ 実況停止',
                'daily-btn': '📅 行動ログを見る',
                'status-waiting': '準備中...',
                'status-running': '実況中...',
                'status-stopped': '停止中',
                'system-status': '📊 システム状態',
                'capture-interval': 'キャプチャ間隔:',
                'interval-8sec': '約8秒',
                'ai-model': 'AI モデル:',
                'connection': '接続状態:',
                'connected': '接続済み',
                'disconnected': '切断',
                'live-commentary': '💬 リアルタイム実況',
                'total-count': '総数:',
                'last-updated': '更新:',
                'start-instruction': '実況を開始すると、ここにAIの分析結果が表示されます',
                'current-understanding': '🧠 現在の理解',
                'learning-patterns': '画面を分析して、あなたの活動を理解中です...',
                'narration-started': 'anicca AGI実況システムが開始されました',
                'narration-stopped': 'anicca実況システムが停止されました',
                'daily-view-preparing': 'Daily View機能は準備中です',
                'service-error': 'サービスエラー',
                'unknown': 'Unknown',
                'other': 'その他',
                'agent-mode': 'Agent Mode',
                'user-profile': '👤 ユーザープロファイル',
                'profile-description': 'ANICCAがより良くサポートできるよう、あなたについて教えてください',
                'email-behavior-label': 'メール作成で止まった時、どうして欲しいですか？',
                'email-behavior-placeholder': '例：下書きを作成して欲しい',
                'docs-behavior-label': 'ドキュメント作成で詰まった時、どうして欲しいですか？',
                'docs-behavior-placeholder': '例：まず書き始めて欲しい',
                'youtube-limit-label': 'YouTubeはどのくらいまで見てもOKですか？',
                'youtube-limit-placeholder': '例：3分まで、その後は作業に戻して',
                'work-style-label': 'あなたの作業スタイルを教えてください',
                'work-style-placeholder': '例：集中したい時は邪魔しないで、困った時は積極的に助けて',
                'goals-label': '達成したい目標や、なりたい自分について',
                'goals-placeholder': '例：もっと生産的になりたい、SNSの時間を減らしたい',
                'save-profile': '💾 プロファイルを保存'
            },
            en: {
                'subtitle': 'AI Screen Narrator - Understanding and narrating your screen',
                'start-btn': '▶️ Start Commentary',
                'stop-btn': '⏹️ Stop Commentary',
                'daily-btn': '📅 View Activity Log',
                'status-waiting': 'Waiting...',
                'status-running': 'Running...',
                'status-stopped': 'Stopped',
                'system-status': '📊 System Status',
                'capture-interval': 'Capture Interval:',
                'interval-8sec': '~8 seconds',
                'ai-model': 'AI Model:',
                'connection': 'Connection:',
                'connected': 'Connected',
                'disconnected': 'Disconnected',
                'live-commentary': '💬 Live Commentary',
                'total-count': 'Total:',
                'last-updated': 'Updated:',
                'start-instruction': 'Start narration to see AI analysis results here',
                'current-understanding': '🧠 Current Understanding',
                'learning-patterns': 'Analyzing screen and learning your activity patterns...',
                'narration-started': 'anicca AGI narration system started',
                'narration-stopped': 'anicca narration system stopped',
                'daily-view-preparing': 'Daily View feature is in preparation',
                'service-error': 'Service Error',
                'unknown': 'Unknown',
                'other': 'Other',
                'agent-mode': 'Agent Mode',
                'user-profile': '👤 User Profile',
                'profile-description': 'Tell us about yourself so ANICCA can better support you',
                'email-behavior-label': 'What should I do when you\'re stuck with emails?',
                'email-behavior-placeholder': 'e.g., Draft an email for me',
                'docs-behavior-label': 'What should I do when you\'re stuck with documents?',
                'docs-behavior-placeholder': 'e.g., Help me start writing',
                'youtube-limit-label': 'How long is it OK to watch YouTube?',
                'youtube-limit-placeholder': 'e.g., 3 minutes max, then get me back to work',
                'work-style-label': 'Tell me about your work style',
                'work-style-placeholder': 'e.g., Don\'t disturb when focused, actively help when stuck',
                'goals-label': 'Your goals and who you want to become',
                'goals-placeholder': 'e.g., Be more productive, reduce social media time',
                'save-profile': '💾 Save Profile'
            }
        };
        
        this.init();
    }

    async init() {
        console.log('🎮 ANICCA Renderer initializing...');
        
        // DOM要素の取得
        this.elements = {
            startBtn: document.getElementById('start-btn'),
            stopBtn: document.getElementById('stop-btn'),
            dailyViewBtn: document.getElementById('daily-view-btn'),
            languageSelect: document.getElementById('language-select'),
            agentModeCheckbox: document.getElementById('agent-mode-checkbox'),
            modelSelect: document.getElementById('model-select'),
            statusIndicator: document.querySelector('.status-indicator'),
            statusText: document.getElementById('status-text'),
            connectionStatus: document.getElementById('connection-status'),
            currentUnderstanding: document.getElementById('current-understanding'),
            commentaryContainer: document.getElementById('commentary-container'),
            commentaryCount: document.getElementById('commentary-count'),
            lastUpdate: document.getElementById('last-update'),
        };

        // 保存された言語設定を読み込み
        await this.loadLanguageSetting();
        
        // 保存されたAgent Mode設定を読み込み
        await this.loadAgentModeSetting();
        
        // 保存されたモデル設定を読み込み
        await this.loadModelSetting();

        // イベントリスナーの設定
        this.setupEventListeners();
        
        // IPCイベントリスナーの設定
        this.setupIPCListeners();
        
        // 初期状態の取得
        await this.updateStatus();
        
        // 現在の理解を取得・表示
        await this.loadCurrentUnderstanding();
        
        
        // 初期言語設定
        this.updateTexts();
        
        // ページ読み込み後に理解度を再度確認（Daily Viewからの戻り対応）
        setTimeout(async () => {
            await this.loadCurrentUnderstanding();
        }, 1500);
        
        console.log('✅ ANICCA Renderer initialized');
    }

    setupEventListeners() {
        // 実況開始ボタン
        this.elements.startBtn?.addEventListener('click', () => this.startNarration());
        
        // 実況停止ボタン
        this.elements.stopBtn?.addEventListener('click', () => this.stopNarration());
        
        // 言語選択
        this.elements.languageSelect?.addEventListener('change', (e) => {
            this.setLanguage(e.target.value);
        });

        // Daily viewボタン
        this.elements.dailyViewBtn?.addEventListener('click', () => this.openDailyView());
        
        // Agent Modeトグル
        this.elements.agentModeCheckbox?.addEventListener('change', (e) => {
            this.setAgentMode(e.target.checked);
        });
        
        // モデル選択
        this.elements.modelSelect?.addEventListener('change', (e) => {
            this.setModel(e.target.value);
        });
        
        // User Profile関連の要素を追加
        this.setupUserProfileElements();
        
        // ページがフォーカスされた際に理解度を再読み込み（Daily Viewからの戻り対応）
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                console.log('🧠 Page became visible, refreshing understanding...');
                setTimeout(() => {
                    this.loadCurrentUnderstanding();
                }, 500);
            }
        });
        
        // ウィンドウがフォーカスされた際にも理解度を再読み込み
        window.addEventListener('focus', () => {
            console.log('🧠 Window focused, refreshing understanding...');
            setTimeout(() => {
                this.loadCurrentUnderstanding();
            }, 500);
        });
    }

    setupIPCListeners() {
        // 実況データ受信
        window.aniccaAPI.onCommentary((data) => {
            this.addCommentary(data);
        });

        // エラー受信
        window.aniccaAPI.onError((error) => {
            this.showError(error);
        });

        // 理解度更新受信
        window.aniccaAPI.onUnderstandingUpdate((data) => {
            this.updateCurrentUnderstanding(data.understanding);
        });

        // 使用量制限到達
        window.aniccaAPI.onEvent('daily-limit-reached', (data) => {
            this.showDailyLimitReached(data);
            this.stopNarration(); // 自動停止
        });

        // 使用量更新
        window.aniccaAPI.onEvent('usage-update', (data) => {
            this.updateUsageDisplay(data);
        });
    }

    async startNarration() {
        try {
            this.setLoading(true);
            console.log('🚀 Starting narration...');
            
            const result = await window.aniccaAPI.startNarration();
            
            if (result.success) {
                this.isNarrating = true;
                this.updateButtonStates();
                this.updateStatusIndicator(true);
                this.updateStatusText(this.getText('status-running'));
                this.showSuccess(this.getText('narration-started'));
                
                // 実況開始時にウェルカムメッセージをクリア
                const emptyState = this.elements.commentaryContainer?.querySelector('.empty-state');
                if (emptyState) {
                    emptyState.style.display = 'none';
                }
                
                console.log('✅ Narration started successfully');
            } else {
                this.showError(result.error || '実況開始に失敗しました');
            }
        } catch (error) {
            console.error('❌ Error starting narration:', error);
            this.showError('実況開始中にエラーが発生しました');
        } finally {
            this.setLoading(false);
        }
    }

    async stopNarration() {
        try {
            this.setLoading(true);
            console.log('⏹️ Stopping narration...');
            
            const result = await window.aniccaAPI.stopNarration();
            
            if (result.success) {
                this.isNarrating = false;
                this.updateButtonStates();
                this.updateStatusIndicator(false);
                this.updateStatusText(this.getText('status-stopped'));
                this.showSuccess(this.getText('narration-stopped'));
                console.log('✅ Narration stopped successfully');
            } else {
                this.showError(result.error || '実況停止に失敗しました');
            }
        } catch (error) {
            console.error('❌ Error stopping narration:', error);
            this.showError('実況停止中にエラーが発生しました');
        } finally {
            this.setLoading(false);
        }
    }

    async setLanguage(language) {
        try {
            this.currentLanguage = language;
            const result = await window.aniccaAPI.setLanguage(language);
            
            if (result.success) {
                console.log('🌍 Language set to:', language);
                this.updateTexts();
                // 言語変更後に現在の理解を再読み込み
                await this.loadCurrentUnderstanding();
            }
        } catch (error) {
            console.error('❌ Error setting language:', error);
        }
    }

    getText(key) {
        return this.translations[this.currentLanguage][key] || this.translations['ja'][key] || key;
    }

    updateTexts() {
        // data-i18n属性を持つ要素を更新
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const text = this.getText(key);
            
            // HTMLタグが含まれている場合は innerHTML、そうでなければ textContent
            if (text.includes('<')) {
                element.innerHTML = text;
            } else {
                element.textContent = text;
            }
        });
    }

    addCommentary(data) {
        this.commentaryCount++;
        
        const commentaryItem = document.createElement('div');
        commentaryItem.className = 'commentary-item';
        
        const timestamp = new Date(data.timestamp).toLocaleTimeString(
            this.currentLanguage === 'ja' ? 'ja-JP' : 'en-US'
        );
        
        
        commentaryItem.innerHTML = `
            <div class="commentary-header-item">
                <span class="website-name">${data.websiteName || this.getText('unknown')}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="commentary-text">${data.commentary}</div>
            <div class="commentary-meta">
                <span class="category">${data.actionCategory || this.getText('other')}</span>
            </div>
        `;
        
        // 最新のコメントを上に追加
        this.elements.commentaryContainer?.insertBefore(
            commentaryItem, 
            this.elements.commentaryContainer.firstChild
        );
        
        // 表示数を制限（最新20件のみ）
        const items = this.elements.commentaryContainer?.children;
        if (items && items.length > 20) {
            items[items.length - 1].remove();
        }
        
        // カウンターと最終更新時刻を更新
        this.updateCommentaryCount();
        this.updateLastUpdate();
        
        // 理解度を更新
        if (data.current_understanding) {
            this.updateCurrentUnderstanding(data.current_understanding);
        }
        
        console.log('💬 Commentary added:', data.commentary.substring(0, 50) + '...');
    }


    updateCurrentUnderstanding(understanding) {
        if (this.elements.currentUnderstanding && understanding) {
            this.elements.currentUnderstanding.textContent = understanding;
        }
    }

    updateButtonStates() {
        if (this.elements.startBtn) {
            this.elements.startBtn.disabled = this.isNarrating;
        }
        if (this.elements.stopBtn) {
            this.elements.stopBtn.disabled = !this.isNarrating;
        }
    }

    updateStatusIndicator(active) {
        if (this.elements.statusIndicator) {
            this.elements.statusIndicator.classList.toggle('active', active);
        }
    }

    updateStatusText(text) {
        if (this.elements.statusText) {
            this.elements.statusText.textContent = text;
        }
    }

    updateCommentaryCount() {
        if (this.elements.commentaryCount) {
            this.elements.commentaryCount.textContent = this.commentaryCount;
        }
    }

    updateLastUpdate() {
        if (this.elements.lastUpdate) {
            this.elements.lastUpdate.textContent = new Date().toLocaleTimeString('ja-JP');
        }
    }

    setLoading(loading) {
        const buttons = [this.elements.startBtn, this.elements.stopBtn];
        buttons.forEach(btn => {
            if (btn) {
                btn.style.opacity = loading ? '0.6' : '1';
                btn.style.cursor = loading ? 'wait' : 'pointer';
            }
        });
    }

    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    showError(error) {
        const message = typeof error === 'string' ? error : error.message || 'エラーが発生しました';
        this.showNotification(message, 'error');
        console.error('❌ Error:', error);
    }

    showNotification(message, type = 'info', description = '') {
        // 通知要素を作成
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        
        // メッセージとオプションの説明を設定
        if (description) {
            notification.innerHTML = `<strong>${message}</strong><br><span style="font-size: 0.9em; opacity: 0.9;">${description}</span>`;
        } else {
            notification.textContent = message;
        }
        
        // スタイル設定
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            max-width: 300px;
            word-wrap: break-word;
        `;
        
        // タイプ別の色設定
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#4CAF50';
                break;
            case 'error':
                notification.style.backgroundColor = '#f44336';
                break;
            default:
                notification.style.backgroundColor = '#2196F3';
        }
        
        document.body.appendChild(notification);
        
        // アニメーション
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 100);
        
        // 自動削除
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    async updateStatus() {
        try {
            const health = await window.aniccaAPI.getHealth();
            
            if (health.status === 'ok') {
                this.updateStatusText(this.getText('status-waiting'));
                if (this.elements.connectionStatus) {
                    this.elements.connectionStatus.textContent = this.getText('connected');
                    this.elements.connectionStatus.style.color = '#4CAF50';
                }
                console.log('💚 Services healthy');
            }
        } catch (error) {
            console.error('❌ Error checking health:', error);
            this.updateStatusText(this.getText('service-error'));
            if (this.elements.connectionStatus) {
                this.elements.connectionStatus.textContent = this.getText('disconnected');
                this.elements.connectionStatus.style.color = '#f44336';
            }
        }
    }

    openDailyView() {
        // Daily viewページに遷移
        console.log('📊 Opening daily view...');
        // 現在の言語設定を保存してから遷移
        window.aniccaAPI.setSetting('language', this.currentLanguage).then(() => {
            window.location.href = 'daily.html';
        }).catch(error => {
            console.error('Error saving language before navigation:', error);
            window.location.href = 'daily.html';
        });
    }

    async loadCurrentUnderstanding() {
        try {
            console.log('🧠 Loading current understanding...');
            const understanding = await window.aniccaAPI.getCurrentUnderstanding();
            console.log('🧠 Received understanding:', understanding);
            if (this.elements.currentUnderstanding && understanding) {
                // 有効な理解が返ってきた場合は常に更新
                if (understanding && understanding.trim() !== '' && 
                    understanding !== '画面を分析して、あなたの活動を理解中です...' &&
                    understanding !== 'ユーザーの行動パターンを学習中です。') {
                    this.elements.currentUnderstanding.textContent = understanding;
                    console.log('🧠 Understanding displayed successfully');
                } else {
                    console.log('🧠 Default message received, keeping current understanding or setting fallback');
                    // 現在の表示がデフォルトメッセージの場合のみ更新
                    const currentText = this.elements.currentUnderstanding.textContent;
                    if (!currentText || currentText === '画面を分析して、あなたの活動を理解中です...' || 
                        currentText === 'ユーザーの行動パターンを学習中です。') {
                        this.elements.currentUnderstanding.textContent = '画面を分析して、あなたの活動を理解中です...';
                    }
                }
            } else {
                console.error('❌ currentUnderstanding element not found or no understanding data');
            }
        } catch (error) {
            console.error('❌ Error loading current understanding:', error);
            if (this.elements.currentUnderstanding) {
                this.elements.currentUnderstanding.textContent = '画面を分析して、あなたの活動を理解中です...';
            }
        }
    }

    // 現在の理解を強制的に更新するメソッド
    async refreshCurrentUnderstanding() {
        await this.loadCurrentUnderstanding();
    }


    async loadLanguageSetting() {
        try {
            const savedLanguage = await window.aniccaAPI.getSetting('language');
            if (savedLanguage) {
                this.currentLanguage = savedLanguage;
                if (this.elements.languageSelect) {
                    this.elements.languageSelect.value = savedLanguage;
                }
                console.log('🌍 Loaded saved language:', savedLanguage);
            }
        } catch (error) {
            console.error('❌ Error loading language setting:', error);
        }
    }
    
    async loadAgentModeSetting() {
        try {
            const agentMode = await window.aniccaAPI.getSetting('agentMode');
            if (agentMode !== null && agentMode !== undefined) {
                this.elements.agentModeCheckbox.checked = agentMode === 'true' || agentMode === true;
            } else {
                // デフォルトはOFF
                this.elements.agentModeCheckbox.checked = false;
                await window.aniccaAPI.setSetting('agentMode', false);
            }
            console.log('🤖 Loaded agent mode:', this.elements.agentModeCheckbox.checked ? 'ON' : 'OFF');
        } catch (error) {
            console.error('❌ Error loading agent mode setting:', error);
        }
    }
    
    async setAgentMode(enabled) {
        try {
            await window.aniccaAPI.setSetting('agentMode', enabled);
            console.log('🤖 Agent Mode set to:', enabled ? 'ON' : 'OFF');
            
            // 視覚的フィードバック
            const title = this.currentLanguage === 'ja' 
                ? (enabled ? 'Agent Mode 有効化' : 'Agent Mode 無効化')
                : (enabled ? 'Agent Mode Enabled' : 'Agent Mode Disabled');
            const message = this.currentLanguage === 'ja'
                ? (enabled ? 'AIが画面を観察し、必要に応じて通知とアクションを実行します' : '観察のみモードに切り替わりました')
                : (enabled ? 'AI will observe and take actions when needed' : 'Switched to observation-only mode');
            
            this.showNotification(title, 'info', message);
        } catch (error) {
            console.error('❌ Error setting agent mode:', error);
        }
    }
    
    async loadModelSetting() {
        try {
            const savedModel = await window.aniccaAPI.getSetting('geminiModel');
            if (savedModel && this.elements.modelSelect) {
                this.elements.modelSelect.value = savedModel;
                console.log('🤖 Loaded saved model:', savedModel);
            }
        } catch (error) {
            console.error('❌ Error loading model setting:', error);
        }
    }
    
    async setModel(modelName) {
        try {
            await window.aniccaAPI.setModel(modelName);
            console.log('🤖 Model set to:', modelName);
            
            // 視覚的フィードバック
            const modelDisplayName = modelName === 'gemini-2.0-flash' ? 'Gemini 2.0 Flash' : 'Gemini 2.5 Flash';
            const title = this.currentLanguage === 'ja' 
                ? 'AIモデル変更' 
                : 'AI Model Changed';
            const message = this.currentLanguage === 'ja'
                ? `${modelDisplayName} に切り替えました`
                : `Switched to ${modelDisplayName}`;
            
            this.showNotification(title, 'info', message);
        } catch (error) {
            console.error('❌ Error setting model:', error);
        }
    }

    // User Profile関連のメソッド
    setupUserProfileElements() {
        // User Profile要素を取得
        const saveProfileBtn = document.getElementById('save-profile-btn');
        const profileInputs = {
            goals: document.getElementById('goals')
        };
        
        // 保存ボタンのイベントリスナー
        saveProfileBtn?.addEventListener('click', async () => {
            await this.saveUserProfile(profileInputs);
        });
        
        // 既存のプロファイルを読み込む
        this.loadUserProfile(profileInputs);
    }
    
    async loadUserProfile(inputs) {
        try {
            const result = await window.aniccaAPI.getUserProfile();
            if (result.success && result.profile) {
                // プロファイルが存在する場合、フォームに値を設定
                const profile = result.profile;
                if (inputs.goals) inputs.goals.value = profile.goals || '';
                
                console.log('👤 User profile loaded');
            }
        } catch (error) {
            console.error('❌ Error loading user profile:', error);
        }
    }
    
    async saveUserProfile(inputs) {
        try {
            const profile = {
                emailBehavior: '',
                docsBehavior: '',
                youtubeLimit: '',
                workStyle: '',
                goals: inputs.goals?.value || '',
                gmailAddress: '',
                gmailPassword: ''
            };
            
            const result = await window.aniccaAPI.saveUserProfile(profile);
            
            // 保存ステータスを表示
            const saveStatus = document.getElementById('profile-save-status');
            if (saveStatus) {
                if (result.success) {
                    saveStatus.textContent = this.currentLanguage === 'ja' 
                        ? '✅ 保存しました' 
                        : '✅ Saved successfully';
                    saveStatus.className = 'save-status success';
                } else {
                    saveStatus.textContent = this.currentLanguage === 'ja' 
                        ? '❌ 保存に失敗しました' 
                        : '❌ Failed to save';
                    saveStatus.className = 'save-status error';
                }
                
                // 3秒後にメッセージを消す
                setTimeout(() => {
                    saveStatus.textContent = '';
                    saveStatus.className = 'save-status';
                }, 3000);
            }
            
            console.log('👤 User profile saved');
        } catch (error) {
            console.error('❌ Error saving user profile:', error);
        }
    }

    // 使用量制限到達時の処理
    showDailyLimitReached(data) {
        const message = this.currentLanguage === 'ja' 
            ? `今日の無料利用制限(${data.limit}回)に達しました。${data.resetTime}にリセットされます。`
            : `Daily free limit (${data.limit} requests) reached. Resets at ${data.resetTime}.`;
        
        this.showNotification(message, 'error');
        
        // 制限到達ダイアログを表示
        const dialog = document.createElement('div');
        dialog.className = 'limit-dialog';
        dialog.innerHTML = `
            <div class="limit-dialog-content">
                <h3>🚫 ${this.currentLanguage === 'ja' ? '利用制限到達' : 'Daily Limit Reached'}</h3>
                <p>${message}</p>
                <p style="margin-top: 15px; font-size: 0.9em; color: #666;">
                    ${this.currentLanguage === 'ja' 
                        ? 'aniccaをお使いいただき、ありがとうございます！明日も引き続きお楽しみください。' 
                        : 'Thank you for using anicca! Please come back tomorrow for more insights.'}
                </p>
                <button onclick="this.parentElement.parentElement.remove()" class="limit-dialog-btn">
                    ${this.currentLanguage === 'ja' ? 'OK' : 'OK'}
                </button>
            </div>
        `;
        
        // ダイアログのスタイル
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
        `;
        
        dialog.querySelector('.limit-dialog-content').style.cssText = `
            background: white;
            padding: 30px;
            border-radius: 12px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        `;
        
        dialog.querySelector('.limit-dialog-btn').style.cssText = `
            background: #2196F3;
            color: white;
            border: none;
            padding: 10px 25px;
            border-radius: 6px;
            cursor: pointer;
            margin-top: 15px;
        `;
        
        document.body.appendChild(dialog);
    }

    // 使用量表示の更新
    updateUsageDisplay(data) {
        // 使用量表示エリアを作成（存在しない場合）
        let usageDisplay = document.getElementById('usage-display');
        if (!usageDisplay) {
            usageDisplay = document.createElement('div');
            usageDisplay.id = 'usage-display';
            usageDisplay.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(33, 150, 243, 0.9);
                color: white;
                padding: 8px 15px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                z-index: 1000;
                transition: all 0.3s ease;
            `;
            document.body.appendChild(usageDisplay);
        }
        
        // 使用量に応じて色を変更
        const percentage = (data.usage / data.limit) * 100;
        let backgroundColor = 'rgba(33, 150, 243, 0.9)'; // 青（正常）
        
        if (percentage >= 90) {
            backgroundColor = 'rgba(244, 67, 54, 0.9)'; // 赤（危険）
        } else if (percentage >= 70) {
            backgroundColor = 'rgba(255, 152, 0, 0.9)'; // オレンジ（警告）
        }
        
        usageDisplay.style.backgroundColor = backgroundColor;
        usageDisplay.textContent = `API使用量: ${data.usage}/${data.limit}`;
        
        // 制限が近い場合の警告
        if (percentage >= 80 && percentage < 100) {
            const warningMessage = this.currentLanguage === 'ja'
                ? `残り${data.remaining}回で今日の利用制限に達します`
                : `${data.remaining} requests remaining until daily limit`;
            this.showNotification(warningMessage, 'info');
        }
    }
}

// DOM読み込み完了後に初期化
document.addEventListener('DOMContentLoaded', () => {
    // aniccaAPIが利用可能になるまで待機
    const initRenderer = () => {
        if (window.aniccaAPI) {
            new ANICCARenderer();
        } else {
            setTimeout(initRenderer, 100);
        }
    };
    
    initRenderer();
}); 