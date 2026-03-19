

class ConnectivityService {
    constructor() {
        this.isOnline = true;
        this.failureCount = 0;
        this.listeners = new Set();
        this.pollingInterval = null;

        this.MAX_FAILURES = 3;
        this.RETRY_DELAY = 5000; // 5 seconds
    }

    subscribe(callback) {
        this.listeners.add(callback);
        // Immediately notify current state
        callback(this.isOnline);

        return () => {
            this.listeners.delete(callback);
        };
    }

    notifyListeners() {
        this.listeners.forEach(listener => listener(this.isOnline));
    }

    reportFailure() {
        if (!this.isOnline) return; // Already offline, ignore

        this.failureCount++;
        console.warn(`ConnectivityService: Failure reported. Count: ${this.failureCount}/${this.MAX_FAILURES}`);

        if (this.failureCount >= this.MAX_FAILURES) {
            this.setOffline();
        }
    }

    setOffline() {
        if (!this.isOnline) return;

        console.warn('ConnectivityService: Threshold reached. Going offline.');
        this.isOnline = false;
        this.notifyListeners();
        this.startPolling();
    }

    setOnline() {
        if (this.isOnline) return;

        console.log('ConnectivityService: Connection restored. Going online.');
        this.isOnline = true;
        this.failureCount = 0;
        this.stopPolling();
        this.notifyListeners();
    }

    startPolling() {
        if (this.pollingInterval) return;

        console.log('ConnectivityService: Starting connectivity polling...');
        this.pollingInterval = setInterval(() => {
            this.checkConnectivity();
        }, this.RETRY_DELAY);
    }

    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async checkConnectivity() {
        try {
            // Attempt to load a small image to check connectivity to the image source
            // Using a timestamp to prevent caching
            const testImage = new Image();
            await new Promise((resolve, reject) => {
                testImage.onload = resolve;
                testImage.onerror = reject;
                // Use a likely stable image path or a specific test endpoint if available.
                // For now, we'll try to hit the proxy root or a known path if possible.
                testImage.src = `/konachan-proxy/favicon.ico?t=${Date.now()}`;
            });
            this.setOnline();
        } catch (error) {
            console.warn('ConnectivityService: Connectivity check failed.', error);
            // Still offline, continue polling
        }
    }
}

export const connectivityService = new ConnectivityService();

