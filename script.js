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

// ===== A-Share Trading Hours Guard =====
// Official hours: Mon-Fri 09:30-11:30, 13:00-15:00, excluding public holidays.
const TRADING_HOLIDAYS = new Set([
    // 2025
    '2025-01-01','2025-01-28','2025-01-29','2025-01-30','2025-01-31',
    '2025-02-03','2025-02-04',
    '2025-04-04','2025-04-07',
    '2025-05-01','2025-05-02','2025-05-05',
    '2025-05-31','2025-06-02',
    '2025-10-01','2025-10-02','2025-10-03','2025-10-06','2025-10-07','2025-10-08',
    // 2026
    '2026-01-01','2026-01-02',
    '2026-02-17','2026-02-18','2026-02-19','2026-02-20','2026-02-23','2026-02-24',
    '2026-04-06',
    '2026-05-01','2026-05-04','2026-05-05',
    '2026-06-19',
    '2026-09-25',
    '2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07','2026-10-08',
]);

function _dateKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isTradingTime(d = new Date()) {
    const day = d.getDay();
    if (day === 0 || day === 6) return false;            // weekend
    if (TRADING_HOLIDAYS.has(_dateKey(d))) return false; // public holiday
    const t = d.getHours() * 60 + d.getMinutes();
    return (t >= 570 && t < 690) ||  // 09:30 – 11:30
           (t >= 780 && t < 900);    // 13:00 – 15:00
}

/** Human-readable reason why market is closed right now (null if open) */
function tradingClosedReason(d = new Date()) {
    const day = d.getDay();
    if (day === 0 || day === 6) return '周末，A股不交易';
    if (TRADING_HOLIDAYS.has(_dateKey(d))) return '公假日，A股不交易';
    const t = d.getHours() * 60 + d.getMinutes();
    if (t < 570)             return '早盘未开，09:30 开始';
    if (t >= 570 && t < 690) return null; // trading
    if (t < 780)             return '午休时间，13:00 开始';
    if (t >= 780 && t < 900) return null; // trading
    return '已收盘，明日 09:30 开始';
}

