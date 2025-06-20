// Daily View JavaScript
// 多言語対応の辞書
const translations = {
    ja: {
        'daily-title': 'anicca - 日々の活動ログ',
        'daily-subtitle': '日々の活動ログ - 今日のデジタルライフ分析',
        'back-btn': '← 実況に戻る',
        'today': '📅 今日',
        'yesterday': '⏪ 昨日', 
        'week-ago': '📊 1週間前',
        'month-ago': '📈 1ヶ月前',
        'daily-stats': '📊 今日の統計',
        'total-observations': '総観察数',
        'active-hours': '活動時間',
        'websites-visited': '訪問サイト数',
        'activity-distribution': '🍪 今日の活動分布',
        'daily-highlights': '🌟 今日のハイライト',
        'detailed-log': '📝 詳細ログ',
        'understanding-evolution': '🧠 理解度の推移',
        'loading-highlights': 'ハイライトを読み込み中...',
        'loading-log': '活動ログを読み込み中...',
        'loading-understanding': '理解度データを読み込み中...',
        'no-data': 'この日のデータがありません',
        'work': '仕事',
        'entertainment': 'エンターテイメント',
        'social': 'ソーシャル',
        'productivity': '生産性',
        'education': '学習',
        'other': 'その他',
        'hours': '時間',
        'understanding-morning': '朝の理解度',
        'understanding-afternoon': '午後の理解度',
        'understanding-evening': '夜の理解度',
        'ai-insight': 'AI洞察',
        'user-pattern': 'ユーザーパターン'
    },
    en: {
        'daily-title': 'anicca - Daily Activity Log',
        'daily-subtitle': 'Daily Activity Log - Today\'s Digital Life Analysis',
        'back-btn': '← Back to Live',
        'today': '📅 Today',
        'yesterday': '⏪ Yesterday',
        'week-ago': '📊 1 Week Ago',
        'month-ago': '📈 1 Month Ago',
        'daily-stats': '📊 Today\'s Statistics',
        'total-observations': 'Total Observations',
        'active-hours': 'Active Hours',
        'websites-visited': 'Websites Visited',
        'activity-distribution': '🍪 Today\'s Activity Distribution',
        'daily-highlights': '🌟 Today\'s Highlights',
        'detailed-log': '📝 Detailed Log',
        'understanding-evolution': '🧠 Understanding Evolution',
        'loading-highlights': 'Loading highlights...',
        'loading-log': 'Loading activity log...',
        'loading-understanding': 'Loading understanding data...',
        'no-data': 'No data available for this date',
        'work': 'Work',
        'entertainment': 'Entertainment',
        'social': 'Social',
        'productivity': 'Productivity',
        'education': 'Education',
        'other': 'Other',
        'hours': 'hours',
        'understanding-morning': 'Morning Understanding',
        'understanding-afternoon': 'Afternoon Understanding',
        'understanding-evening': 'Evening Understanding',
        'ai-insight': 'AI Insight',
        'user-pattern': 'User Pattern'
    }
};

// グローバル変数
let currentLanguage = 'ja';
let currentDate = new Date().toISOString().split('T')[0];
let currentPeriod = 'today';
let dailyData = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🔄 Daily page DOM loaded');
    
    // APIの存在確認
    if (!window.aniccaAPI) {
        console.error('❌ aniccaAPI not found! Check preload script.');
        alert('エラー: aniccaAPIが見つかりません。アプリを再起動してください。');
        return;
    }
    
    // 要素の存在確認
    const backBtn = document.getElementById('back-btn');
    if (!backBtn) {
        console.error('❌ Back button not found!');
    } else {
        console.log('✅ Back button found');
    }
    
    // 言語設定を取得
    currentLanguage = await window.aniccaAPI.getSetting('language') || 'ja';
    document.getElementById('language-select').value = currentLanguage;
    
    // 言語を適用
    updateLanguage();
    
    // データを読み込み
    await loadDailyData();
    
    // イベントリスナー設定
    setupEventListeners();
});

