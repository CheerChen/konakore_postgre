// Native fullscreen integration for PhotoSwipe v5
// Based on PhotoSwipe documentation pattern: use openPromise + appendToEl

function getFullscreenAPI() {
    let enterFS;
    let exitFS;
    let elementFS;
    let changeEvent;

    if (document.documentElement.requestFullscreen) {
        enterFS = 'requestFullscreen';
        exitFS = 'exitFullscreen';
        elementFS = 'fullscreenElement';
        changeEvent = 'fullscreenchange';
    } else if (document.documentElement.webkitRequestFullscreen) {
        enterFS = 'webkitRequestFullscreen';
        exitFS = 'webkitExitFullscreen';
        elementFS = 'webkitFullscreenElement';
        changeEvent = 'webkitfullscreenchange';
    }

    if (!enterFS) return null;

    return {
        request(el) {
            if (enterFS === 'webkitRequestFullscreen') {
                // Older Safari API doesn't return a promise
                el[enterFS](Element.ALLOW_KEYBOARD_INPUT);
                return undefined;
            } else {
                return el[enterFS]();
            }
        },
        exit() {
            return document[exitFS]();
        },
        isFullscreen() {
            return Boolean(document[elementFS]);
        },
        change: changeEvent,
    };
}

function createFullscreenContainer() {
    const el = document.createElement('div');
    el.style.background = '#000';
    el.style.width = '100%';
    el.style.height = '100%';
    el.style.display = 'none';
    document.body.appendChild(el);
    return el;
}

/**
 * Create a fullscreen controller for a PhotoSwipeLightbox instance.
 *
 * Usage:
 *   const fs = createNativeFullscreenController();
 *   const lightbox = new PhotoSwipeLightbox({
 *     ...,
 *     openPromise: fs.getOpenPromise(),
 *     appendToEl: fs.getAppendToEl(),
 *   });
 *   lightbox.on('close', fs.onClose);
 */
export function createNativeFullscreenController() {
    const fullscreenAPI = getFullscreenAPI();
    const container = createFullscreenContainer();

    function getOpenPromise() {
        return new Promise((resolve) => {
            if (!fullscreenAPI || fullscreenAPI.isFullscreen()) {
                resolve();
                return;
            }

            document.addEventListener(
                fullscreenAPI.change,
                () => {
                    container.style.display = 'block';
                    setTimeout(() => resolve(), 300);
                },
                { once: true }
            );

            // Request fullscreen can fail in some browsers/contexts (Permissions check failed)
            // e.g. not initiated by a user gesture, iframe restrictions, etc.
            try {
                const maybePromise = fullscreenAPI.request(container);
                if (maybePromise && typeof maybePromise.catch === 'function') {
                    maybePromise.catch(() => resolve());
                }
            } catch (e) {
                // Fallback: don't block PhotoSwipe opening
                resolve();
            }
        });
    }

    function getAppendToEl() {
        return fullscreenAPI ? container : document.body;
    }

    function onClose() {
        container.style.display = 'none';
        if (fullscreenAPI && fullscreenAPI.isFullscreen()) {
            fullscreenAPI.exit();
        }
    }

    function destroy() {
        try {
            container.remove();
        } catch {
            // ignore
        }
    }

    return {
        fullscreenAPI,
        container,
        getOpenPromise,
        getAppendToEl,
        onClose,
        destroy,
    };
}