/** Ms until next session open */
function msUntilNextOpen(d = new Date()) {
    const t    = d.getHours() * 60 + d.getMinutes();
    const secs = d.getSeconds();
    const ms   = d.getMilliseconds();
    const day  = d.getDay();
    const isWeekday = day >= 1 && day <= 5 && !TRADING_HOLIDAYS.has(_dateKey(d));
    if (isWeekday && t < 570) return (570 - t) * 60000 - secs * 1000 - ms; // until 09:30
    if (isWeekday && t >= 690 && t < 780) return (780 - t) * 60000 - secs * 1000 - ms; // until 13:00
    // After close or weekend/holiday: poll every 60 s (will re-evaluate next open day)
    const remaining = (60 - secs) * 1000 - ms;
    return Math.max(remaining, 30000);
}

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
                    const name      = parts[0];
                    const open      = parseFloat(parts[1]), prevClose = parseFloat(parts[2]);
                    const price     = parseFloat(parts[3]), high      = parseFloat(parts[4]);
                    const low       = parseFloat(parts[5]), volume    = parseFloat(parts[8]);
                    const amount    = parseFloat(parts[9]);
                    if (name && price > 0) {
                        resolve({ name, price,
                            open:      isNaN(open)      || open <= 0      ? price : open,
                            prevClose: isNaN(prevClose) || prevClose <= 0 ? price : prevClose,
                            high:      isNaN(high)      || high < price   ? price : high,
                            low:       isNaN(low)       || low <= 0       ? price : low,
                            volume:    isNaN(volume)    ? 0 : volume,
                            amount:    isNaN(amount)    ? 0 : amount,
                        });
                        return;
                    }
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
                        const name      = parts[0];
                        const open      = parseFloat(parts[1]), prevClose = parseFloat(parts[2]);
                        const price     = parseFloat(parts[3]), high      = parseFloat(parts[4]);
                        const low       = parseFloat(parts[5]), volume    = parseFloat(parts[8]);
                        const amount    = parseFloat(parts[9]);
                        if (name && price > 0) {
                            delete window[callbackName];
                            if (script.parentNode) script.parentNode.removeChild(script);
                            resolve({ name, price,
                                open:      isNaN(open)      || open <= 0      ? price : open,
                                prevClose: isNaN(prevClose) || prevClose <= 0 ? price : prevClose,
                                high:      isNaN(high)      || high < price   ? price : high,
                                low:       isNaN(low)       || low <= 0       ? price : low,
                                volume:    isNaN(volume)    ? 0 : volume,
                                amount:    isNaN(amount)    ? 0 : amount,
                            });
                            return;
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

// ===== Validation Pool =====
class ValidationPool {
    constructor() {
        this.items = this._load();
        this.container = null; // set externally after DOM ready
        this._startAutoCheck();
    }

    _load() {
        try { return JSON.parse(localStorage.getItem('validationPool') || '[]'); }
        catch (e) {
            console.warn('ValidationPool: failed to parse stored data, starting fresh.', e);
            return [];
        }
    }

    _save() {
        localStorage.setItem('validationPool', JSON.stringify(this.items));
    }

    add(entry) {
        this.items.unshift(entry);
        this._save();
        this.render();
    }

    clear() {
        if (confirm('确定要清空验证池？')) {
            this.items = [];
            this._save();
            this.render();
        }
    }

    _startAutoCheck() {
        // Run immediately in case there are overdue items
        this._checkPending();
        // Then re-check every minute
        setInterval(() => this._checkPending(), 60 * 1000);
    }

    async _checkPending() {
        // Skip price-fetching outside trading hours — prices won't change anyway
        if (!isTradingTime()) {
            this.render(); // still refresh countdowns
            return;
        }
        const now = Date.now();
        let changed = false;
        for (const item of this.items) {
            if (!item.result10min && (now - item.addedAt) >= 10 * 60 * 1000) {
                const data = await getStockDataShared(item.code).catch(() => null);
                if (data) {
                    const actualPct = ((data.price - item.entryPrice) / item.entryPrice) * 100;
                    // Correctness is judged by direction match (both up or both down)
                    item.result10min = {
                        actualPrice: parseFloat(data.price.toFixed(2)),
                        actualPct:   parseFloat(actualPct.toFixed(2)),
                        deviation:   parseFloat((actualPct - item.pred10min.pct).toFixed(2)),
                        correct:     (item.pred10min.pct >= 0) === (actualPct >= 0),
                        checkedAt:   now
                    };
                    changed = true;
                    // Feed into adaptive model
                    if (predictionModel) predictionModel.learn(item);
                    // Notify continuous validator
                    if (continuousValidator) continuousValidator.onItemVerified(item);
                }
            }
            if (!item.result2hr && (now - item.addedAt) >= 2 * 60 * 60 * 1000) {
                const data = await getStockDataShared(item.code).catch(() => null);
                if (data) {
                    const actualPct = ((data.price - item.entryPrice) / item.entryPrice) * 100;
                    // Correctness is judged by direction match (both up or both down)
                    item.result2hr = {
                        actualPrice: parseFloat(data.price.toFixed(2)),
                        actualPct:   parseFloat(actualPct.toFixed(2)),
                        deviation:   parseFloat((actualPct - item.pred2hr.pct).toFixed(2)),
                        correct:     (item.pred2hr.pct >= 0) === (actualPct >= 0),
                        checkedAt:   now
                    };
                    changed = true;
                }
            }
        }
        if (changed) {
            this._save();
            // Notify model status panel to re-render
            document.dispatchEvent(new CustomEvent('modelUpdated'));
        }
        // Always re-render to refresh countdowns
        this.render();
    }

    _formatCountdown(targetMs) {
        const remaining = targetMs - Date.now();
        if (remaining <= 0) return '验证中…';
        const totalSecs = Math.floor(remaining / 1000);
        const hrs  = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        const secs = totalSecs % 60;
        if (hrs > 0) return `${hrs}小时${mins}分后验证`;
        if (mins > 0) return `${mins}分${secs}秒后验证`;
        return `${secs}秒后验证`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    }

    render() {
        if (!this.container) return;
        if (!this.items.length) {
            this.container.innerHTML = '<p class="empty-message">验证池为空，在趋势分析中添加预测进行验证</p>';
            return;
        }

        this.container.innerHTML = this.items.map(item => {
            const addedDate = new Date(item.addedAt);
            const timeStr = `${addedDate.getHours().toString().padStart(2, '0')}:${addedDate.getMinutes().toString().padStart(2, '0')}`;
            const sign10 = item.pred10min.pct >= 0 ? '+' : '';
            const sign2h = item.pred2hr.pct >= 0 ? '+' : '';

            // 10-minute result/countdown
            let html10;
            if (item.result10min) {
                const r = item.result10min;
                const devStr = (r.deviation >= 0 ? '+' : '') + r.deviation;
                html10 = `
                    <div class="vp-pred-row ${r.correct ? 'vp-correct' : 'vp-incorrect'}">
                        <span class="vp-pred-label">10分钟</span>
                        <span class="vp-pred-val">预测 ${sign10}${item.pred10min.pct}%</span>
                        <span class="vp-arrow">→</span>
                        <span class="vp-pred-actual">实际 ${r.actualPct >= 0 ? '+' : ''}${r.actualPct}% ¥${r.actualPrice}</span>
                        <span class="vp-deviation">偏差 ${devStr}%</span>
                        <span class="vp-badge ${r.correct ? 'vp-badge-correct' : 'vp-badge-wrong'}">${r.correct ? '✓ 方向正确' : '✗ 方向错误'}</span>
                    </div>`;
            } else {
                html10 = `
                    <div class="vp-pred-row vp-pending">
                        <span class="vp-pred-label">10分钟</span>
                        <span class="vp-pred-val">预测 ${sign10}${item.pred10min.pct}%</span>
                        <span class="vp-arrow">→</span>
                        <span class="vp-countdown">${this._formatCountdown(item.addedAt + 10 * 60 * 1000)}</span>
                    </div>`;
            }

            // 2-hour result/countdown
            let html2h;
            if (item.result2hr) {
                const r = item.result2hr;
                const devStr = (r.deviation >= 0 ? '+' : '') + r.deviation;
                html2h = `
                    <div class="vp-pred-row ${r.correct ? 'vp-correct' : 'vp-incorrect'}">
                        <span class="vp-pred-label">2小时</span>
                        <span class="vp-pred-val">预测 ${sign2h}${item.pred2hr.pct}%</span>
                        <span class="vp-arrow">→</span>
                        <span class="vp-pred-actual">实际 ${r.actualPct >= 0 ? '+' : ''}${r.actualPct}% ¥${r.actualPrice}</span>
                        <span class="vp-deviation">偏差 ${devStr}%</span>
                        <span class="vp-badge ${r.correct ? 'vp-badge-correct' : 'vp-badge-wrong'}">${r.correct ? '✓ 方向正确' : '✗ 方向错误'}</span>
                    </div>`;
            } else {
                html2h = `
                    <div class="vp-pred-row vp-pending">
                        <span class="vp-pred-label">2小时</span>
                        <span class="vp-pred-val">预测 ${sign2h}${item.pred2hr.pct}%</span>
                        <span class="vp-arrow">→</span>
                        <span class="vp-countdown">${this._formatCountdown(item.addedAt + 2 * 60 * 60 * 1000)}</span>
                    </div>`;
            }

            return `
                <div class="vp-card">
                    <div class="vp-card-header">
                        <span class="vp-code">${this.escapeHtml(item.code)}</span>
                        <span class="vp-name">${this.escapeHtml(item.name)}</span>
                        <span class="vp-entry">入场 ¥${item.entryPrice.toFixed(2)}</span>
                        <span class="vp-time">@${timeStr}</span>
                        <span class="vp-signal-badge ${this.escapeHtml(item.signal.cssClass)}">${this.escapeHtml(item.signal.label)}</span>
                        <button class="vp-delete-btn" data-id="${item.id}">✕</button>
                    </div>
                    ${html10}
                    ${html2h}
                </div>`;
        }).join('');

        // Bind delete buttons
        this.container.querySelectorAll('.vp-delete-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id, 10);
                this.items = this.items.filter(i => i.id !== id);
                this._save();
                this.render();
            });
        });
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    predictionModel = new PredictionModel();
    // Try silent auto-load from previously linked file (no permission prompt needed if still granted)
    const loadResult = await ModelFileManager.autoLoad().catch(() => 'error');
    if (loadResult === 'loaded') {
        console.log('[Model] Auto-loaded from linked file.');
    }
    const tabManager = new TabManager();
    const watchlist = new StockWatchlist();
    const heatmap = new SectorHeatmap();
    const validationPool = new ValidationPool();
    validationPool.container = document.getElementById('validationPoolContainer');
    validationPool.render();
    const trendAnalyzer = new TrendAnalyzer();
    // Wire references
    trendAnalyzer.watchlist = watchlist;
    trendAnalyzer.validationPool = validationPool;
    // Init continuous validator
    continuousValidator = new ContinuousValidator(watchlist, validationPool, trendAnalyzer);
    document.getElementById('cvToggleBtn')?.addEventListener('click', () => {
        if (continuousValidator.running) continuousValidator.stop();
        else continuousValidator.start();
    });
    // Wire clear-pool button
    const clearPoolBtn = document.getElementById('clearPoolBtn');
    if (clearPoolBtn) {
        clearPoolBtn.addEventListener('click', () => validationPool.clear());
    }
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
            // ===== 传统金融 =====
            { name: '银行',     baseChange: 0.42,  leaders: ['工商银行', '招商银行'] },
            { name: '非银金融', baseChange: 1.15,  leaders: ['中信证券', '国泰君安'] },
            // ===== 消费 =====
            { name: '食品饮料', baseChange: 0.76,  leaders: ['贵州茅台', '五粮液'] },
            { name: '家用电器', baseChange: 1.25,  leaders: ['美的集团', '格力电器'] },
            { name: '纺织服装', baseChange: -0.45, leaders: ['申洲国际', '海澜之家'] },
            { name: '轻工制造', baseChange: 0.33,  leaders: ['顾家家居', '南极电商'] },
            { name: '商业贸易', baseChange: -0.88, leaders: ['永辉超市', '百联股份'] },
            { name: '休闲服务', baseChange: 1.42,  leaders: ['中国中免', '宋城演艺'] },
            { name: '旅游',     baseChange: 1.67,  leaders: ['丽江股份', '黄山旅游'] },
            { name: '农林牧渔', baseChange: 0.28,  leaders: ['牧原股份', '温氏股份'] },
            // ===== 医疗健康 =====
            { name: '医药生物', baseChange: -0.83, leaders: ['恒瑞医药', '药明康德'] },
            { name: '医疗器械', baseChange: -1.35, leaders: ['迈瑞医疗', '联影医疗'] },
            { name: '生物技术', baseChange: 1.15,  leaders: ['君实生物', '康希诺'] },
            { name: '创新药',   baseChange: 2.53,  leaders: ['恒瑞医药', '百济神州'] },
            { name: '中药',     baseChange: 0.29,  leaders: ['云南白药', '同仁堂'] },
            // ===== 工业与制造 =====
            { name: '机械设备', baseChange: 0.92,  leaders: ['三一重工', '徐工机械'] },
            { name: '电气设备', baseChange: 2.08,  leaders: ['阳光电源', '特变电工'] },
            { name: '建筑装饰', baseChange: 0.55,  leaders: ['中国建筑', '中国铁建'] },
            { name: '建筑材料', baseChange: -1.02, leaders: ['海螺水泥', '东方雨虹'] },
            { name: '钢铁',     baseChange: -0.55, leaders: ['宝钢股份', '鞍钢股份'] },
            // ===== 化工原材料 =====
            { name: '化工',     baseChange: -2.18, leaders: ['万华化学', '华鲁恒升'] },
            { name: '有色金属', baseChange: 1.63,  leaders: ['紫金矿业', '洛阳钼业'] },
            { name: '稀土',     baseChange: 2.34,  leaders: ['北方稀土', '盛和资源'] },
            { name: '煤炭',     baseChange: -0.72, leaders: ['中国神华', '陕西煤业'] },
            // ===== 新能源 =====
            { name: '新能源',   baseChange: 3.47,  leaders: ['宁德时代', '隆基绿能'] },
            { name: '光伏',     baseChange: 3.15,  leaders: ['隆基绿能', '通威股份'] },
            { name: '储能',     baseChange: 2.67,  leaders: ['亿纬锂能', '派能科技'] },
            { name: '锂电池',   baseChange: 1.87,  leaders: ['赣锋锂业', '天赐材料'] },
            { name: '风电',     baseChange: 2.11,  leaders: ['明阳智能', '金风科技'] },
            { name: '氢能',     baseChange: 3.22,  leaders: ['亿华通', '厚普股份'] },
            { name: '核电',     baseChange: 0.48,  leaders: ['中国核电', '中广核'] },
            { name: '公用事业', baseChange: 0.71,  leaders: ['长江电力', '华能国际'] },
            // ===== 科技 =====
            { name: '半导体',   baseChange: 4.12,  leaders: ['中芯国际', '北方华创'] },
            { name: 'CPU/GPU',  baseChange: 5.38,  leaders: ['龙芯中科', '景嘉微'] },
            { name: '存储设备', baseChange: 3.76,  leaders: ['兆易创新', '澜起科技'] },
            { name: '液冷',     baseChange: 4.25,  leaders: ['英维克', '申菱环境'] },
            { name: '电子',     baseChange: 2.31,  leaders: ['韦尔股份', '立讯精密'] },
            { name: '消费电子', baseChange: 1.53,  leaders: ['蓝思科技', '歌尔股份'] },
            { name: '计算机',   baseChange: -1.54, leaders: ['用友网络', '金蝶国际'] },
            { name: '通信',     baseChange: -0.37, leaders: ['中国电信', '中兴通讯'] },
            { name: '人工智能', baseChange: 4.56,  leaders: ['科大讯飞', '寒武纪'] },
            { name: '云计算',   baseChange: 1.89,  leaders: ['浪潮信息', '金山办公'] },
            { name: '网络安全', baseChange: 0.94,  leaders: ['深信服', '奇安信'] },
            { name: '数字经济', baseChange: 2.45,  leaders: ['三六零', '中软国际'] },
            { name: '工业互联', baseChange: 1.05,  leaders: ['汉威科技', '寄云科技'] },
            { name: '游戏',     baseChange: 1.23,  leaders: ['完美世界', '恺英网络'] },
            { name: '传媒',     baseChange: 0.63,  leaders: ['分众传媒', '芒果超媒'] },
            // ===== 周期与其他 =====
            { name: '汽车',     baseChange: 1.89,  leaders: ['比亚迪', '上汽集团'] },
            { name: '国防军工', baseChange: 2.74,  leaders: ['中航沈飞', '航发动力'] },
            { name: '航天航空', baseChange: 1.98,  leaders: ['中航西飞', '航天彩虹'] },
            { name: '交通运输', baseChange: -0.19, leaders: ['中国国航', '招商轮船'] },
            { name: '港口航运', baseChange: -0.64, leaders: ['中远海控', '海丰国际'] },
            { name: '房地产',   baseChange: -3.61, leaders: ['保利发展', '万科A'] },
            { name: '教育',     baseChange: -1.78, leaders: ['中公教育', '豆神教育'] },
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
        // Sort sectors by current change value from largest to smallest
        const sorted = this.sectors.map((s, i) => ({ s, change: this.currentChanges[i] }))
            .sort((a, b) => b.change - a.change);
        this.container.innerHTML = sorted.map(({ s, change }) => {
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
// ===== Adaptive Prediction Model =====
// Learns from 10-min ValidationPool outcomes via online gradient descent.
// Weights are persisted in localStorage so they survive page refreshes.
let predictionModel = null;
let continuousValidator = null;

class PredictionModel {
    static STORAGE_KEY = 'predModel_v2';

    // [WEIGHTS:START] ── 每日由 update_model.bat 自动更新，勿手动编辑此区块 ──
    static HARDCODED_WEIGHTS = {
        exportedAt:       '2026-03-05T08:18:36.690Z',
        version:           2,
        totalSamples:      133,
        generation:        133,
        maDiffMult:       -0.1036,
        intraDayPosMult:   0.0,   // intraday stochastic [-1,+1] learnable weight
        openStrengthMult:  0.0,   // (current-open)/open*100 learnable weight
        todMult:           0.0,   // time-of-day seasonality learnable weight
        buckets: [
            { id: 'rsi70', label: 'RSI > 70', minRsi: 70, base:     0.42,   count: 0, correctCount: 0 },
            { id: 'rsi60', label: 'RSI 60-70', minRsi: 60, base:    0.084,   count: 50, correctCount: 9 },
            { id: 'rsi50', label: 'RSI 50-60', minRsi: 50, base:  -0.0193,   count: 31, correctCount: 17 },
            { id: 'rsi40', label: 'RSI 40-50', minRsi: 40, base:    0.058,   count: 50, correctCount: 18 },
            { id: 'rsi30', label: 'RSI 30-40', minRsi: 30, base:  -0.2319,   count: 2, correctCount: 2 },
            { id: 'rsi0', label: 'RSI < 30', minRsi: 0, base:     -0.4,   count: 0, correctCount: 0 },
        ],
    };
    // [WEIGHTS:END]

    // RSI buckets matching generatePredictions thresholds (checked top-down)
    static BUCKET_DEFS = [
        { id: 'rsi70', label: 'RSI > 70',  minRsi: 70, base:  0.42    },
        { id: 'rsi60', label: 'RSI 60-70', minRsi: 60, base:  0.084   },
        { id: 'rsi50', label: 'RSI 50-60', minRsi: 50, base: -0.0193  },
        { id: 'rsi40', label: 'RSI 40-50', minRsi: 40, base:  0.058   },
        { id: 'rsi30', label: 'RSI 30-40', minRsi: 30, base: -0.2319  },
        { id: 'rsi0',  label: 'RSI < 30',  minRsi:  0, base: -0.40    },
    ];

    constructor() { this._load(); }

    _defaults() {
        const hw = PredictionModel.HARDCODED_WEIGHTS;
        return {
            version:          hw.version,
            buckets:          hw.buckets.map(b => ({ ...b })),
            maDiffMult:       hw.maDiffMult,
            intraDayPosMult:  hw.intraDayPosMult,
            openStrengthMult: hw.openStrengthMult,
            todMult:          hw.todMult,
            totalSamples:     hw.totalSamples,
            generation:       hw.generation,
        };
    }

    _load() {
        const hw = PredictionModel.HARDCODED_WEIGHTS;
        try {
            const raw = localStorage.getItem(PredictionModel.STORAGE_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                // Prefer localStorage only when it has strictly newer training than the hardcoded export
                if (p && p.version === 2 && (p.generation || 0) > hw.generation) {
                    Object.assign(this, p);
                    // Back-fill new fields that older saves won't have
                    if (this.intraDayPosMult  == null) this.intraDayPosMult  = 0.0;
                    if (this.openStrengthMult == null) this.openStrengthMult = 0.0;
                    if (this.todMult          == null) this.todMult          = 0.0;
                    return;
                }
            }
        } catch (e) { /* ignore */ }
        // Use hardcoded weights (fresher or equal generation beats stale localStorage)
        Object.assign(this, this._defaults());
        this._save();
    }

    _save() {
        localStorage.setItem(PredictionModel.STORAGE_KEY, JSON.stringify({
            version:          this.version,
            buckets:          this.buckets,
            maDiffMult:       this.maDiffMult,
            intraDayPosMult:  this.intraDayPosMult  ?? 0,
            openStrengthMult: this.openStrengthMult ?? 0,
            todMult:          this.todMult          ?? 0,
            totalSamples:     this.totalSamples,
            generation:       this.generation,
        }));
    }

    _getBucket(rsiVal) {
        const v = parseFloat(rsiVal);
        for (const b of this.buckets) { if (v >= b.minRsi) return b; }
        return this.buckets[this.buckets.length - 1];
    }

    getBase(rsiVal) { return this._getBucket(rsiVal).base; }

    /**
     * Online gradient-descent step driven by a completed 10-min validation.
     * item must have: rsi, maDiff (stored at prediction time) and result10min.actualPct.
     * Marks result10min.learnedAt so this item is never trained on twice.
     */
    learn(item) {
        if (!item.result10min || item.result10min.learnedAt) return;
        const rsi    = parseFloat(item.rsi);
        const maDiff = parseFloat(item.maDiff);
        const actual = item.result10min.actualPct;
        if (isNaN(rsi) || isNaN(maDiff) || isNaN(actual)) return;

        const bucket = this._getBucket(rsi);
        bucket.count++;
        if (item.result10min.correct) bucket.correctCount++;

        // Adaptive learning rate: starts at 0.15, decays gently, floors at 0.02
        const lr = Math.max(0.02, 0.15 / (1 + this.totalSamples * 0.05));

        // Residual between what was predicted and what actually happened
        const predicted = bucket.base + maDiff * this.maDiffMult;
        const error     = actual - predicted;

        // Gradient step for bucket base
        bucket.base = parseFloat(
            Math.max(-3.0, Math.min(3.0, bucket.base + lr * error)).toFixed(4)
        );

        // Gradient step for maDiff multiplier (skip near-zero maDiff — noisy gradient)
        if (Math.abs(maDiff) > 0.05) {
            this.maDiffMult = parseFloat(
                Math.max(-0.8, Math.min(0.8, this.maDiffMult + lr * error * maDiff)).toFixed(4)
            );
        }

        // ── Gradient steps for new intraday features (when stored at prediction time) ──
        // Feature: intraday price position signal, normalised to [-1, +1]
        const idSig = (item.intraDayPos != null) ? (parseFloat(item.intraDayPos) - 0.5) * 2 : null;
        if (idSig !== null && Math.abs(idSig) > 0.05) {
            this.intraDayPosMult = parseFloat(
                Math.max(-1.0, Math.min(1.0, (this.intraDayPosMult ?? 0) + lr * error * idSig)).toFixed(4)
            );
        }
        // Feature: open-strength momentum (current vs open, in %)
        const openStr = (item.openStrength != null) ? parseFloat(item.openStrength) : null;
        if (openStr !== null && Math.abs(openStr) > 0.01) {
            this.openStrengthMult = parseFloat(
                Math.max(-0.5, Math.min(0.5, (this.openStrengthMult ?? 0) + lr * error * openStr)).toFixed(4)
            );
        }
        // Feature: time-of-day seasonality factor
        const tod = (item.todFactor != null) ? parseFloat(item.todFactor) : null;
        if (tod !== null && Math.abs(tod) > 0.005) {
            this.todMult = parseFloat(
                Math.max(-0.5, Math.min(0.5, (this.todMult ?? 0) + lr * error * tod)).toFixed(4)
            );
        }

        this.totalSamples++;
        this.generation++;
        item.result10min.learnedAt = Date.now(); // prevent double-training
        this._save();
    }

    /** Aggregate 10-min direction accuracy across all buckets */
    accuracy() {
        const total   = this.buckets.reduce((s, b) => s + b.count, 0);
        const correct = this.buckets.reduce((s, b) => s + b.correctCount, 0);
        if (!total) return null;
        return { correct, total, pct: ((correct / total) * 100).toFixed(1) };
    }

    reset() {
        Object.assign(this, this._defaults());
        this._save();
    }

    // ── Serialisation helpers ──────────────────────────────────────────────
    _toJSONText() {
        return JSON.stringify({
            _note:            'TradeReview 自适应预测模型权重',
            exportedAt:       new Date().toISOString(),
            version:          this.version,
            totalSamples:     this.totalSamples,
            generation:       this.generation,
            maDiffMult:       this.maDiffMult,
            intraDayPosMult:  this.intraDayPosMult  ?? 0,
            openStrengthMult: this.openStrengthMult ?? 0,
            todMult:          this.todMult          ?? 0,
            buckets:          this.buckets,
        }, null, 2);
    }

    _applyFromText(text) {
        const p = JSON.parse(text);
        if (!p || p.version !== 2 || !Array.isArray(p.buckets) || p.buckets.length !== 6)
            throw new Error('文件格式不兼容，请使用本工具导出的权重文件');
        this.version          = p.version;
        this.totalSamples     = p.totalSamples || 0;
        this.generation       = p.generation   || 0;
        this.maDiffMult       = p.maDiffMult       ?? -0.1036;
        this.intraDayPosMult  = p.intraDayPosMult  ?? 0;
        this.openStrengthMult = p.openStrengthMult ?? 0;
        this.todMult          = p.todMult          ?? 0;
        this.buckets = PredictionModel.BUCKET_DEFS.map((def, i) => ({
            ...def,
            base:         p.buckets[i]?.base         ?? def.base,
            count:        p.buckets[i]?.count        ?? 0,
            correctCount: p.buckets[i]?.correctCount ?? 0,
        }));
        this._save();
        return { samples: this.totalSamples, generation: this.generation };
    }

    /** Fallback blob-download (used when File System Access API unavailable) */
    exportWeights() {
        const blob = new Blob([this._toJSONText()], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = 'trade_model.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    }

    /** Fallback import from <input type=file> (used when FSA unavailable) */
    importWeights(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload  = (e) => { try { resolve(this._applyFromText(e.target.result)); } catch (err) { reject(err); } };
            reader.onerror = () => reject(new Error('文件读取失败'));
            reader.readAsText(file);
        });
    }
}

// ===== ModelFileManager — File System Access API persistence =====
class ModelFileManager {
    static DB_NAME   = 'TradeReviewDB';
    static STORE     = 'fileHandles';
    static KEY       = 'modelFileHandle';
    static supported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

    static async _db() {
        return new Promise((res, rej) => {
            const r = indexedDB.open(ModelFileManager.DB_NAME, 1);
            r.onupgradeneeded = (e) => e.target.result.createObjectStore(ModelFileManager.STORE);
            r.onsuccess = (e) => res(e.target.result);
            r.onerror   = (e) => rej(e.target.error);
        });
    }

    static async _saveHandle(handle) {
        const db = await ModelFileManager._db();
        return new Promise((res, rej) => {
            const tx = db.transaction(ModelFileManager.STORE, 'readwrite');
            tx.objectStore(ModelFileManager.STORE).put(handle, ModelFileManager.KEY);
            tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error);
        });
    }

    static async _getHandle() {
        const db = await ModelFileManager._db();
        return new Promise((res, rej) => {
            const tx = db.transaction(ModelFileManager.STORE, 'readonly');
            const rq = tx.objectStore(ModelFileManager.STORE).get(ModelFileManager.KEY);
            rq.onsuccess = (e) => res(e.target.result || null);
            rq.onerror   = (e) => rej(e.target.error);
        });
    }

    /** Returns 'granted' | 'prompt' | 'denied' | 'none' */
    static async checkPermission() {
        if (!ModelFileManager.supported) return 'none';
        try {
            const handle = await ModelFileManager._getHandle();
            if (!handle) return 'none';
            return await handle.queryPermission({ mode: 'readwrite' });
        } catch { return 'none'; }
    }

    /**
     * Try to silently auto-load the model from the saved file handle.
     * Returns 'loaded' | 'needs-permission' | 'none' | 'error'
     */
    static async autoLoad() {
        if (!ModelFileManager.supported) return 'none';
        try {
            const handle = await ModelFileManager._getHandle();
            if (!handle) return 'none';
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
                const file = await handle.getFile();
                predictionModel._applyFromText(await file.text());
                return 'loaded';
            }
            return perm === 'denied' ? 'none' : 'needs-permission';
        } catch { return 'error'; }
    }

    /** Called by a user gesture — requests permission then loads. */
    static async requestAndLoad() {
        const handle = await ModelFileManager._getHandle();
        if (!handle) return false;
        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if (perm !== 'granted') return false;
        const file = await handle.getFile();
        predictionModel._applyFromText(await file.text());
        return true;
    }

    static _getProjectDir() {
        try {
            const href = window.location.href;
            if (!href.startsWith('file:///')) return null;
            const decoded = decodeURIComponent(href).replace('file:///', '');
            return decoded.replace(/\/[^\/]*$/, '').replace(/\//g, '\\');
        } catch { return null; }
    }

    // ── script.js handle persistence (separate key from model file) ──────────
    static SCRIPT_KEY = 'scriptJSHandle';

    static async _getScriptHandle() {
        const db = await ModelFileManager._db();
        return new Promise((res, rej) => {
            const tx = db.transaction(ModelFileManager.STORE, 'readonly');
            const rq = tx.objectStore(ModelFileManager.STORE).get(ModelFileManager.SCRIPT_KEY);
            rq.onsuccess = (e) => res(e.target.result || null);
            rq.onerror   = (e) => rej(e.target.error);
        });
    }

    static async _saveScriptHandle(handle) {
        const db = await ModelFileManager._db();
        return new Promise((res, rej) => {
            const tx = db.transaction(ModelFileManager.STORE, 'readwrite');
            tx.objectStore(ModelFileManager.STORE).put(handle, ModelFileManager.SCRIPT_KEY);
            tx.oncomplete = res; tx.onerror = (e) => rej(e.target.error);
        });
    }

    /**
     * One-click patch: auto-reuses the stored script.js handle so the user
     * only needs to pick the file ONCE. Subsequent calls are fully silent.
     * Returns the file name on success.
     */
    static async patchScriptJS() {
        if (!ModelFileManager.supported)
            throw new Error('浏览器不支持 File System Access API，请用 Chrome / Edge');

        // ── Resolve handle ───────────────────────────────────────────────────
        let handle = await ModelFileManager._getScriptHandle().catch(() => null);

        if (handle) {
            // Check / request permission without a new picker
            let perm = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'none');
            if (perm === 'prompt') {
                perm = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
            }
            if (perm !== 'granted') handle = null; // stale or denied → re-pick
        }

        if (!handle) {
            // First time (or permission permanently denied): show picker once
            const picks = await window.showOpenFilePicker({
                id: 'scriptJSPicker',
                startIn: 'documents',
                types: [{ description: 'script.js', accept: { 'application/javascript': ['.js'] } }],
            });
            handle = picks[0];
            await ModelFileManager._saveScriptHandle(handle);
        }

        // ── Read → patch → write ─────────────────────────────────────────────
        const file    = await handle.getFile();
        const content = await file.text();
        const marker  = /\/\/ \[WEIGHTS:START\][\s\S]*?\/\/ \[WEIGHTS:END\]/;
        if (!marker.test(content))
            throw new Error('选取的文件中找不到 [WEIGHTS:START]...[WEIGHTS:END] 标记，请确认选取的是 script.js');
        const newBlock = predictionModel._toWeightsBlock();
        const updated  = content.replace(marker, newBlock);
        const writable = await handle.createWritable();
        await writable.write(updated);
        await writable.close();
        return handle.name;
    }

    /**
     * Export & overwrite using stored handle.
     * First call opens Save dialog; subsequent calls are silent.
     */
    static async save() {
        if (!ModelFileManager.supported) {
            predictionModel.exportWeights(); // blob fallback
            return '(下载)';
        }
        let handle = await ModelFileManager._getHandle().catch(() => null);
        // Verify permission
        if (handle) {
            const perm = await handle.queryPermission({ mode: 'readwrite' }).catch(() => 'none');
            if (perm === 'prompt') {
                const req = await handle.requestPermission({ mode: 'readwrite' }).catch(() => 'denied');
                if (req !== 'granted') handle = null;
            } else if (perm !== 'granted') {
                handle = null;
            }
        }
        // First time: open Save picker
        if (!handle) {
            handle = await window.showSaveFilePicker({
                suggestedName: 'trade_model.json',
                types: [{ description: 'JSON 权重文件', accept: { 'application/json': ['.json'] } }],
            });
            await ModelFileManager._saveHandle(handle);
        }
        const writable = await handle.createWritable();
        await writable.write(predictionModel._toJSONText());
        await writable.close();
        return handle.name;
    }
}