// イベントリスナー設定
function setupEventListeners() {
    // 戻るボタン
    document.getElementById('back-btn').addEventListener('click', () => {
        // 現在の言語設定を保存してからメイン画面に戻る
        window.aniccaAPI.setSetting('language', currentLanguage).then(() => {
            window.location.href = 'index.html';
        }).catch(error => {
            console.error('Error saving language:', error);
            window.location.href = 'index.html';
        });
    });
    
    // 言語選択
    document.getElementById('language-select').addEventListener('change', async (e) => {
        currentLanguage = e.target.value;
        await window.aniccaAPI.setSetting('language', currentLanguage);
        updateLanguage();
    });
    
    // 期間選択ボタン
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            // アクティブ状態を更新
            document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            
            // 期間を設定して日付を計算
            currentPeriod = e.target.dataset.period;
            currentDate = calculateDateFromPeriod(currentPeriod);
            
            // データを再読み込み
            await loadDailyData();
        });
    });
}

// 期間から日付を計算
function calculateDateFromPeriod(period) {
    const today = new Date();
    let targetDate = new Date();
    
    switch (period) {
        case 'today':
            targetDate = today;
            break;
        case 'yesterday':
            targetDate.setDate(today.getDate() - 1);
            break;
        case 'week':
            targetDate.setDate(today.getDate() - 7);
            break;
        case 'month':
            targetDate.setMonth(today.getMonth() - 1);
            break;
        default:
            targetDate = today;
    }
    
    return targetDate.toISOString().split('T')[0];
}

// 言語更新
function updateLanguage() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[currentLanguage] && translations[currentLanguage][key]) {
            element.textContent = translations[currentLanguage][key];
        }
    });
    
    // ページタイトルも更新
    document.title = translations[currentLanguage]['daily-title'];
}

// 日々のデータを読み込み
async function loadDailyData() {
    try {
        // 選択された日付のデータを取得
        dailyData = await window.aniccaAPI.getDailyData(currentDate);
        
        // 各セクションを更新
        updateStatistics();
        updateActivityChart(); // 円グラフを更新
        updateHighlights();
        // updateActivityLog(); // 削除されたセクションなのでコメントアウト
        
    } catch (error) {
        console.error('Failed to load daily data:', error);
        showEmptyState();
    }
}

// 統計セクション更新
function updateStatistics() {
    if (!dailyData || !dailyData.commentary || dailyData.commentary.length === 0) {
        document.getElementById('total-observations').textContent = '0';
            document.getElementById('active-hours').textContent = '0';
        document.getElementById('websites-visited').textContent = '0';
        updateActivityChart(); // データがない場合もグラフを更新
        return;
    }
    
    const commentary = dailyData.commentary;
    
    // 総観察数
    document.getElementById('total-observations').textContent = commentary.length;
    
    
    // 活動時間を計算（最初と最後のタイムスタンプから）
    if (commentary.length > 0) {
        const firstTime = new Date(commentary[0].timestamp);
        const lastTime = new Date(commentary[commentary.length - 1].timestamp);
        const activeHours = Math.round((lastTime - firstTime) / (1000 * 60 * 60) * 10) / 10;
        document.getElementById('active-hours').textContent = activeHours + (currentLanguage === 'ja' ? '時間' : 'h');
    } else {
        document.getElementById('active-hours').textContent = '0';
    }
    
    // 訪問サイト数
    const uniqueWebsites = new Set(commentary.map(item => item.website || 'Unknown'));
    document.getElementById('websites-visited').textContent = uniqueWebsites.size;
}

// ハイライトセクション更新
async function updateHighlights() {
    const container = document.getElementById('highlights-container');
    
    if (!dailyData || !dailyData.commentary || dailyData.commentary.length === 0) {
        container.innerHTML = `<div class="empty-state">${translations[currentLanguage]['no-data']}</div>`;
        return;
    }
    
    try {
        // highlightsManagerから本物のハイライトを取得
        const result = await window.aniccaAPI.getHighlights('daily', currentDate);
        
        if (!result.success || !result.highlights || result.highlights.length === 0) {
            // フォールバック：従来の方法でハイライトを生成
            const highlights = generateHighlights(dailyData.commentary);
            renderHighlights(container, highlights);
            return;
        }
        
        // Geminiが生成した本物のハイライトをレンダリング
        renderHighlights(container, result.highlights);
        
    } catch (error) {
        console.error('Error getting highlights:', error);
        // エラー時は従来の方法でハイライトを生成
        const highlights = generateHighlights(dailyData.commentary);
        renderHighlights(container, highlights);
    }
}

