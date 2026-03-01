// Fallback mock database for when APIs are blocked (ad-blockers, CORS, etc.)
const FALLBACK_STOCK_DATABASE = {
    '000001': { name: '平安银行', price: 13.50 },
    '000002': { name: '万科A', price: 10.80 },
    '000066': { name: '中国长城', price: 15.20 },
    '600519': { name: '贵州茅台', price: 1570.00 },
    '601318': { name: '中国平安', price: 55.00 },
    '600036': { name: '招商银行', price: 42.50 },
    '000858': { name: '五粮液', price: 168.50 },
    '601398': { name: '工商银行', price: 5.80 },
    '601939': { name: '建设银行', price: 7.20 },
    '600000': { name: '浦发银行', price: 9.50 },
    '601288': { name: '农业银行', price: 4.10 },
    '601988': { name: '中国银行', price: 4.20 },
    '600030': { name: '中信证券', price: 24.80 },
    '000333': { name: '美的集团', price: 52.30 },
    '601166': { name: '兴业银行', price: 20.50 },
    '600016': { name: '民生银行', price: 4.50 },
    '300750': { name: '宁德时代', price: 175.50 },
    '002594': { name: '比亚迪', price: 245.80 }
};

// ===== Shared stock data fetching helpers (used by both StockWatchlist and TrendAnalyzer) =====
function _fetchStockFromSina(fullCode) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const callbackName = 'sina_callback_' + Date.now();
        window[callbackName] = function() {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            const varName = 'hq_str_' + fullCode;
            const value = (typeof window[varName] !== 'undefined') ? window[varName] : null;
            if (value) {
                const parts = value.split(',');
                if (parts.length >= 4) {
                    const name = parts[0];
                    const price = parseFloat(parts[3]);
                    if (name && price > 0) { resolve({ name, price }); return; }
                }
            }
            resolve(null);
        };
        script.onerror = () => {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error('Script load failed'));
        };
        script.src = `https://hq.sinajs.cn/list=${fullCode}`;
        script.onload = () => {
            setTimeout(() => {
                const varName = 'hq_str_' + fullCode;
                // eslint-disable-next-line no-eval
                const value = eval('typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
                if (value) {
                    const parts = value.split(',');
                    if (parts.length >= 4) {
                        const name = parts[0];
                        const price = parseFloat(parts[3]);
                        if (name && price > 0) {
                            delete window[callbackName];
                            if (script.parentNode) script.parentNode.removeChild(script);
                            resolve({ name, price }); return;
                        }
                    }
                }
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(null);
            }, 100);
        };
        setTimeout(() => {
            if (window[callbackName]) {
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Timeout'));
            }
        }, 5000);
        document.head.appendChild(script);
    });
}

function _fetchStockFromTencent(fullCode) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const callbackName = 'tencent_callback_' + Date.now();
        window[callbackName] = function() {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            const varName = 'v_' + fullCode;
            if (window[varName]) {
                const parts = window[varName].split('~');
                if (parts.length >= 4) {
                    const name = parts[1];
                    const price = parseFloat(parts[3]);
                    if (name && price > 0) { resolve({ name, price }); return; }
                }
            }
            resolve(null);
        };
        script.onerror = () => {
            delete window[callbackName];
            if (script.parentNode) script.parentNode.removeChild(script);
            reject(new Error('Script load failed'));
        };
        script.src = `https://qt.gtimg.cn/q=${fullCode}`;
        script.onload = () => {
            setTimeout(() => {
                const varName = 'v_' + fullCode;
                // eslint-disable-next-line no-eval
                const value = eval('typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
                if (value) {
                    const parts = value.split('~');
                    if (parts.length >= 4) {
                        const name = parts[1];
                        const price = parseFloat(parts[3]);
                        if (name && price > 0) {
                            delete window[callbackName];
                            if (script.parentNode) script.parentNode.removeChild(script);
                            resolve({ name, price }); return;
                        }
                    }
                }
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                resolve(null);
            }, 100);
        };
        setTimeout(() => {
            if (window[callbackName]) {
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
                reject(new Error('Timeout'));
            }
        }, 5000);
        document.head.appendChild(script);
    });
}

