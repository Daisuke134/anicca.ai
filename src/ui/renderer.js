// レンダラープロセス用JavaScript（IPC通信版）
class ANICCARenderer {
    constructor() {
        this.isNarrating = false;
        this.currentLanguage = 'ja';
        this.commentaryCount = 0;
        this.totalPredictions = 0;
        this.correctPredictions = 0;
        
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
                'prediction-accuracy': '🎯 予測精度',
                'total-predictions': '総予測数:',
                'correct-predictions': '的中数:',
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
                'verification-title': '📊 予測検証',
                'previous-prediction': '前回の予測:',
                'actual-action': '実際の行動:',
                'result': '結果:',
                'analysis': '分析:',
                'prediction-title': '🔮 次の予測',
                'action': '行動:',
                'reasoning': '理由:',
                'accuracy-hit': '的中',
                'accuracy-miss': '外れ',
                'unknown': 'Unknown',
                'other': 'その他'
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
                'prediction-accuracy': '🎯 Prediction Accuracy',
                'total-predictions': 'Total Predictions:',
                'correct-predictions': 'Correct:',
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
                'verification-title': '📊 Prediction Verification',
                'previous-prediction': 'Previous Prediction:',
                'actual-action': 'Actual Action:',
                'result': 'Result:',
                'analysis': 'Analysis:',
                'prediction-title': '🔮 Next Prediction',
                'action': 'Action:',
                'reasoning': 'Reasoning:',
                'accuracy-hit': 'Correct',
                'accuracy-miss': 'Wrong',
                'unknown': 'Unknown',
                'other': 'Other'
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
            statusIndicator: document.querySelector('.status-indicator'),
            statusText: document.getElementById('status-text'),
            connectionStatus: document.getElementById('connection-status'),
            currentUnderstanding: document.getElementById('current-understanding'),
            commentaryContainer: document.getElementById('commentary-container'),
            commentaryCount: document.getElementById('commentary-count'),
            lastUpdate: document.getElementById('last-update'),
            totalPredictions: document.getElementById('total-predictions'),
            correctPredictions: document.getElementById('correct-predictions'),
            accuracyRate: document.getElementById('accuracy-rate')
        };

        // 保存された言語設定を読み込み
        await this.loadLanguageSetting();

        // イベントリスナーの設定
        this.setupEventListeners();
        
        // IPCイベントリスナーの設定
        this.setupIPCListeners();
        
        // 初期状態の取得
        await this.updateStatus();
        
        // 現在の理解を取得・表示
        await this.loadCurrentUnderstanding();
        
        // 予測精度統計を読み込み
        await this.loadPredictionStats();
        
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
            this.updateAccuracy(data.prediction_verification);
        });

        // エラー受信
        window.aniccaAPI.onError((error) => {
            this.showError(error);
        });

        // 理解度更新受信
        window.aniccaAPI.onUnderstandingUpdate((data) => {
            this.updateCurrentUnderstanding(data.understanding);
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
        
        // 予測検証セクションの作成
        const verificationSection = this.createVerificationSection(data.prediction_verification);
        
        // 予測セクションの作成
        const predictionSection = this.createPredictionSection(data.prediction);
        
        commentaryItem.innerHTML = `
            <div class="commentary-header-item">
                <span class="website-name">${data.websiteName || this.getText('unknown')}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="commentary-text">${data.commentary}</div>
            ${verificationSection}
            ${predictionSection}
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

    createVerificationSection(verification) {
        if (!verification || verification.accuracy === null) {
            return '';
        }

        const accuracyClass = verification.accuracy ? 'accuracy-true' : 'accuracy-false';
        const accuracyText = verification.accuracy ? this.getText('accuracy-hit') : this.getText('accuracy-miss');

        return `
            <div class="verification-section">
                <div class="verification-title">${this.getText('verification-title')}</div>
                <div class="verification-item"><strong>${this.getText('previous-prediction')}</strong> ${verification.previous_prediction}</div>
                <div class="verification-item"><strong>${this.getText('actual-action')}</strong> ${verification.actual_action}</div>
                <div class="verification-item">
                    <strong>${this.getText('result')}</strong> 
                    <span class="accuracy-indicator ${accuracyClass}">${accuracyText}</span>
                </div>
                <div class="verification-item"><strong>${this.getText('analysis')}</strong> ${verification.reasoning}</div>
            </div>
        `;
    }

    createPredictionSection(prediction) {
        if (!prediction) {
            return '';
        }

        return `
            <div class="prediction-section">
                <div class="prediction-title">${this.getText('prediction-title')}</div>
                <div class="prediction-item"><strong>${this.getText('action')}</strong> ${prediction.action}</div>
                <div class="prediction-item"><strong>${this.getText('reasoning')}</strong> ${prediction.reasoning}</div>
            </div>
        `;
    }

    updateAccuracy(verification) {
        if (verification && verification.accuracy !== null) {
            this.totalPredictions++;
            if (verification.accuracy) {
                this.correctPredictions++;
            }
            this.updateAccuracyStats();
        }
    }

    updateAccuracyStats() {
        // 統計を更新
        if (this.elements.totalPredictions) {
            this.elements.totalPredictions.textContent = this.totalPredictions;
        }
        if (this.elements.correctPredictions) {
            this.elements.correctPredictions.textContent = this.correctPredictions;
        }
        
        // 精度を計算・表示
        if (this.elements.accuracyRate) {
            if (this.totalPredictions > 0) {
                const rate = ((this.correctPredictions / this.totalPredictions) * 100).toFixed(1);
                this.elements.accuracyRate.textContent = `${rate}%`;
                
                // 精度に応じて色を変更
                this.elements.accuracyRate.className = 'accuracy-number accuracy-percentage';
                if (rate >= 70) {
                    this.elements.accuracyRate.classList.add('high');
                } else if (rate >= 50) {
                    this.elements.accuracyRate.classList.add('medium');
                } else {
                    this.elements.accuracyRate.classList.add('low');
                }
            } else {
                this.elements.accuracyRate.textContent = '-%';
            }
        }
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

    showNotification(message, type = 'info') {
        // 通知要素を作成
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
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

    async loadPredictionStats() {
        try {
            const stats = await window.aniccaAPI.getPredictionStats();
            if (this.elements.totalPredictions) {
                this.elements.totalPredictions.textContent = stats.totalPredictions;
            }
            if (this.elements.correctPredictions) {
                this.elements.correctPredictions.textContent = stats.correctPredictions;
            }
            if (this.elements.accuracyRate) {
                const rate = ((stats.correctPredictions / stats.totalPredictions) * 100).toFixed(1);
                this.elements.accuracyRate.textContent = `${rate}%`;
                
                // 精度に応じて色を変更
                this.elements.accuracyRate.className = 'accuracy-number accuracy-percentage';
                if (rate >= 70) {
                    this.elements.accuracyRate.classList.add('high');
                } else if (rate >= 50) {
                    this.elements.accuracyRate.classList.add('medium');
                } else {
                    this.elements.accuracyRate.classList.add('low');
                }
            }
        } catch (error) {
            console.error('❌ Error loading prediction stats:', error);
            this.showError('予測精度統計を読み込み中にエラーが発生しました');
        }
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