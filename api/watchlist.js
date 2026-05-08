import { list, put } from '@vercel/blob';

const WATCHLIST_PATH = 'data/watchlist.json';

function sendJson(res, statusCode, payload) {
    res.status(statusCode);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.send(JSON.stringify(payload));
}

function normalizeStock(stock) {
    return {
        id: Number(stock.id),
        code: String(stock.code || '').trim(),
        name: String(stock.name || '').trim(),
        currentPrice: Number(stock.currentPrice),
        sellPrice: Number(stock.sellPrice),
        addedDate: String(stock.addedDate || new Date().toISOString())
    };
}

function normalizeStocks(payload) {
    if (!Array.isArray(payload)) {
        throw new Error('stocks must be an array');
    }

    return payload.map(normalizeStock).filter(stock => {
        return Number.isFinite(stock.id)
            && /^\d{6}$/.test(stock.code)
            && stock.name
            && Number.isFinite(stock.currentPrice)
            && stock.currentPrice > 0
            && Number.isFinite(stock.sellPrice)
            && stock.sellPrice > 0;
    });
}

async function readStoredWatchlist() {
    const { blobs } = await list({ prefix: WATCHLIST_PATH, limit: 1 });
    const watchlistBlob = blobs.find(blob => blob.pathname === WATCHLIST_PATH) || blobs[0];
    if (!watchlistBlob?.url) {
        return [];
    }

    const response = await fetch(`${watchlistBlob.url}?ts=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
        cache: 'no-store'
    });

    if (!response.ok) {
        throw new Error(`Failed to read stored watchlist: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeStocks(Array.isArray(payload) ? payload : payload.stocks || []);
}

async function writeStoredWatchlist(stocks) {
    const body = JSON.stringify({
        stocks,
        updatedAt: new Date().toISOString()
    }, null, 2);

    await put(WATCHLIST_PATH, body, {
        access: 'public',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        contentType: 'application/json; charset=utf-8'
    });
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        try {
            const stocks = await readStoredWatchlist();
            return sendJson(res, 200, { stocks });
        } catch (error) {
            return sendJson(res, 500, {
                error: error.message || 'Failed to load watchlist'
            });
        }
    }

    if (req.method === 'PUT') {
        try {
            const body = typeof req.body === 'string'
                ? JSON.parse(req.body || '{}')
                : (req.body || {});
            const stocks = normalizeStocks(Array.isArray(body) ? body : body.stocks || []);

            await writeStoredWatchlist(stocks);
            return sendJson(res, 200, { stocks });
        } catch (error) {
            return sendJson(res, 400, {
                error: error.message || 'Failed to save watchlist'
            });
        }
    }

    res.setHeader('Allow', 'GET, PUT');
    return sendJson(res, 405, { error: 'Method not allowed' });
}