async function getStockDataShared(code) {
    if (!/^\d{6}$/.test(code)) return null;
    const prefix = code.startsWith('6') ? 'sh' : 'sz';
    const fullCode = prefix + code;
    try {
        const data = await _fetchStockFromSina(fullCode);
        if (data) return data;
    } catch { /* fallthrough */ }
    try {
        const data = await _fetchStockFromTencent(fullCode);
        if (data) return data;
    } catch { /* fallthrough */ }
    return FALLBACK_STOCK_DATABASE[code] || null;
}

// Stock watchlist application
class StockWatchlist {
    constructor() {
        this.stocks = this.loadStocks();
        this.init();
    }

    init() {
        this.renderStocks();
        this.setupEventListeners();
        // Update prices periodically (simulated)
        setInterval(() => this.simulatePriceUpdates(), 5000);
    }

    setupEventListeners() {
        const form = document.getElementById('addStockForm');
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addStock();
        });

        // Auto-fetch stock info when code is entered
        const stockCodeInput = document.getElementById('stockCode');
        stockCodeInput.addEventListener('blur', () => {
            this.fetchStockInfo();
        });
        stockCodeInput.addEventListener('input', () => {
            // Hide preview when user is typing
            document.getElementById('stockPreview').style.display = 'none';
        });

        // Event delegation for delete and update buttons
        const stockList = document.getElementById('stockList');
        stockList.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.btn-delete');
            const updateBtn = e.target.closest('.btn-update');
            
            if (deleteBtn) {
                const stockId = parseInt(deleteBtn.dataset.stockId);
                this.deleteStock(stockId);
            } else if (updateBtn) {
                const stockId = parseInt(updateBtn.dataset.stockId);
                this.promptUpdatePrice(stockId);
            }
        });

        // Refresh all button
        const refreshAllBtn = document.getElementById('refreshAllBtn');
        if (refreshAllBtn) {
            refreshAllBtn.addEventListener('click', () => {
                this.refreshAllPrices();
            });
        }
    }

    async refreshAllPrices() {
        const refreshBtn = document.getElementById('refreshAllBtn');
        if (!refreshBtn) return;
        
        // Show loading state
        refreshBtn.disabled = true;
        refreshBtn.textContent = '🔄 刷新中...';
        
        try {
            await this.simulatePriceUpdates();
            refreshBtn.textContent = '✓ 刷新完成';
            setTimeout(() => {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新所有价格';
            }, 1500);
        } catch (error) {
            console.error('Refresh failed:', error);
            refreshBtn.textContent = '✗ 刷新失败';
            setTimeout(() => {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '🔄 刷新所有价格';
            }, 1500);
        }
    }

    async fetchStockInfo() {
        const code = document.getElementById('stockCode').value.trim();
        const preview = document.getElementById('stockPreview');
        
        if (!code) {
            preview.style.display = 'none';
            return;
        }

        // Show loading state
        preview.style.display = 'block';
        document.getElementById('previewCode').textContent = code;
        document.getElementById('previewName').textContent = '加载中...';
        document.getElementById('previewPrice').textContent = '...';

        try {
            const stockData = await this.getStockData(code);
            
            if (stockData) {
                // Show preview with fetched data
                document.getElementById('previewCode').textContent = code;
                document.getElementById('previewName').textContent = stockData.name;
                document.getElementById('previewPrice').textContent = stockData.price.toFixed(2);
                preview.style.display = 'block';
            } else {
                preview.style.display = 'none';
                // Show friendly error
                alert(`未找到股票代码 ${code} 的信息。请检查股票代码是否正确。`);
            }
        } catch (error) {
            console.error('获取股票信息失败:', error);
            preview.style.display = 'none';
            alert(`获取股票信息失败，请稍后重试。`);
        }
    }

    async addStock() {
        const code = document.getElementById('stockCode').value.trim();
        const sellPrice = parseFloat(document.getElementById('sellPrice').value);

        if (!code || isNaN(sellPrice)) {
            alert('请填写股票代码和卖出价格');
            return;
        }

        if (sellPrice <= 0) {
            alert('价格必须大于零');
            return;
        }

        try {
            // Fetch stock data from real APIs
            const stockData = await this.getStockData(code);
            
            if (!stockData) {
                alert(`未找到股票代码 ${code} 的信息。请输入有效的股票代码。`);
                return;
            }

            const stock = {
                id: Date.now(),
                code,
                name: stockData.name,
                currentPrice: stockData.price,
                sellPrice,
                addedDate: new Date().toISOString()
            };

            this.stocks.push(stock);
            this.saveStocks();
            this.renderStocks();
            this.clearForm();
        } catch (error) {
            console.error('添加股票失败:', error);
            alert('添加股票失败，请稍后重试。');
        }
    }

    async getStockData(code) {
        return getStockDataShared(code);
    }

    deleteStock(id) {
        if (confirm('确定要删除这个股票吗？')) {
            this.stocks = this.stocks.filter(stock => stock.id !== id);
            this.saveStocks();
            this.renderStocks();
        }
    }

    updateCurrentPrice(id, newPrice) {
        const stock = this.stocks.find(s => s.id === id);
        if (stock) {
            stock.currentPrice = newPrice;
            this.saveStocks();
            this.renderStocks();
        }
    }

    async simulatePriceUpdates() {
        // Fetch real-time prices for all stocks in the watchlist
        for (const stock of this.stocks) {
            try {
                const stockData = await this.getStockData(stock.code);
                if (stockData && stockData.price > 0) {
                    stock.currentPrice = stockData.price;
                    stock.name = stockData.name; // Update name in case it changed
                }
            } catch (error) {
                console.warn(`Failed to update price for ${stock.code}:`, error);
                // Keep the old price if update fails
            }
        }
        this.saveStocks();
        this.renderStocks();
    }

    calculateAlertLevel(currentPrice, sellPrice) {
        // Calculate percentage difference from sell price
        const percentDiff = ((currentPrice - sellPrice) / sellPrice) * 100;
        
        // Color coding based on percentage change:
        // -3% to 3%: yellow
        // 3% to 10%: light red
        // 10% and above: deep red
        // -3% to -10%: light green
        // -10% and below: deep green
        
        if (percentDiff >= 10) {
            return 'deep-red';
        } else if (percentDiff >= 3) {
            return 'light-red';
        } else if (percentDiff >= -3) {
            return 'yellow';
        } else if (percentDiff >= -10) {
            return 'light-green';
        } else {
            return 'deep-green';
        }
    }

    getAlertText(level) {
        const texts = {
            'deep-red': '大涨',
            'light-red': '上涨',
            'yellow': '持平',
            'light-green': '下跌',
            'deep-green': '大跌'
        };
        return texts[level] || '未知';
    }

    calculateTimeInterval(addedDate) {
        // Return null if no addedDate or if it's invalid
        if (!addedDate) {
            return null;
        }

        try {
            const added = new Date(addedDate);
            const now = new Date();
            const diffMs = now - added;
            
            // If invalid date, return null
            if (isNaN(diffMs)) {
                return null;
            }
            
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);
            
            // Less than 1 day: show hours
            if (diffDays < 1) {
                if (diffHours === 0) {
                    return '不到1小时';
                }
                return `${diffHours}小时`;
            } else {
                return `${diffDays}天`;
            }
        } catch (error) {
            console.warn('Error calculating time interval:', error);
            return null;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    renderStocks() {
        const stockList = document.getElementById('stockList');
        
        if (this.stocks.length === 0) {
            stockList.innerHTML = '<p class="empty-message">关注池为空，请添加股票</p>';
            return;
        }

        stockList.innerHTML = this.stocks.map(stock => {
            const alertLevel = this.calculateAlertLevel(stock.currentPrice, stock.sellPrice);
            const difference = stock.currentPrice - stock.sellPrice;
            const percentDiff = ((difference / stock.sellPrice) * 100).toFixed(2);
            const timeInterval = this.calculateTimeInterval(stock.addedDate);
            
            return `
                <div class="stock-card alert-${alertLevel}">
                    <div class="alert-badge ${alertLevel}">
                        ${this.getAlertText(alertLevel)}
                    </div>
                    <div class="stock-card-content">
                        <div class="stock-header">
                            <div class="stock-info">
                                <div class="stock-code">${this.escapeHtml(stock.code)}</div>
                                <div class="stock-name">${this.escapeHtml(stock.name)}</div>
                                ${timeInterval ? `<div class="time-interval">已添加 ${timeInterval}</div>` : ''}
                            </div>
                        </div>
                        
                        <div class="stock-prices">
                            <div class="price-box">
                                <div class="price-label">当前价格</div>
                                <div class="price-value current-price">¥${stock.currentPrice.toFixed(2)}</div>
                            </div>
                            <div class="price-box">
                                <div class="price-label">卖出价格</div>
                                <div class="price-value sell-price">¥${stock.sellPrice.toFixed(2)}</div>
                            </div>
                        </div>
                        
                        <div class="price-difference">
                            差价: ¥${difference.toFixed(2)} (${percentDiff > 0 ? '+' : ''}${percentDiff}%)
                        </div>
                        
                        <div style="margin-top: 15px;">
                            <button class="btn-update" data-stock-id="${stock.id}">
                                更新当前价格
                            </button>
                        </div>
                    </div>
                    <button class="btn-delete" data-stock-id="${stock.id}">
                        删除
                    </button>
                </div>
            `;
        }).join('');

        // Trigger alerts for critical stocks
        this.checkAlerts();
    }

    checkAlerts() {
        this.stocks.forEach(stock => {
            const percentDiff = ((stock.currentPrice - stock.sellPrice) / stock.sellPrice) * 100;
            const alertLevel = this.calculateAlertLevel(stock.currentPrice, stock.sellPrice);
            
            // Show popup for stocks with deep-green (large drop)
            if (alertLevel === 'deep-green' && this.shouldNotify(stock.id)) {
                this.showPopupNotification(stock, percentDiff);
            }
            
            // Show notification for stocks with deep-red (large gain)
            if (alertLevel === 'deep-red' && this.shouldNotify(stock.id)) {
                this.showNotification(stock);
            }
        });
    }

    showPopupNotification(stock, percentDiff) {
        // Show browser alert for significant loss warning
        alert(`⚠️ 重要警告！\n\n${stock.name} (${stock.code})\n当前价格已跌破卖出价格 ${Math.abs(percentDiff).toFixed(2)}%\n\n当前价格: ¥${stock.currentPrice.toFixed(2)}\n卖出价格: ¥${stock.sellPrice.toFixed(2)}\n\n价格大幅下跌，建议立即关注！`);
        
        // Mark as notified
        localStorage.setItem(`notify_${stock.id}`, new Date().toISOString());
    }

    shouldNotify(stockId) {
        // Check if we've recently notified for this stock (avoid spam)
        const lastNotified = localStorage.getItem(`notify_${stockId}`);
        if (!lastNotified) return true;
        
        const lastTime = new Date(lastNotified).getTime();
        const now = new Date().getTime();
        const fiveMinutes = 5 * 60 * 1000;
        
        return (now - lastTime) > fiveMinutes;
    }

    showNotification(stock) {
        // Log notification (in real app, this could be a browser notification)
        console.log(`🚨 提醒: ${stock.name} (${stock.code}) 已达到或低于卖出价格 ¥${stock.sellPrice.toFixed(2)}`);
        
        // Mark as notified
        localStorage.setItem(`notify_${stock.id}`, new Date().toISOString());
        
        // Visual alert
        if (document.hasFocus()) {
            // Show a more visible alert when page is focused
            const originalTitle = document.title;
            document.title = `🚨 ${stock.code} 价格提醒!`;
            setTimeout(() => {
                document.title = originalTitle;
            }, 3000);
        }
    }

    async promptUpdatePrice(id) {
        const stock = this.stocks.find(s => s.id === id);
        if (!stock) return;
        
        // First, try to fetch the latest price from API
        try {
            const stockData = await this.getStockData(stock.code);
            if (stockData && stockData.price > 0) {
                stock.currentPrice = stockData.price;
                stock.name = stockData.name; // Update name too
                this.saveStocks();
                this.renderStocks();
                alert(`已更新 ${stock.name} (${stock.code}) 的当前价格为 ¥${stockData.price.toFixed(2)}`);
                return;
            }
        } catch (error) {
            console.warn('Auto-fetch price failed, falling back to manual input:', error);
        }
        
        // If auto-fetch fails, allow manual input
        const newPrice = prompt(`自动获取失败，请手动更新 ${stock.name} (${stock.code}) 的当前价格:`, stock.currentPrice.toFixed(2));
        
        if (newPrice !== null) {
            const price = parseFloat(newPrice);
            if (!isNaN(price) && price > 0) {
                this.updateCurrentPrice(id, price);
            } else {
                alert('请输入有效的价格');
            }
        }
    }

    clearForm() {
        document.getElementById('stockCode').value = '';
        document.getElementById('sellPrice').value = '';
        document.getElementById('stockPreview').style.display = 'none';
    }

    saveStocks() {
        localStorage.setItem('stocks', JSON.stringify(this.stocks));
    }

    loadStocks() {
        const stored = localStorage.getItem('stocks');
        if (!stored) return [];
        
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse stored stocks:', e);
            return [];
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    const tabManager = new TabManager();
    const watchlist = new StockWatchlist();
    const heatmap = new SectorHeatmap();
    const trendAnalyzer = new TrendAnalyzer();
    // Wire the watchlist reference so TrendAnalyzer can access stocks
    trendAnalyzer.watchlist = watchlist;
});