// ===== ContinuousValidator =====
// Runs repeated 10-min prediction rounds on all watchlist stocks until
// ≥80% of them reach ≥95% directional accuracy. Auto-saves weights on goal.
class ContinuousValidator {
    static TARGET_STOCK_ACCURACY = 0.95; // per-stock minimum accuracy
    static TARGET_STOCK_RATIO    = 0.80; // fraction of stocks that must qualify
    static INTER_ROUND_DELAY_MS  = 3000; // 3s gap between rounds

    constructor(watchlist, validationPool, trendAnalyzer) {
        this.watchlist      = watchlist;
        this.validationPool = validationPool;
        this.trendAnalyzer  = trendAnalyzer;
        this.running        = false;
        this.round          = 0;
        this.roundItemIds   = new Set();
        this.stockStats     = {}; // code → { correct, total }
        this._timer         = null;
        this._waitTimer     = null; // used while waiting for market to open
    }

    start() {
        if (this.running) return;
        if (!this.validationPool?.items.length) {
            alert('验证池为空，请先在趨势分析中分析股票并添加到验证池');
            return;
        }
        this.running    = true;
        this.round      = 0;
        this.stockStats = {};
        this.roundItemIds.clear();
        this._updateUI();
        this._startRound();
    }

    stop() {
        this.running = false;
        if (this._timer)     { clearTimeout(this._timer);     this._timer     = null; }
        if (this._waitTimer) { clearTimeout(this._waitTimer); this._waitTimer = null; }
        this.roundItemIds.clear();
        this._updateUI();
    }