// ハイライトをレンダリング
function renderHighlights(container, highlights) {
    if (!highlights || highlights.length === 0) {
        container.innerHTML = `<div class="empty-state">${translations[currentLanguage]['no-data']}</div>`;
        return;
    }
    
    container.innerHTML = highlights.map((highlight, index) => `
        <div class="highlight-item">
            <div class="highlight-header">
                <span class="highlight-rank">${highlight.rank || (index + 1)}</span>
                <span class="highlight-title">${highlight.title}</span>
            </div>
            <div class="highlight-description">${highlight.description}</div>
            ${highlight.anicca_comment ? `<div class="anicca-comment">${highlight.anicca_comment}</div>` : ''}
            ${highlight.aiComment ? `<div class="anicca-comment">${highlight.aiComment}</div>` : ''}
            <div class="highlight-meta">
                <span class="highlight-category">${highlight.category || 'insight'}</span>
                <span class="highlight-time">${formatTime(highlight.timestamp || highlight.time)}</span>
            </div>
        </div>
    `).join('');
}

// ハイライト生成
function generateHighlights(commentary) {
    const highlights = [];
    
    
    // 長時間の活動パターンを探す
    const activityPatterns = findActivityPatterns(commentary);
    activityPatterns.forEach(pattern => {
        highlights.push({
            title: currentLanguage === 'ja' ? `${pattern.activity}での集中時間` : `Focused time on ${pattern.activity}`,
            description: currentLanguage === 'ja' 
                ? `${pattern.duration}分間継続して${pattern.activity}に取り組んでいました。`
                : `Spent ${pattern.duration} minutes continuously working on ${pattern.activity}.`,
            aiComment: currentLanguage === 'ja'
                ? 'このような集中した作業時間は生産性向上に寄与します。'
                : 'Such focused work sessions contribute to improved productivity.',
            category: 'productivity',
            time: pattern.startTime
        });
    });
    
    // ユニークな活動を探す
    const uniqueActivities = findUniqueActivities(commentary);
    uniqueActivities.forEach(activity => {
        highlights.push({
            title: currentLanguage === 'ja' ? '新しい活動パターン' : 'New Activity Pattern',
            description: activity.description,
            aiComment: currentLanguage === 'ja'
                ? 'この活動パターンは今日初めて観察されました。'
                : 'This activity pattern was observed for the first time today.',
            category: 'user-pattern',
            time: activity.time
        });
    });
    
    return highlights.slice(0, 5); // 上位5つまで
}

// 活動パターン検出
function findActivityPatterns(commentary) {
    const patterns = [];
    let currentActivity = null;
    let activityStart = null;
    let activityDuration = 0;
    
    commentary.forEach((item, index) => {
        const website = item.website || 'Unknown';
        
        if (currentActivity === website) {
            activityDuration += 8; // 8秒間隔
        } else {
            if (currentActivity && activityDuration >= 300) { // 5分以上
                patterns.push({
                    activity: currentActivity,
                    duration: Math.round(activityDuration / 60),
                    startTime: activityStart
                });
            }
            currentActivity = website;
            activityStart = item.timestamp;
            activityDuration = 8;
        }
    });
    
    return patterns.slice(0, 3);
}

// ユニークな活動検出
function findUniqueActivities(commentary) {
    const activities = [];
    const websiteChanges = [];
    
    for (let i = 1; i < commentary.length; i++) {
        const prev = commentary[i-1];
        const curr = commentary[i];
        
        if (prev.website !== curr.website) {
            websiteChanges.push({
                description: currentLanguage === 'ja' 
                    ? `${prev.website}から${curr.website}に移動`
                    : `Moved from ${prev.website} to ${curr.website}`,
                time: curr.timestamp
            });
        }
    }
    
    return websiteChanges.slice(0, 2);
}

// 詳細ログ更新
function updateActivityLog() {
    const container = document.getElementById('activity-log');
    
    if (!dailyData || !dailyData.commentary || dailyData.commentary.length === 0) {
        container.innerHTML = `<div class="empty-state">${translations[currentLanguage]['no-data']}</div>`;
        return;
    }
    
    const logItems = dailyData.commentary.map(item => `
        <div class="log-item">
            <div class="log-header">
                <span class="log-website">${item.website || 'Unknown'}</span>
                <span class="log-time">${formatTime(item.timestamp)}</span>
            </div>
            <div class="log-commentary">${item.understanding_text || item.commentary_text}</div>
            <span class="log-category">${getCategoryFromWebsite(item.website)}</span>
        </div>
    `).join('');
    
    container.innerHTML = logItems;
}

