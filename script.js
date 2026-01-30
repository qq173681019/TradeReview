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
        // Validate stock code format (6 digits)
        if (!/^\d{6}$/.test(code)) {
            return null;
        }

        // Determine market prefix (Shanghai or Shenzhen)
        const prefix = code.startsWith('6') ? 'sh' : 'sz';
        const fullCode = prefix + code;
        
        // Try Sina Finance API using JSONP-style script loading
        try {
            const data = await this.fetchStockFromSina(fullCode);
            if (data) {
                console.log(`✓ 成功从新浪财经API获取股票数据: ${code}`);
                return data;
            }
        } catch (error) {
            console.warn('Sina API failed:', error);
        }

        // Try Tencent API as fallback
        try {
            const data = await this.fetchStockFromTencent(fullCode);
            if (data) {
                console.log(`✓ 成功从腾讯财经API获取股票数据: ${code}`);
                return data;
            }
        } catch (error) {
            console.warn('Tencent API failed:', error);
        }

        // If both APIs fail (blocked by ad-blocker or CORS), use fallback database
        console.warn(`⚠️ API被阻止，使用备用数据库: ${code}`);
        if (FALLBACK_STOCK_DATABASE[code]) {
            console.log(`✓ 从备用数据库找到股票: ${code} - ${FALLBACK_STOCK_DATABASE[code].name}`);
            return FALLBACK_STOCK_DATABASE[code];
        }

        // If all methods fail, return null
        return null;
    }

    fetchStockFromSina(fullCode) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const callbackName = 'sina_callback_' + Date.now();
            
            // Sina API returns: var hq_str_sh600519="name,open,yclose,current,..."
            window[callbackName] = function(data) {
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                
                // Parse the response from the global variable
                const varName = 'hq_str_' + fullCode;
                if (window[varName]) {
                    const text = window[varName];
                    const parts = text.split(',');
                    if (parts.length >= 4) {
                        const name = parts[0];
                        const price = parseFloat(parts[3]);
                        if (name && price > 0) {
                            resolve({ name, price });
                            return;
                        }
                    }
                }
                resolve(null);
            };
            
            script.onerror = () => {
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                reject(new Error('Script load failed'));
            };
            
            // Sina doesn't use callback parameter, it sets a global variable
            script.src = `https://hq.sinajs.cn/list=${fullCode}`;
            script.onload = () => {
                // Check if the global variable was set
                setTimeout(() => {
                    const varName = 'hq_str_' + fullCode;
                    const value = eval('typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
                    if (value) {
                        const parts = value.split(',');
                        if (parts.length >= 4) {
                            const name = parts[0];
                            const price = parseFloat(parts[3]);
                            if (name && price > 0) {
                                delete window[callbackName];
                                if (script.parentNode) {
                                    script.parentNode.removeChild(script);
                                }
                                resolve({ name, price });
                                return;
                            }
                        }
                    }
                    delete window[callbackName];
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                    resolve(null);
                }, 100);
            };
            
            // Timeout
            setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                    reject(new Error('Timeout'));
                }
            }, 5000);
            
            document.head.appendChild(script);
        });
    }

    fetchStockFromTencent(fullCode) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const callbackName = 'tencent_callback_' + Date.now();
            
            // Tencent returns: v_${code}="...~name~...~price~..."
            window[callbackName] = function() {
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                
                // Parse from global variable
                const varName = 'v_' + fullCode;
                if (window[varName]) {
                    const text = window[varName];
                    const parts = text.split('~');
                    if (parts.length >= 4) {
                        const name = parts[1];
                        const price = parseFloat(parts[3]);
                        if (name && price > 0) {
                            resolve({ name, price });
                            return;
                        }
                    }
                }
                resolve(null);
            };
            
            script.onerror = () => {
                delete window[callbackName];
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                reject(new Error('Script load failed'));
            };
            
            script.src = `https://qt.gtimg.cn/q=${fullCode}`;
            script.onload = () => {
                setTimeout(() => {
                    const varName = 'v_' + fullCode;
                    const value = eval('typeof ' + varName + ' !== "undefined" ? ' + varName + ' : null');
                    if (value) {
                        const parts = value.split('~');
                        if (parts.length >= 4) {
                            const name = parts[1];
                            const price = parseFloat(parts[3]);
                            if (name && price > 0) {
                                delete window[callbackName];
                                if (script.parentNode) {
                                    script.parentNode.removeChild(script);
                                }
                                resolve({ name, price });
                                return;
                            }
                        }
                    }
                    delete window[callbackName];
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                    resolve(null);
                }, 100);
            };
            
            // Timeout
            setTimeout(() => {
                if (window[callbackName]) {
                    delete window[callbackName];
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                    reject(new Error('Timeout'));
                }
            }, 5000);
            
            document.head.appendChild(script);
        });
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
        // Calculate percentage difference: positive means above sell price, negative means below
        const percentDiff = ((currentPrice - sellPrice) / sellPrice) * 100;
        
        if (percentDiff >= 15) {
            // 15% or more above sell price - GREEN (safe)
            return 'safe';
        } else if (percentDiff >= 8) {
            // 8-15% above sell price - YELLOW (caution)
            return 'caution';
        } else {
            // Less than 8% above (or below) sell price - RED (critical)
            return 'critical';
        }
    }

    getAlertText(level) {
        const texts = {
            critical: '立即提醒',
            caution: '注意观察',
            safe: '正常'
        };
        return texts[level] || '未知';
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
            
            // Show popup for stocks with 15% or more profit
            if (percentDiff >= 15 && this.shouldNotify(stock.id)) {
                this.showPopupNotification(stock, percentDiff);
            }
            
            if (alertLevel === 'critical' && this.shouldNotify(stock.id)) {
                this.showNotification(stock);
            }
        });
    }

    showPopupNotification(stock, percentDiff) {
        // Show browser alert for significant profit opportunity
        alert(`🎉 重要提醒！\n\n${stock.name} (${stock.code})\n当前价格已超过卖出价格 ${percentDiff.toFixed(2)}%\n\n当前价格: ¥${stock.currentPrice.toFixed(2)}\n卖出价格: ¥${stock.sellPrice.toFixed(2)}\n\n建议立即关注！`);
        
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
    new StockWatchlist();
});
