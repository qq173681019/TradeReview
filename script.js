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
    }

    addStock() {
        const code = document.getElementById('stockCode').value.trim();
        const name = document.getElementById('stockName').value.trim();
        const currentPrice = parseFloat(document.getElementById('currentPrice').value);
        const sellPrice = parseFloat(document.getElementById('sellPrice').value);

        if (!code || !name || isNaN(currentPrice) || isNaN(sellPrice)) {
            alert('请填写所有字段');
            return;
        }

        if (currentPrice <= 0 || sellPrice <= 0) {
            alert('价格必须大于零');
            return;
        }

        const stock = {
            id: Date.now(),
            code,
            name,
            currentPrice,
            sellPrice,
            addedDate: new Date().toISOString()
        };

        this.stocks.push(stock);
        this.saveStocks();
        this.renderStocks();
        this.clearForm();
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

    simulatePriceUpdates() {
        // Simulate small random price changes
        this.stocks.forEach(stock => {
            const change = (Math.random() - 0.5) * 0.2; // Random change between -0.1 and +0.1
            stock.currentPrice = Math.max(0.01, stock.currentPrice + change);
        });
        this.saveStocks();
        this.renderStocks();
    }

    calculateAlertLevel(currentPrice, sellPrice) {
        const ratio = currentPrice / sellPrice;
        
        if (ratio <= 1.0) {
            // At or below sell price - CRITICAL
            return 'critical';
        } else if (ratio <= 1.05) {
            // Within 5% above sell price - WARNING
            return 'warning';
        } else if (ratio <= 1.10) {
            // Within 10% above sell price - CAUTION
            return 'caution';
        } else {
            // More than 10% above - SAFE
            return 'safe';
        }
    }

    getAlertText(level) {
        const texts = {
            critical: '立即提醒',
            warning: '接近目标',
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
            const alertLevel = this.calculateAlertLevel(stock.currentPrice, stock.sellPrice);
            
            if (alertLevel === 'critical' && this.shouldNotify(stock.id)) {
                this.showNotification(stock);
            }
        });
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

    promptUpdatePrice(id) {
        const stock = this.stocks.find(s => s.id === id);
        if (!stock) return;
        
        const newPrice = prompt(`更新 ${stock.name} (${stock.code}) 的当前价格:`, stock.currentPrice.toFixed(2));
        
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
        document.getElementById('stockName').value = '';
        document.getElementById('currentPrice').value = '';
        document.getElementById('sellPrice').value = '';
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
