(() => {
    const SAVE_BUTTON_ID = "SnapLeet-button";
    const TOAST_ID = "SnapLeet-toast";
    const STYLE_ID = "SnapLeet-style";
    const CHECK_INTERVAL_MS = 1200;

    let lastLocation = location.href;

    function cleanText(value) {
        return String(value || "").replace(/\s+/g, " ").trim();
    }

    function isDiscussionPage() {
        const path = location.pathname.toLowerCase();

        return (
            path.includes("/discuss/post/") ||
            path.includes("/discussion/") ||
            (path.includes("/solutions/") &&
                path.split("/solutions/")[1]?.length > 0)
        );
    }

    function slugToTitle(slug) {
        return cleanText(slug)
            .split("-")
            .filter(Boolean)
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    }

    // Try multiple selectors and return first valid text
    function getFirstValidText(selectors) {
        for (let i = 0; i < selectors.length; i++) {
            const el = document.querySelector(selectors[i]);

            if (!el) continue;

            const text = cleanText(el.innerText || el.textContent);

            if (text) return text;
        }

        return "";
    }

    function getDiscussionTitle() {
        // Step 1: DOM
        const titleFromDOM = getFirstValidText([
            "main h1",
            "article h1",
            "h1"
        ]);

        if (titleFromDOM) return titleFromDOM;

        // Step 2: meta
        const meta = document.querySelector('meta[property="og:title"]');
        const titleFromMeta = cleanText(meta?.content);

        if (titleFromMeta) return titleFromMeta;

        // Step 3: document.title
        const cleaned = cleanText(
            document.title.replace(/\s*-\s*LeetCode\s*$/i, "")
        );

        return cleaned || "Untitled Discussion";
    }

    function getProblemName() {
        // Step 1: from links
        const links = document.querySelectorAll('a[href*="/problems/"]');

        for (let i = 0; i < links.length; i++) {
            const text = cleanText(links[i].textContent);
            if (text) return text;
        }

        // Step 2: from URL
        const match = location.pathname.match(/\/problems\/([^/]+)/i);
        if (match && match[1]) {
            return slugToTitle(match[1]);
        }

        // Step 3: from meta
        const meta = document.querySelector('meta[property="og:title"]');
        const ogTitle = cleanText(meta?.content);

        if (ogTitle) {
            const parts = ogTitle.split("|").map((p) => cleanText(p));

            if (parts.length > 1 && parts[1]) {
                return parts[1];
            }
        }

        return "Unknown Problem";
    }

    function getDescription() {
        const selectors = [
            "article",
            "main article",
            "[data-track-load*='description']",
            "[class*='break-words']",
            "[class*='content']",
            "main",
            "[role='main']"
        ];

        const seen = new Set();
        const results = [];

        selectors.forEach((selector) => {
            const nodes = document.querySelectorAll(selector);

            nodes.forEach((node) => {
                if (!node || seen.has(node)) return;

                seen.add(node);

                const text = cleanText(node.innerText || node.textContent);

                if (text.length >= 120) {
                    results.push(text);
                }
            });
        });

        results.sort((a, b) => b.length - a.length);

        if (results.length > 0) {
            return results[0];
        }

        const fallback = cleanText(
            document.querySelector('meta[name="description"]')?.content
        );

        return fallback || "";
    }

    function buildPayload() {
        return {
            id: crypto?.randomUUID?.() || String(Date.now()),
            title: getDiscussionTitle(),
            description: getDescription(),
            url: location.href,
            problemName: getProblemName(),
            createdAt: Date.now()
        };
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;

        style.textContent = `
      #${SAVE_BUTTON_ID} {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 999999;
        border: none;
        border-radius: 999px;
        padding: 10px 16px;
        background: linear-gradient(135deg, #2563eb, #7c3aed);
        color: white;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        box-shadow: 0 10px 28px rgba(0,0,0,0.22);
      }

      #${SAVE_BUTTON_ID}:hover {
        transform: translateY(-2px);
      }

      #${TOAST_ID} {
        position: fixed;
        right: 20px;
        bottom: 70px;
        background: #111827;
        color: white;
        padding: 8px 12px;
        border-radius: 8px;
        opacity: 0;
        transform: translateY(10px);
        transition: 0.2s;
      }

      #${TOAST_ID}.show {
        opacity: 1;
        transform: translateY(0);
      }
    `;

        document.documentElement.appendChild(style);
    }

    function showToast(message) {
        let toast = document.getElementById(TOAST_ID);

        if (!toast) {
            toast = document.createElement("div");
            toast.id = TOAST_ID;
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add("show");

        clearTimeout(showToast.timer);

        showToast.timer = setTimeout(() => {
            toast.classList.remove("show");
        }, 1700);
    }

    function sendMessage(message) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage(message, (res) => {
                if (chrome.runtime.lastError) {
                    resolve({ status: "error" });
                    return;
                }
                resolve(res || { status: "error" });
            });
        });
    }

    async function handleSave(button) {
        button.disabled = true;
        const oldText = button.textContent;
        button.textContent = "Saving...";

        const res = await sendMessage({
            type: "SAVE_DISCUSSION",
            payload: buildPayload()
        });

        if (res?.status === "saved") {
            showToast("Saved successfully");
        } else if (res?.status === "duplicate") {
            showToast("Already saved");
        } else {
            showToast("Failed to save");
        }

        button.disabled = false;
        button.textContent = oldText;
    }

    function removeButton() {
        const btn = document.getElementById(SAVE_BUTTON_ID);
        if (btn) btn.remove();
    }

    function addSaveButton() {
        injectStyles();

        if (!isDiscussionPage()) {
            removeButton();
            return;
        }

        if (document.getElementById(SAVE_BUTTON_ID)) return;

        const btn = document.createElement("button");
        btn.id = SAVE_BUTTON_ID;
        btn.textContent = "Save Discussion";

        btn.addEventListener("click", () => handleSave(btn));

        document.body.appendChild(btn);
    }

    function debounce(fn, delay) {
        let timer;

        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    const debouncedAddButton = debounce(addSaveButton, 200);

    function observeDOM() {
        const observer = new MutationObserver(() => {
            if (location.href !== lastLocation) {
                lastLocation = location.href;
            }

            debouncedAddButton();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    function watchURLChange() {
        setInterval(() => {
            if (location.href !== lastLocation) {
                lastLocation = location.href;
                addSaveButton();
            }
        }, CHECK_INTERVAL_MS);
    }

    function init() {
        addSaveButton();
        observeDOM();
        watchURLChange();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();