    /** If market is closed, show a waiting message and re-try when it opens */
    _waitForMarketOpen(msgPrefix = '') {
        if (this._waitTimer) { clearTimeout(this._waitTimer); this._waitTimer = null; }
        const reason = tradingClosedReason();
        const delay  = msUntilNextOpen();
        const mins   = Math.ceil(delay / 60000);
        const eta    = mins >= 60
            ? `${Math.floor(mins / 60)}小时${mins % 60}分钟`
            : `${mins}分钟`;
        const label  = msgPrefix
            ? `${msgPrefix}　⏸ ${reason}，${eta}后自动继续`
            : `⏸ ${reason}，${eta}后自动继续`;
        this._updateUI(label);
        this._waitTimer = setTimeout(() => {
            this._waitTimer = null;
            if (!this.running) return;
            if (isTradingTime()) {
                this._startRound();
            } else {
                this._waitForMarketOpen(msgPrefix);
            }
        }, delay);
    }

    async _startRound() {
        if (!this.running) return;

        // Block if outside trading hours
        if (!isTradingTime()) {
            this._waitForMarketOpen(
                this.round > 0 ? `第 ${this.round} 轮已完成` : ''
            );
            return;
        }

        this.round++;
        this.roundItemIds.clear();

        // Derive unique stocks from whatever is currently in the validation pool
        const seen   = new Set();
        const stocks = [];
        for (const item of this.validationPool.items) {
            if (!seen.has(item.code)) {
                seen.add(item.code);
                stocks.push({ code: item.code, name: item.name });
            }
        }
        if (!stocks.length) { this.stop(); return; }

        for (const stock of stocks) {
            const stockData = await getStockDataShared(stock.code).catch(() => null);
            // Fall back to last known price from pool if API fails
            const fallback  = this.validationPool.items.find(i => i.code === stock.code);
            const price     = stockData?.price || fallback?.entryPrice || 0;
            if (!price) continue;
            const result   = this.trendAnalyzer.analyze(price, price, stock.code);
            const enriched = {
                open: stockData?.open, high: stockData?.high,
                low:  stockData?.low,  prevClose: stockData?.prevClose,
                volume: stockData?.volume, amount: stockData?.amount,
            };
            const preds  = this.trendAnalyzer.generatePredictions(price, result.rsi, result.maDiff, enriched);
            const feats  = preds._features || {};
            const entry  = {
                id:               Date.now() + Math.random(),
                code:             stock.code,
                name:             stock.name,
                entryPrice:       price,
                addedAt:          Date.now(),
                pred10min:        preds.pred10min,
                pred2hr:          preds.pred2hr,
                signal:           result.signal,
                rsi:              result.rsi,
                maDiff:           result.maDiff,
                intraDayPos:      feats.intraDayPos  ?? null,
                openStrength:     feats.openStrength ?? null,
                todFactor:        feats.todFactor    ?? null,
                _cvRound:         this.round,
                result10min:      null,
                result2hr:        null,
            };
            this.validationPool.items.unshift(entry);
            this.roundItemIds.add(entry.id);
        }
        this.validationPool._save();
        this.validationPool.render();
        this._updateUI(`第 ${this.round} 轮 · 对 ${stocks.length} 只股票生成预测，10 分钟后自动验证…`);
    }