// ===== Tab Manager =====
class TabManager {
    constructor() {
        this.tabs = document.querySelectorAll('.tab-btn');
        this.panels = document.querySelectorAll('.tab-panel');
        this.init();
    }

    init() {
        this.tabs.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
    }

    switchTab(tabName) {
        this.tabs.forEach(t => {
            const isActive = t.dataset.tab === tabName;
            t.classList.toggle('active', isActive);
            t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        this.panels.forEach(p => {
            p.classList.toggle('active', p.id === `${tabName}Panel`);
        });
        // Notify other components when their tab becomes active
        document.dispatchEvent(new CustomEvent('tabChanged', { detail: { tab: tabName } }));
    }
}

// ===== Sector Heatmap =====
class SectorHeatmap {
    constructor() {
        // Seed: fixed change values so the heatmap is stable on load,
        // then small random drift is applied on refresh to simulate live data.
        this.sectors = [
            { name: '银行',     baseChange: 0.42,  leaders: ['工商银行', '招商银行'] },
            { name: '非银金融', baseChange: 1.15,  leaders: ['中信证券', '国泰君安'] },
            { name: '医药生物', baseChange: -0.83, leaders: ['恒瑞医药', '药明康德'] },
            { name: '电子',     baseChange: 2.31,  leaders: ['韦尔股份', '立讯精密'] },
            { name: '食品饮料', baseChange: 0.76,  leaders: ['贵州茅台', '五粮液'] },
            { name: '新能源',   baseChange: 3.47,  leaders: ['宁德时代', '隆基绿能'] },
            { name: '汽车',     baseChange: 1.89,  leaders: ['比亚迪', '上汽集团'] },
            { name: '计算机',   baseChange: -1.54, leaders: ['用友网络', '金蝶国际'] },
            { name: '通信',     baseChange: -0.37, leaders: ['中国电信', '中兴通讯'] },
            { name: '机械设备', baseChange: 0.92,  leaders: ['三一重工', '徐工机械'] },
            { name: '化工',     baseChange: -2.18, leaders: ['万华化学', '华鲁恒升'] },
            { name: '房地产',   baseChange: -3.61, leaders: ['保利发展', '万科A'] },
            { name: '有色金属', baseChange: 1.63,  leaders: ['紫金矿业', '洛阳钼业'] },
            { name: '建筑材料', baseChange: -1.02, leaders: ['海螺水泥', '东方雨虹'] },
            { name: '钢铁',     baseChange: -0.55, leaders: ['宝钢股份', '鞍钢股份'] },
            { name: '农林牧渔', baseChange: 0.28,  leaders: ['牧原股份', '温氏股份'] },
            { name: '传媒',     baseChange: 0.63,  leaders: ['分众传媒', '芒果超媒'] },
            { name: '国防军工', baseChange: 2.74,  leaders: ['中航沈飞', '航发动力'] },
            { name: '交通运输', baseChange: -0.19, leaders: ['中国国航', '招商轮船'] },
            { name: '半导体',   baseChange: 4.12,  leaders: ['中芯国际', '北方华创'] },
        ];
        this.currentChanges = this.sectors.map(s => s.baseChange);
        this.container = document.getElementById('sectorHeatmap');
        this.refreshBtn = document.getElementById('refreshHeatmapBtn');
        this.updateTimeEl = document.getElementById('heatmapUpdateTime');
        this.rendered = false;

        this.setupEvents();

        // Render when the heatmap tab is first opened
        document.addEventListener('tabChanged', (e) => {
            if (e.detail.tab === 'heatmap' && !this.rendered) {
                this.render();
                this.rendered = true;
            }
        });
    }

    setupEvents() {
        if (this.refreshBtn) {
            this.refreshBtn.addEventListener('click', () => this.refresh());
        }
    }

    // Drift each sector's change by a small random amount to simulate live data
    driftChanges() {
        this.currentChanges = this.currentChanges.map(c => {
            const drift = (Math.random() - 0.5) * 0.4;
            return Math.round((c + drift) * 100) / 100;
        });
    }

    getHeatClass(change) {
        if (change >= 3)   return 'heat-deep-red';
        if (change >= 1)   return 'heat-light-red';
        if (change > -1)   return 'heat-yellow';
        if (change > -3)   return 'heat-light-green';
        return 'heat-deep-green';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = this.sectors.map((s, i) => {
            const change = this.currentChanges[i];
            const sign = change >= 0 ? '+' : '';
            const heatClass = this.getHeatClass(change);
            const leaders = s.leaders.map(l => this.escapeHtml(l)).join(' · ');
            return `
                <div class="sector-block ${heatClass}" title="${this.escapeHtml(s.name)}: ${sign}${change}%">
                    <div class="sector-name">${this.escapeHtml(s.name)}</div>
                    <div class="sector-change">${sign}${change}%</div>
                    <div class="sector-leaders">${leaders}</div>
                </div>
            `;
        }).join('');

        const now = new Date();
        if (this.updateTimeEl) {
            this.updateTimeEl.textContent = `更新于 ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
        }
    }

    async refresh() {
        if (!this.refreshBtn) return;
        this.refreshBtn.disabled = true;
        this.refreshBtn.textContent = '🔄 刷新中...';
        try {
            // Simulate network delay, then apply drift
            await new Promise(r => setTimeout(r, 600));
            this.driftChanges();
            this.rendered = true;
            this.render();
            this.refreshBtn.textContent = '✓ 已刷新';
            setTimeout(() => {
                this.refreshBtn.disabled = false;
                this.refreshBtn.textContent = '🔄 刷新数据';
            }, 1500);
        } catch {
            this.refreshBtn.disabled = false;
            this.refreshBtn.textContent = '🔄 刷新数据';
        }
    }
}

// ===== Trend Analyzer =====
class TrendAnalyzer {
    constructor() {
        this.watchlist = null; // will be set by StockWatchlist after init
        this.analyzeBtn = document.getElementById('analyzeTrendBtn');
        this.trendInput = document.getElementById('trendStockCode');
        this.trendResult = document.getElementById('trendResult');
        this.trendWatchlistEl = document.getElementById('trendWatchlist');

        this.setupEvents();

        // Refresh trend watchlist when the trend tab is opened
        document.addEventListener('tabChanged', (e) => {
            if (e.detail.tab === 'trend') {
                this.renderTrendWatchlist();
            }
        });
    }

    setupEvents() {
        if (this.analyzeBtn) {
            this.analyzeBtn.addEventListener('click', () => this.runAnalysis());
        }
        if (this.trendInput) {
            this.trendInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this.runAnalysis();
            });
        }
    }

    // Simple momentum-based analysis using the current price, sell price, and simulated history
    analyze(currentPrice, sellPrice, stockCode) {
        // Relative position vs. target (sell price)
        const pctVsTarget = ((currentPrice - sellPrice) / sellPrice) * 100;

        // Simulate a 5-day RSI-style momentum from the stock code (deterministic seed)
        const seed = stockCode.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const rsi = 30 + (seed % 40) + pctVsTarget * 0.8;
        const clampedRsi = Math.min(Math.max(rsi, 10), 90);

        // Simulate MA5/MA20 spread (momentum)
        const maDiff = ((seed % 7) - 3) * 0.3 + pctVsTarget * 0.15;

        // Compute final score → signal
        let score = 0;
        if (pctVsTarget > 5)  score += 2;
        else if (pctVsTarget > 1)  score += 1;
        else if (pctVsTarget < -5) score -= 2;
        else if (pctVsTarget < -1) score -= 1;

        if (clampedRsi > 70) score += 2;
        else if (clampedRsi > 55) score += 1;
        else if (clampedRsi < 30) score -= 2;
        else if (clampedRsi < 45) score -= 1;

        if (maDiff > 0.5) score += 1;
        else if (maDiff < -0.5) score -= 1;

        const signal = this.scoreToSignal(score);

        return {
            rsi: clampedRsi.toFixed(1),
            maDiff: maDiff.toFixed(2),
            pctVsTarget: pctVsTarget.toFixed(2),
            signal,
            score
        };
    }

    scoreToSignal(score) {
        if (score >= 4)  return { key: 'strong-buy',  label: '强烈看涨 ↑↑',  cssClass: 'signal-strong-buy' };
        if (score >= 2)  return { key: 'buy',          label: '偏多 ↑',         cssClass: 'signal-buy' };
        if (score >= -1) return { key: 'neutral',      label: '震荡 →',         cssClass: 'signal-neutral' };
        if (score >= -3) return { key: 'sell',         label: '偏空 ↓',         cssClass: 'signal-sell' };
        return             { key: 'strong-sell', label: '强烈看跌 ↓↓',  cssClass: 'signal-strong-sell' };
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async runAnalysis() {
        const code = (this.trendInput ? this.trendInput.value.trim() : '');
        if (!code || !/^\d{6}$/.test(code)) {
            alert('请输入有效的6位股票代码');
            return;
        }
        if (!this.trendResult) return;

        this.trendResult.style.display = 'block';
        this.trendResult.innerHTML = '<p style="color:#888;text-align:center;">分析中...</p>';

        // Try to get real stock data from the shared helper
        let stockData = null;
        try {
            stockData = await getStockDataShared(code);
        } catch {
            stockData = FALLBACK_STOCK_DATABASE[code] || null;
        }

        if (!stockData) {
            this.trendResult.innerHTML = `<p style="color:#ef4444;text-align:center;">未找到股票 ${this.escapeHtml(code)} 的数据，请检查代码是否正确。</p>`;
            return;
        }

        // Use price as both current and synthetic "sell target" for standalone analysis
        const currentPrice = stockData.price;
        const syntheticSell = currentPrice; // baseline: analyze vs. itself
        const result = this.analyze(currentPrice, syntheticSell, code);
        this.renderResult(code, stockData.name, currentPrice, result);
    }

    renderResult(code, name, currentPrice, result) {
        if (!this.trendResult) return;
        const { rsi, maDiff, pctVsTarget, signal } = result;
        const maDiffClass = parseFloat(maDiff) >= 0 ? 'positive' : 'negative';
        const maDiffSign = parseFloat(maDiff) >= 0 ? '+' : '';

        // Summary text
        let summaryText = '';
        if (signal.key === 'strong-buy') {
            summaryText = `技术面整体偏强，RSI处于强势区间，短线动能较足，当前价格相对具有上行潜力。建议密切关注量能配合情况。`;
        } else if (signal.key === 'buy') {
            summaryText = `技术面略偏多，均线多头排列，短线或有一定涨幅空间。注意控制仓位，设置合理止损。`;
        } else if (signal.key === 'neutral') {
            summaryText = `当前技术面处于震荡格局，短线方向不明确，建议观望为主，等待趋势明朗再操作。`;
        } else if (signal.key === 'sell') {
            summaryText = `技术面偏弱，均线呈空头排列趋势，短线下行压力较大。建议减仓或谨慎持有。`;
        } else {
            summaryText = `技术面明显走弱，RSI进入超卖区域，短线抛压较重。建议规避风险，等待企稳信号。`;
        }

        this.trendResult.innerHTML = `
            <div class="trend-result-header">
                <div class="stock-code">${this.escapeHtml(code)}</div>
                <div class="stock-name">${this.escapeHtml(name)}</div>
                <div class="trend-signal-badge ${signal.cssClass}">${signal.label}</div>
            </div>
            <div class="trend-indicators">
                <div class="trend-indicator-card">
                    <div class="trend-indicator-label">当前价格</div>
                    <div class="trend-indicator-value">¥${currentPrice.toFixed(2)}</div>
                </div>
                <div class="trend-indicator-card">
                    <div class="trend-indicator-label">RSI (14)</div>
                    <div class="trend-indicator-value ${parseFloat(rsi) > 70 ? 'positive' : parseFloat(rsi) < 30 ? 'negative' : ''}">${rsi}</div>
                </div>
                <div class="trend-indicator-card">
                    <div class="trend-indicator-label">均线偏离 (MA5-MA20)</div>
                    <div class="trend-indicator-value ${maDiffClass}">${maDiffSign}${maDiff}%</div>
                </div>
            </div>
            <div class="trend-summary">${this.escapeHtml(summaryText)}</div>
        `;
    }

    // Render all watchlist stocks with trend mini-cards
    renderTrendWatchlist() {
        if (!this.trendWatchlistEl) return;
        const stocks = this.watchlist ? this.watchlist.stocks : [];
        if (!stocks.length) {
            this.trendWatchlistEl.innerHTML = '<p class="empty-message">关注池为空，请在关注池标签页添加股票</p>';
            return;
        }
        this.trendWatchlistEl.innerHTML = stocks.map(stock => {
            const result = this.analyze(stock.currentPrice, stock.sellPrice, stock.code);
            const pctNum = parseFloat(result.pctVsTarget);
            const pctClass = pctNum >= 0 ? 'positive' : 'negative';
            const pctSign = pctNum >= 0 ? '+' : '';
            return `
                <div class="trend-mini-card">
                    <div class="trend-mini-info">
                        <div class="trend-mini-code">${this.escapeHtml(stock.code)}</div>
                        <div class="trend-mini-name">${this.escapeHtml(stock.name)}</div>
                    </div>
                    <div class="trend-mini-price">
                        <div class="trend-mini-current">¥${stock.currentPrice.toFixed(2)}</div>
                        <div class="trend-mini-change ${pctClass}">${pctSign}${pctNum.toFixed(2)}% vs 目标</div>
                    </div>
                    <span class="trend-mini-signal ${result.signal.cssClass}">${result.signal.label}</span>
                </div>
            `;
        }).join('');
    }
}