// ユーティリティ関数
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString(currentLanguage === 'ja' ? 'ja-JP' : 'en-US', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getCategoryFromWebsite(website) {
    if (!website) return translations[currentLanguage]['other'];
    
    const lowerWebsite = website.toLowerCase();
    if (lowerWebsite.includes('youtube') || lowerWebsite.includes('netflix') || lowerWebsite.includes('twitch')) {
        return translations[currentLanguage]['entertainment'];
    }
    if (lowerWebsite.includes('github') || lowerWebsite.includes('stackoverflow') || lowerWebsite.includes('vscode')) {
        return translations[currentLanguage]['work'];
    }
    if (lowerWebsite.includes('twitter') || lowerWebsite.includes('facebook') || lowerWebsite.includes('instagram')) {
        return translations[currentLanguage]['social'];
    }
    if (lowerWebsite.includes('notion') || lowerWebsite.includes('gmail') || lowerWebsite.includes('calendar')) {
        return translations[currentLanguage]['productivity'];
    }
    return translations[currentLanguage]['other'];
}

function getAccuracyColor(accuracy) {
    if (accuracy >= 70) return '#4caf50';
    if (accuracy >= 50) return '#ff9800';
    return '#f44336';
}

// 活動分布チャートを更新
let activityChart = null;

function updateActivityChart() {
    const canvas = document.getElementById('activity-chart');
    const ctx = canvas.getContext('2d');
    
    // 既存のチャートがあれば破棄
    if (activityChart) {
        activityChart.destroy();
    }
    
    // データがない場合は空のグラフを表示
    if (!dailyData || !dailyData.commentary || dailyData.commentary.length === 0) {
        activityChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: [translations[currentLanguage]['no-data']],
                datasets: [{
                    data: [1],
                    backgroundColor: ['#e0e0e0']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        enabled: false
                    }
                }
            }
        });
        return;
    }
    
    // アクティビティカテゴリを集計
    const categoryCount = {};
    dailyData.commentary.forEach(item => {
        const category = item.action_category || 'その他';
        categoryCount[category] = (categoryCount[category] || 0) + 1;
    });
    
    // データを配列に変換してソート
    const sortedCategories = Object.entries(categoryCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // 最大8カテゴリまで
    
    // カラーパレット
    const colors = [
        '#667eea', // 紫
        '#f56565', // 赤
        '#ed8936', // オレンジ
        '#ecc94b', // 黄
        '#48bb78', // 緑
        '#38b2ac', // 青緑
        '#4299e1', // 青
        '#ed64a6'  // ピンク
    ];
    
    // チャートデータを準備
    const labels = sortedCategories.map(([category, _]) => category);
    const data = sortedCategories.map(([_, count]) => count);
    const backgroundColors = colors.slice(0, sortedCategories.length);
    
    // チャートを作成
    activityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // カスタム凡例を使用するため
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            const hours = (context.parsed * 8 / 3600).toFixed(1); // 8秒ごとの観察から時間を計算
                            return `${context.label}: ${percentage}% (${context.parsed}回, 約${hours}時間)`;
                        }
                    }
                }
            }
        }
    });
    
    // カスタム凡例を作成
    const legendContainer = document.getElementById('chart-legend');
    legendContainer.innerHTML = '';
    
    sortedCategories.forEach(([category, count], index) => {
        const total = data.reduce((a, b) => a + b, 0);
        const percentage = ((count / total) * 100).toFixed(1);
        
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        legendItem.innerHTML = `
            <div class="legend-color" style="background-color: ${backgroundColors[index]}"></div>
            <span>${category} (${percentage}%)</span>
        `;
        legendContainer.appendChild(legendItem);
    });
}

function showEmptyState() {
    const containers = ['highlights-container']; // activity-logを削除
    containers.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = `<div class="empty-state">${translations[currentLanguage]['no-data']}</div>`;
        }
    });
    
    // 統計もリセット
    document.getElementById('total-observations').textContent = '0';
    document.getElementById('active-hours').textContent = '0';
    document.getElementById('websites-visited').textContent = '0';
    
    // チャートも更新
    updateActivityChart();
} 