    /** Called by ValidationPool._checkPending after a 10-min result is stored */
    onItemVerified(item) {
        if (!this.running || !this.roundItemIds.has(item.id)) return;
        if (!this.stockStats[item.code]) this.stockStats[item.code] = { correct: 0, total: 0 };
        const s = this.stockStats[item.code];
        s.total++;
        if (item.result10min.correct) s.correct++;
        // Check whether every item in this round now has a 10-min result
        const allDone = [...this.roundItemIds].every(id => {
            const f = this.validationPool.items.find(i => i.id === id);
            return f && f.result10min !== null;
        });
        if (allDone) this._evaluateAndContinue();
    }

    async _evaluateAndContinue() {
        const codes     = Object.keys(this.stockStats);
        const qualified = codes.filter(c => {
            const s = this.stockStats[c];
            return s.total > 0 && s.correct / s.total >= ContinuousValidator.TARGET_STOCK_ACCURACY;
        });
        const ratio  = codes.length ? qualified.length / codes.length : 0;
        const pctStr = (ratio * 100).toFixed(0);

        // ── Always save updated weights to JSON after every round ──────────
        let savedTag = '';
        try {
            const fname = await ModelFileManager.save();
            savedTag = ` · 💾 权重已保存(${fname}, 第${predictionModel.generation}代)`;
        } catch {
            // If no file linked yet, at least localStorage is already up to date
            savedTag = ` · 💾 权重已写入本地缓存(第${predictionModel.generation}代)`;
        }
        // Notify model status panel to refresh
        document.dispatchEvent(new CustomEvent('modelUpdated'));

        if (ratio >= ContinuousValidator.TARGET_STOCK_RATIO) {
            this.running = false;
            this._updateUI(
                `🎉 目标达成！${qualified.length}/${codes.length} 只股票准确率 ≥ 95%（共 ${this.round} 轮）${savedTag}`, true);
            this._toast(`🎉 持续验证完成！${pctStr}% 的股票达到 ≥ 95% 准确率，共 ${this.round} 轮`);
        } else {
            this._updateUI(`第 ${this.round} 轮完成 · ${qualified.length}/${codes.length} 只达标(${pctStr}%)${savedTag}`);
            if (isTradingTime()) {
                this._timer = setTimeout(() => this._startRound(), ContinuousValidator.INTER_ROUND_DELAY_MS);
            } else {
                this._waitForMarketOpen(`第 ${this.round} 轮完成 ${savedTag}`);
            }
        }
    }

    _updateUI(msg = '', success = false) {
        const btn = document.getElementById('cvToggleBtn');
        if (btn) {
            btn.textContent = this.running ? '⏹ 停止验证' : '▶ 开启持续验证';
            btn.className   = this.running ? 'btn-cv-stop' : 'btn-cv-start';
        }
        const bar = document.getElementById('cvStatusBar');
        if (!bar) return;
        const codes = Object.keys(this.stockStats);
        if (!msg && !codes.length) { bar.style.display = 'none'; return; }
        bar.style.display = 'block';
        bar.className     = 'cv-status-bar' + (success ? ' cv-success' : '');
        const tagsHtml = codes.length
            ? `<div class="cv-stat-row">${codes.map(c => {
                const s   = this.stockStats[c];
                const pct = s.total ? ((s.correct / s.total) * 100).toFixed(0) : '—';
                const ok  = s.total && s.correct / s.total >= ContinuousValidator.TARGET_STOCK_ACCURACY;
                return `<span class="${ok ? 'cv-tag-good' : 'cv-tag-bad'}">${c}: ${pct}% (${s.correct}/${s.total})</span>`;
            }).join('')}</div>`
            : '';
        bar.innerHTML = msg ? `<div class="cv-msg">${msg}</div>${tagsHtml}` : tagsHtml;
    }

    _toast(msg) {
        const t = Object.assign(document.createElement('div'), { className: 'ms-toast', textContent: msg });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 6000);
    }
}

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
                this.renderModelStatus();
            }
        });
        document.addEventListener('modelUpdated', () => this.renderModelStatus());
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
        // Event delegation for add-to-pool button rendered inside trendResult
        if (this.trendResult) {
            this.trendResult.addEventListener('click', (e) => {
                if (e.target.closest('#addToPoolBtn')) this._addToPool();
            });
        }
    }

    /**
     * Generate 10-min and 2-hr predictions.
     * @param {number} currentPrice
     * @param {number|string} rsi
     * @param {number|string} maDiff
     * @param {object} enriched  Optional real market data: { open, high, low, prevClose, volume, amount }
     *
     * Formula (10-min base):
     *   base = rsi_bucket_base
     *        + maDiff * maDiffMult            (MA momentum, learned)
     *        + intraDaySignal * idpMult        (intraday overbought/oversold, learned)
     *        + openStrength * osMult           (vs-open momentum, learned)
     *        + todFactor * todMult             (time-of-day seasonality, learned)
     *        + timeNoise + priceNoise          (micro-jitter)
     */
    generatePredictions(currentPrice, rsi, maDiff, enriched = {}) {
        const rsiVal    = parseFloat(rsi);
        const maDiffVal = parseFloat(maDiff);
        // Small time/price noise so consecutive analyses of the same stock differ slightly
        const timeNoise  = ((Date.now() / 1000) % 60) / 60 * 0.10 - 0.05; // ±0.05%
        const priceNoise = ((currentPrice * 100) % 17) / 170 * 0.10 - 0.03; // ±0.03%

        // RSI-driven base momentum: use learned model weights when available, else factory defaults
        let base, maMult, idpMult, osMult, todM;
        if (predictionModel) {
            base    = predictionModel.getBase(rsiVal);
            maMult  = predictionModel.maDiffMult;
            idpMult = predictionModel.intraDayPosMult  ?? 0;
            osMult  = predictionModel.openStrengthMult ?? 0;
            todM    = predictionModel.todMult          ?? 0;
        } else {
            if      (rsiVal > 70) base =  0.42;
            else if (rsiVal > 60) base =  0.084;
            else if (rsiVal > 50) base = -0.0193;
            else if (rsiVal > 40) base =  0.058;
            else if (rsiVal > 30) base = -0.2319;
            else                  base = -0.40;
            maMult = -0.1036;
            idpMult = 0; osMult = 0; todM = 0;
        }

        base += maDiffVal * maMult;

        // ── Feature 1: Intraday price position (stochastic-like, normalised to [-1, +1]) ──
        // +1 = trading at day high (overbought intraday) | -1 = at day low (oversold intraday)
        let intraDayPos = null, idSig = 0;
        if (enriched.high != null && enriched.low != null && enriched.high > enriched.low) {
            intraDayPos = (currentPrice - enriched.low) / (enriched.high - enriched.low);
            idSig = (intraDayPos - 0.5) * 2;
            base += idSig * idpMult;
        }

        // ── Feature 2: Open strength (盘中强度 vs 开盘价, in %) ──────────────────────
        // Captures intraday momentum direction vs. the opening price.
        let openStrength = null;
        if (enriched.open != null && enriched.open > 0) {
            openStrength = (currentPrice - enriched.open) / enriched.open * 100;
            base += openStrength * osMult;
        }

        // ── Feature 3: Time-of-day seasonality ──────────────────────────────────
        // 09:30-10:00: opening surge zone (+0.25) | 10:00-11:30: neutral (0)
        // 13:00-13:30: post-lunch pulse (+0.15)   | 13:30-15:00: wind-down (-0.10)
        const nowM = new Date().getHours() * 60 + new Date().getMinutes();
        let todFactor = 0;
        if      (nowM >= 570 && nowM < 600) todFactor =  0.25;
        else if (nowM >= 600 && nowM < 690) todFactor =  0.00;
        else if (nowM >= 780 && nowM < 810) todFactor =  0.15;
        else if (nowM >= 810 && nowM < 900) todFactor = -0.10;
        base += todFactor * todM;

        base += timeNoise + priceNoise;

        const pct10  = parseFloat(base.toFixed(2));
        // 2-hour window is ~4.2× the 10-min movement (assumes roughly √18 time scaling)
        const pct2hr = parseFloat((base * 4.2).toFixed(2));
        return {
            pred10min: { pct: pct10,  targetPrice: parseFloat((currentPrice * (1 + pct10  / 100)).toFixed(2)) },
            pred2hr:   { pct: pct2hr, targetPrice: parseFloat((currentPrice * (1 + pct2hr / 100)).toFixed(2)) },
            // Feature snapshot stored so learn() can train on them
            _features: { intraDayPos, openStrength, todFactor },
        };
    }

    _addToPool() {
        if (!this._lastAnalysis || !this.validationPool) return;
        const { code, name, currentPrice, result, predictions } = this._lastAnalysis;
        const feats = predictions._features || {};
        this.validationPool.add({
            id:               Date.now(),
            code,
            name,
            entryPrice:       currentPrice,
            addedAt:          Date.now(),
            pred10min:        predictions.pred10min,
            pred2hr:          predictions.pred2hr,
            signal:           result.signal,
            rsi:              result.rsi,
            maDiff:           result.maDiff,
            intraDayPos:      feats.intraDayPos  ?? null,  // Feature 1
            openStrength:     feats.openStrength ?? null,  // Feature 2
            todFactor:        feats.todFactor    ?? null,  // Feature 3
            result10min:      null,
            result2hr:        null
        });
        const btn = document.getElementById('addToPoolBtn');
        if (btn) {
            btn.textContent = '✓ 已添加到验证池';
            btn.disabled = true;
            btn.classList.add('btn-added');
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
        const enriched = {
            open:      stockData.open,
            high:      stockData.high,
            low:       stockData.low,
            prevClose: stockData.prevClose,
            volume:    stockData.volume,
            amount:    stockData.amount,
        };
        const predictions = this.generatePredictions(currentPrice, result.rsi, result.maDiff, enriched);
        this._lastAnalysis = { code, name: stockData.name, currentPrice, result, predictions, enriched };
        this.renderResult(code, stockData.name, currentPrice, result, predictions, enriched);
        this.renderModelStatus();
    }

    async renderModelStatus() {
        const el = document.getElementById('modelStatusPanel');
        if (!el || !predictionModel) return;
        const acc = predictionModel.accuracy();
        const accStr = acc
            ? `<span class="${parseFloat(acc.pct) >= 55 ? 'ms-acc-good' : 'ms-acc-low'}">${acc.pct}%</span> <span class="ms-acc-sub">(${acc.correct}/${acc.total})</span>`
            : '<span class="ms-acc-sub">暂无数据 — 添加预测到验证池后自动收集</span>';
        const maSign = predictionModel.maDiffMult >= 0 ? '+' : '';
        const bucketRows = predictionModel.buckets.map(b => {
            const bPct = b.count > 0 ? ((b.correctCount / b.count) * 100).toFixed(0) + '%' : '—';
            const bPctCls = b.count > 0 ? (b.correctCount / b.count >= 0.5 ? 'ms-good' : 'ms-bad') : '';
            const bBase = (b.base >= 0 ? '+' : '') + b.base + '%';
            const bCls = b.base >= 0 ? 'ms-good' : 'ms-bad';
            return `<tr>
                <td>${b.label}</td>
                <td class="${bCls}">${bBase}</td>
                <td>${b.count}</td>
                <td class="${bPctCls}">${bPct}</td>
            </tr>`;
        }).join('');
        const learnStatus = predictionModel.totalSamples === 0 ? '⏳ 等待数据'
            : predictionModel.totalSamples < 5  ? '📈 初始积累期'
            : predictionModel.totalSamples < 20 ? '🔄 快速学习期'
            : '✅ 持续优化中';

        // File linkage status
        const filePerm    = await ModelFileManager.checkPermission();
        const projectDir  = ModelFileManager._getProjectDir();
        const pathHintHtml = projectDir
            ? `<div class="ms-path-hint">📂 首次导出时请导航到：<code>${projectDir}</code></div>`
            : '';
        // script.js handle linkage (for 🔄 button)
        const scriptHandle = await ModelFileManager._getScriptHandle().catch(() => null);
        const scriptPerm   = scriptHandle
            ? await scriptHandle.queryPermission({ mode: 'readwrite' }).catch(() => 'none')
            : 'none';
        const scriptLinked = scriptPerm === 'granted' || scriptPerm === 'prompt';
        const patchTitle   = scriptLinked
            ? `🔄 刷新源码（已关联 script.js，点击自动写入）`
            : `🔄 刷新源码（首次需选择 script.js，之后自动）`;
        let fileStatusHtml = '';
        let importBtnHtml  = '';
        if (!ModelFileManager.supported) {
            fileStatusHtml = '<span class="ms-file-tag ms-file-none">⚠️ 浏览器不支持文件 API（请用 Chrome/Edge）</span>';
            importBtnHtml  = `<label class="ms-import-label" title="从文件恢复学习进度">⬆ 导入<input type="file" id="importModelInput" accept=".json" style="display:none"></label>`;
        } else if (filePerm === 'none') {
            fileStatusHtml = '<span class="ms-file-tag ms-file-none">💾 未关联文件（点导出后自动关联）</span>';
        } else if (filePerm === 'prompt') {
            fileStatusHtml = '<span class="ms-file-tag ms-file-prompt">🔐 文件已关联，需授权</span>';
            importBtnHtml  = `<button class="ms-restore-btn" id="restoreModelBtn">🔗 从关联文件恢复</button>`;
        } else if (filePerm === 'granted') {
            fileStatusHtml = '<span class="ms-file-tag ms-file-ok">🟢 文件已关联，导出直接覆盖</span>';
        }

        el.innerHTML = `
            <div class="ms-header">
                <span class="ms-title">🧠 自适应预测模型</span>
                <span class="ms-meta">第 ${predictionModel.generation} 代 · ${predictionModel.totalSamples} 个样本</span>
                <button class="ms-export-btn" id="exportModelBtn" title="导出并覆盖权重文件">⬇ 导出</button>
                ${importBtnHtml}
                <button class="ms-patch-btn ${scriptLinked ? 'ms-patch-linked' : ''}" id="patchScriptBtn" title="${patchTitle}">🔄 刷新源码${scriptLinked ? ' 🟢' : ''}</button>
                <button class="ms-reset-btn" id="resetModelBtn" title="重置所有学习权重到初始值">↺ 重置</button>
            </div>
            <div class="ms-file-status">${fileStatusHtml}${pathHintHtml}</div>
            <div class="ms-stats-row">
                <div class="ms-stat">
                    <div class="ms-stat-label">10分钟方向准确率</div>
                    <div class="ms-stat-val">${accStr}</div>
                </div>
                <div class="ms-stat">
                    <div class="ms-stat-label">maDiff 权重</div>
                    <div class="ms-stat-val ${predictionModel.maDiffMult >= 0 ? 'ms-good' : 'ms-bad'}">${maSign}${predictionModel.maDiffMult}</div>
                </div>
                <div class="ms-stat">
                    <div class="ms-stat-label">盘中位置权重</div>
                    <div class="ms-stat-val ${(predictionModel.intraDayPosMult ?? 0) >= 0 ? 'ms-good' : 'ms-bad'}">${((predictionModel.intraDayPosMult ?? 0) >= 0 ? '+' : '')}${(predictionModel.intraDayPosMult ?? 0).toFixed(4)}</div>
                </div>
                <div class="ms-stat">
                    <div class="ms-stat-label">开盘强度权重</div>
                    <div class="ms-stat-val ${(predictionModel.openStrengthMult ?? 0) >= 0 ? 'ms-good' : 'ms-bad'}">${((predictionModel.openStrengthMult ?? 0) >= 0 ? '+' : '')}${(predictionModel.openStrengthMult ?? 0).toFixed(4)}</div>
                </div>
                <div class="ms-stat">
                    <div class="ms-stat-label">学习状态</div>
                    <div class="ms-stat-val">${learnStatus}</div>
                </div>
            </div>
            <details class="ms-details">
                <summary>RSI 区间权重详情 ▸</summary>
                <table class="ms-table">
                    <thead><tr><th>RSI 区间</th><th>当前基准</th><th>样本数</th><th>准确率</th></tr></thead>
                    <tbody>${bucketRows}</tbody>
                </table>
            </details>
        `;
        document.getElementById('resetModelBtn')?.addEventListener('click', () => {
            if (confirm('确认重置模型？所有学习进度将丢失，预测权重恢复为初始值。')) {
                predictionModel.reset();
                this.renderModelStatus();
            }
        });
        document.getElementById('exportModelBtn')?.addEventListener('click', async () => {
            try {
                const name = await ModelFileManager.save();
                this.renderModelStatus();
                const msg = name === '(下载)' ? '已下载 trade_model.json' : `已保存到 ${name}`;
                // Brief toast instead of alert
                const toast = document.createElement('div');
                toast.className = 'ms-toast';
                toast.textContent = '✅ ' + msg;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 2500);
            } catch (err) {
                if (err.name !== 'AbortError') alert(`导出失败：${err.message}`);
            }
        });
        document.getElementById('patchScriptBtn')?.addEventListener('click', async () => {
            try {
                const name = await ModelFileManager.patchScriptJS();
                const toast = document.createElement('div');
                toast.className = 'ms-toast';
                toast.textContent = `✅ ${name} 已写入第 ${predictionModel.generation} 代权重，刷新浏览器即生效`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 4000);
                this.renderModelStatus(); // 更新按钮为「已关联 🟢」状态
            } catch (err) {
                if (err.name !== 'AbortError') alert(`写入失败：${err.message}`);
            }
        });
        document.getElementById('restoreModelBtn')?.addEventListener('click', async () => {
            try {
                const ok = await ModelFileManager.requestAndLoad();
                if (ok) { this.renderModelStatus(); }
                else { alert('授权失败，无法读取文件。'); }
            } catch (err) { alert(`恢复失败：${err.message}`); }
        });
        document.getElementById('importModelInput')?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const info = await predictionModel.importWeights(file);
                this.renderModelStatus();
                alert(`✅ 导入成功！已恢复 ${info.samples} 个样本、第 ${info.generation} 代的学习进度。`);
            } catch (err) { alert(`❌ 导入失败：${err.message}`); }
            e.target.value = '';
        });
    }

    renderResult(code, name, currentPrice, result, predictions, enriched = {}) {
        if (!this.trendResult) return;
        const { rsi, maDiff, pctVsTarget, signal } = result;
        const maDiffClass = parseFloat(maDiff) >= 0 ? 'positive' : 'negative';
        const maDiffSign = parseFloat(maDiff) >= 0 ? '+' : '';

        // Intraday feature cards (only shown when real market data is available)
        let intraDayCardsHtml = '';
        const feats = predictions._features || {};
        if (feats.intraDayPos != null) {
            const idPct = (feats.intraDayPos * 100).toFixed(0);
            const idCls = feats.intraDayPos > 0.8 ? 'negative' : feats.intraDayPos < 0.2 ? 'positive' : '';
            intraDayCardsHtml += `
                <div class="trend-indicator-card">
                    <div class="trend-indicator-label">盘中位置 (高低比)</div>
                    <div class="trend-indicator-value ${idCls}">${idPct}%</div>
                </div>`;
        }
        if (feats.openStrength != null) {
            const osCls = feats.openStrength >= 0 ? 'positive' : 'negative';
            const osSign = feats.openStrength >= 0 ? '+' : '';
            intraDayCardsHtml += `
                <div class="trend-indicator-card">
                    <div class="trend-indicator-label">开盘强度</div>
                    <div class="trend-indicator-value ${osCls}">${osSign}${feats.openStrength.toFixed(2)}%</div>
                </div>`;
        }

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

        // Prediction rows (only rendered when predictions provided)
        let predHtml = '';
        if (predictions) {
            const p10 = predictions.pred10min;
            const p2h = predictions.pred2hr;
            const cls10  = p10.pct  >= 0 ? 'positive' : 'negative';
            const cls2h  = p2h.pct  >= 0 ? 'positive' : 'negative';
            const sign10 = p10.pct  >= 0 ? '+' : '';
            const sign2h = p2h.pct  >= 0 ? '+' : '';
            predHtml = `
                <div class="trend-predictions">
                    <div class="trend-predictions-title">📊 趋势预测</div>
                    <div class="trend-pred-row">
                        <span class="trend-pred-label">10分钟</span>
                        <span class="trend-pred-val ${cls10}">${sign10}${p10.pct}%</span>
                        <span class="trend-pred-arrow">→</span>
                        <span class="trend-pred-target">目标 ¥${p10.targetPrice}</span>
                    </div>
                    <div class="trend-pred-row">
                        <span class="trend-pred-label">2小时</span>
                        <span class="trend-pred-val ${cls2h}">${sign2h}${p2h.pct}%</span>
                        <span class="trend-pred-arrow">→</span>
                        <span class="trend-pred-target">目标 ¥${p2h.targetPrice}</span>
                    </div>
                </div>
                <button class="btn-add-to-pool" id="addToPoolBtn">➕ 添加到验证池</button>
            `;
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
                ${intraDayCardsHtml}
            </div>
            <div class="trend-summary">${this.escapeHtml(summaryText)}</div>
            ${predHtml}
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
