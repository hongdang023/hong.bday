// ─── Firebase Config ─────────────────────────────────────────────────────────
// ⚠️  PASTE YOUR firebaseConfig HERE after creating the Firebase project
// Replace ALL fields below with your actual values from Firebase Console
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDh__14HY36YXzl2m9My1PiiRMmjscw6-g",
    authDomain: "hong-b-day.firebaseapp.com",
    databaseURL: "https://hong-b-day-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "hong-b-day",
    storageBucket: "hong-b-day.firebasestorage.app",
    messagingSenderId: "661119834879",
    appId: "1:661119834879:web:bfb35426bf3e9eee568aca",
    measurementId: "G-6F7VRE6Q24"
};

// ⚠️  PASTE YOUR Apps Script Web App URL HERE after deploying
const APPS_SCRIPT_URL = "REPLACE_ME";

// ─── Firebase Init ────────────────────────────────────────────────────────────

let firebaseDB = null;
let claimedRef = null;

function initFirebase() {
    try {
        if (FIREBASE_CONFIG.apiKey === "REPLACE_ME") {
            console.warn("Firebase not configured — using localStorage fallback.");
            return false;
        }
        firebase.initializeApp(FIREBASE_CONFIG);
        firebaseDB = firebase.database();
        claimedRef = firebaseDB.ref('wishlist/claimed');
        return true;
    } catch (e) {
        console.error("Firebase init failed:", e);
        return false;
    }
}

// ─── CSV Loader ───────────────────────────────────────────────────────────────

// Local CSV files (source of truth)
const GUESTS_URL = 'guests.csv';
const WISHLIST_URL = 'B-Day 2026 - My Wishlist.csv';

async function loadCSV(urlOrFile) {
    const response = await fetch(urlOrFile);
    const text = await response.text();
    return parseFullCSV(text);
}

function parseFullCSV(text) {
    const rows = [];
    let cur = '';
    let row = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"') {
            if (inQuotes && text[i + 1] === '"') {
                cur += '"'; i++; // escaped quote
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            row.push(cur); cur = '';
        } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
            if (ch === '\r' && text[i + 1] === '\n') ++i; // skip \n of \r\n
            row.push(cur); cur = '';
            if (row.length > 1 || row[0] !== '') rows.push(row);
            row = [];
        } else {
            cur += ch;
        }
    }
    if (cur !== '' || row.length > 0) {
        row.push(cur);
        rows.push(row);
    }
    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim());
    return rows.slice(1).map(r => {
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = (r[idx] || '').trim(); });
        return obj;
    });
}



// ─── Main ─────────────────────────────────────────────────────────────────────

const firebaseReady = initFirebase();

let allGuests = [];
let currentGuest = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        allGuests = await loadCSV(GUESTS_URL);
    } catch (e) { console.error("Could not load guests:", e); }

    initPasswordFlow();
    initVideoFlow();
    initModals();
});

// ─── Password Flow ────────────────────────────────────────────────────────────

function initPasswordFlow() {
    const pwdBtn = document.getElementById('passwordSubmitBtn');
    const pwdInput = document.getElementById('guestPasswordInput');
    const pwdSection = document.getElementById('passwordSection');
    const videoSection = document.getElementById('videoSection');
    const errorMsg = document.getElementById('passwordError');

    // Auto-fill if ID is provided in URL (optional convenience)
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('id');
    if (idFromUrl) {
        pwdInput.value = idFromUrl;
    }

    const checkPassword = () => {
        const val = pwdInput.value.trim().toUpperCase();
        if (!val) {
            errorMsg.classList.add('show');
            return;
        }

        const guest = allGuests.find(g => g.ID.toUpperCase() === val);

        if (guest) {
            errorMsg.classList.remove('show');
            pwdSection.classList.add('hidden');
            videoSection.classList.remove('hidden');

            // Attempt to autoplay video immediately
            const video = document.getElementById('openingVideo');
            if (video) {
                video.play().catch(err => {
                    console.warn("Autoplay was prevented:", err);
                });
            }

            // Kick off the invitation load
            initInvitation(guest);
        } else {
            errorMsg.classList.add('show');
            pwdInput.focus();
        }
    };

    if (pwdBtn && pwdInput) {
        pwdBtn.addEventListener('click', checkPassword);
        pwdInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') checkPassword();
        });
    }
}

// ─── Video Flow ───────────────────────────────────────────────────────────────

function initVideoFlow() {
    const videoSection = document.getElementById('videoSection');
    const video = document.getElementById('openingVideo');
    const mainContainer = document.getElementById('mainContainer');

    if (!videoSection || !video) return;

    let hasPlayed = false;

    videoSection.addEventListener('click', () => {
        if (hasPlayed) return;
        hasPlayed = true;
        video.play().catch(() => endVideo());
    });

    const endVideo = () => {
        video.pause();
        videoSection.classList.add('hidden');
        mainContainer.classList.remove('hidden');
    };

    video.addEventListener('ended', endVideo);
}

// ─── Invitation ───────────────────────────────────────────────────────────────

async function initInvitation(guest) {
    document.getElementById('loadingGuestInfo').classList.add('hidden');

    if (guest) {
        currentGuest = guest;
        const guestId = guest.ID;
        const prefix = guestId.match(/^[A-Za-z]+/)?.[0] || '';

        if (FIREBASE_CONFIG.apiKey !== 'REPLACE_ME' && typeof firebase !== 'undefined') {
            try {
                if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);

                // 1. Log opened status
                firebase.database().ref(`tracking/${guestId}`).update({
                    opened: true,
                    openedAt: new Date().toISOString()
                });

                // 2. Override time/place if admin locked
                const snap = await firebase.database().ref(`groups/${prefix}`).once('value');
                const groupData = snap.val();
                if (groupData) {
                    if (groupData.Thoigian) guest.Thoigian = groupData.Thoigian;
                    if (groupData.Diadiem) guest.Diadiem = groupData.Diadiem;
                }
                // 3. Extra guests
                const extraSnap = await firebase.database().ref(`extraGuests/${prefix}`).once('value');
                const extra = extraSnap.val();
                if (extra) {
                    const extraArr = Array.isArray(extra) ? extra : Object.values(extra);
                    allGuests = [...allGuests, ...extraArr.map((e, i) => ({
                        ID: `${prefix}X${i}`, Ten: e.Ten, Xungho: e.Xungho || 'Bạn',
                        Thoigian: guest.Thoigian, Diadiem: guest.Diadiem
                    }))];
                }
            } catch (e) { console.warn('Firebase init/tracking:', e); }
        }

        document.getElementById('guestInfo').classList.remove('hidden');
        renderLetter(guest);
    } else {
        document.getElementById('guestError').classList.remove('hidden');
    }
}

function renderLetter(guest) {
    const x = guest.Xungho;
    const ten = guest.Ten;
    const time = (guest.Thoigian && guest.Thoigian !== 'Cập nhật sau')
        ? guest.Thoigian : 'Sẽ được thông báo sớm nhé';
    const place = (guest.Diadiem && guest.Diadiem !== 'Cập nhật sau')
        ? guest.Diadiem : 'Sẽ được thông báo sớm nhé';

    document.getElementById('letterBody').innerHTML = `
        <p class="letter-salutation">Thân gửi ${x} ${ten},</p>

        <p class="letter-p">Mỗi năm, sinh nhật đối với Hồng không chỉ là một cột mốc mới mà quan trọng hơn cả là dịp trân quý để được ngồi lại, catch-up cùng những người bạn mà Hồng hết mực yêu quý.</p>

        <p class="letter-p">Hồng thân mời ${x} đến chung vui tại buổi tiệc nhỏ này:</p>

        <div class="event-details">
            <div class="detail-item">
                <div class="detail-label">Thời gian</div>
                <div class="detail-value">${time}</div>
            </div>
            <div class="detail-item">
                <div class="detail-label">Địa điểm</div>
                <div class="detail-value">${place}</div>
            </div>
        </div>

        <p class="letter-p">Thú thật là năm nay Hồng cảm thấy bản thân rất may mắn vì đã khá no đủ và viên mãn về mặt tinh thần và tài chính rồi. Hồng đã mất nhiều ngày vắt óc chỉ để làm một cái Wishlist nhưng lướt đi lướt lại cũng chỉ là "nice-to-have" thôi :)) Có lẽ là vì hiện tại niềm vui lớn nhất của Hồng chỉ đơn giản là được gặp mặt mọi người.</p>

        <p class="letter-p">Tuy nhiên, nếu ${x} vẫn muốn dành tặng Hồng một chút bất ngờ mà chưa biết nên chọn gì, có thể ghé xem Wishlist bên dưới nhé. Hồng highly recommend là nếu các món quà vượt quá ngân sách, ${x} hoàn toàn có thể cân nhắc tặng theo nhóm cho thoải mái nhé &lt;3</p>

        <div class="cta-row">
            <button id="showWishlistBtn" class="btn primary-btn">Xem Wishlist 🎁</button>
            <button id="rsvpBtn" class="btn accent-btn">Tôi sẽ tham dự 🎉</button>
            <button id="showGuestListBtn" class="btn secondary-btn">Ai cùng đến?</button>
        </div>

        <div class="special-divider">Đặc biệt hơn...</div>

        <p class="letter-p">Trong trường hợp các món đồ trong Wishlist chưa phù hợp, hoặc ${x} muốn dành tặng Hồng một món quà mang giá trị tinh thần, Hồng sẽ rất hạnh phúc nếu nhận được:</p>

        <ul class="gift-alternatives">
            <li>Một cuốn sách cũ mà ${x} tâm đắc.</li>
            <li>Hoặc một lá thư tay nhỏ nhắn chia sẻ về: <em>"Một sản phẩm hay dịch vụ nào từ Hồng mà ${x} sẵn sàng ủng hộ/chi trả?"</em></li>
        </ul>

        <p class="letter-p">Hồng đang trong giai đoạn khám phá ngách sự nghiệp phù hợp với bản thân, nên những lời chia sẻ thực tế này từ ${x} sẽ là món quà vô giá, giúp Hồng có thêm động lực và định hướng rõ ràng hơn.</p>

        <p class="letter-closing">Rất mong được gặp ${x} nhenn!</p>

        <p class="letter-sign">Thân quý,<br>Hồng.</p>
    `;

    // Wishlist CTA
    document.getElementById('showWishlistBtn').addEventListener('click', async () => {
        document.getElementById('invitationSection').classList.add('hidden');
        document.getElementById('wishlistSection').classList.remove('hidden');
        window.scrollTo(0, 0);
        await initWishlist();
    });

    // RSVP CTA
    document.getElementById('rsvpBtn').addEventListener('click', () => {
        if (document.getElementById('rsvpBtn').dataset.isVote === 'true') {
            document.getElementById('voteModal').classList.add('active');
        } else {
            document.getElementById('rsvpGuestName').innerText = `${x} ${ten}`;
            document.getElementById('rsvpModal').classList.add('active');
        }
    });

    // Guest List CTA
    document.getElementById('showGuestListBtn').addEventListener('click', () => {
        const prefix = guest.ID.match(/^[A-Za-z]+/)?.[0] || '';
        const groupmates = allGuests.filter(g => g.ID.startsWith(prefix));
        const list = document.getElementById('guestListContent');
        list.innerHTML = groupmates.map(g => `<li>${g.Xungho} ${g.Ten}</li>`).join('');
        document.getElementById('guestListModal').classList.add('active');
    });

    document.getElementById('closeGuestListModal').addEventListener('click', () =>
        document.getElementById('guestListModal').classList.remove('active'));

    // Load vote poll for this group (if admin created one)
    initVoteWidget(guest);
}

// ─── Vote Widget ──────────────────────────────────────────────────────────────

function initVoteWidget(guest) {
    if (!firebaseReady || !firebaseDB) return;

    const prefix = guest.ID.match(/^[A-Za-z]+/)?.[0] || '';
    const voteRef = firebaseDB.ref(`votes/${prefix}`);

    voteRef.on('value', snapshot => {
        const data = snapshot.val();
        const rsvpBtn = document.getElementById('rsvpBtn');
        const voteModalBody = document.getElementById('voteModalBody');
        if (!rsvpBtn || !voteModalBody) return;

        if (!data || !data.options || data.options.length === 0) {
            // Restore normal RSVP button
            rsvpBtn.innerText = 'Tôi sẽ tham dự 🎉';
            rsvpBtn.dataset.isVote = 'false';
            return;
        }

        // We have active vote options!!
        rsvpBtn.innerText = 'Vote lịch tham gia tại đây 📅';
        rsvpBtn.dataset.isVote = 'true';

        const myVote = data.responses ? data.responses[guest.ID] : null;

        // Count votes per option
        const counts = {};
        data.options.forEach(o => counts[o] = 0);
        if (data.responses) {
            Object.values(data.responses).forEach(v => {
                if (counts[v] !== undefined) counts[v]++;
            });
        }
        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        voteModalBody.innerHTML = `
            <div class="vote-section" style="border:none; padding:10px 0 0 0; background:none;">
                <p class="letter-p" style="text-align:center; font-size: 0.95rem; margin-bottom:16px;">
                    Hồng đang chốt lịch cho nhóm mình — ${guest.Xungho} chọn ngày nào tiện nhất nhé!
                </p>
                <div class="vote-options">
                    ${data.options.map(option => {
            const count = counts[option] || 0;
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
            const isMyVote = myVote === option;
            return `
                        <button class="vote-btn ${isMyVote ? 'voted' : ''}"
                                data-option="${option}"
                                data-prefix="${prefix}"
                                data-guestid="${guest.ID}">
                            <span class="vote-label">${option}</span>
                            <span class="vote-bar-wrap">
                                <span class="vote-bar" style="width:${pct}%"></span>
                            </span>
                            <span class="vote-count">${count} phiếu${isMyVote ? ' ✓' : ''}</span>
                        </button>`;
        }).join('')}
                </div>
                ${myVote ? `<p class="vote-caption">Bạn đã chọn: <strong>${myVote}</strong> — bấm vào ngày khác để đổi ý.</p>` : ''}
                
                <div style="margin-top:20px; font-size: 0.85rem; color: var(--secondary-color); font-style: italic; text-align: center; border-top: 1px dashed #d0b8ff; padding-top: 15px;">
                    * Lưu ý: Lịch trình chốt cứng (thời gian & địa điểm) sẽ được chúng mình cập nhật thêm qua Google Calendar nhé!
                </div>
            </div>
        `;

        voteModalBody.querySelectorAll('.vote-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const opt = btn.dataset.option;
                const pref = btn.dataset.prefix;
                const gid = btn.dataset.guestid;
                firebaseDB.ref(`votes/${pref}/responses/${gid}`).set(opt);
            });
        });
    });
}


// ─── Wishlist ─────────────────────────────────────────────────────────────────

let wishlistLoaded = false;
let wishlistData = [];
let firebaseClaimedData = {};

async function initWishlist() {
    if (wishlistLoaded) return;
    wishlistLoaded = true;

    const grid = document.getElementById('wishlistGrid');
    grid.innerHTML = '<p style="text-align:center;color:#666;">Đang tải...</p>';

    try {
        const rows = await loadCSV(WISHLIST_URL);
        wishlistData = rows
            .filter(r => r.ID && r.Tenmon)
            .map(r => {
                const rawPrice = r.Gia || '';
                const numericPrice = parseInt(rawPrice.replace(/[^0-9]/g, ''), 10) || 0;
                let category = 'low';
                if (numericPrice >= 500000) category = 'high';
                else if (numericPrice >= 200000) category = 'mid';
                return {
                    id: r.ID, title: r.Tenmon, variant: r.Mahang || '',
                    price: numericPrice,
                    priceDisplay: rawPrice.replace(' ₫', '').trim(),
                    link: r.Link || '', category
                };
            });
    } catch (err) {
        grid.innerHTML = '<p style="text-align:center;color:#666;">Không tải được danh sách quà.</p>';
        return;
    }

    if (firebaseReady && claimedRef) {
        // Real-time Firebase sync
        claimedRef.on('value', snapshot => {
            firebaseClaimedData = snapshot.val() || {};
            renderWishlist(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
        });
    } else {
        // Fallback: localStorage
        firebaseClaimedData = JSON.parse(localStorage.getItem('hongbday_claimed')) || {};
        renderWishlist('all');
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            renderWishlist(e.target.dataset.filter);
        });
    });

    window.refreshWishlist = () =>
        renderWishlist(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
}

function renderWishlist(filterType) {
    const grid = document.getElementById('wishlistGrid');
    const mySessionKey = getSessionKey();

    const visible = wishlistData.filter(item => {
        if (filterType !== 'all' && item.category !== filterType) return false;
        const claimInfo = firebaseClaimedData[item.id];
        // Hide items claimed by others; show items claimed by me
        if (claimInfo && claimInfo !== mySessionKey) return false;
        return true;
    });

    if (visible.length === 0) {
        grid.innerHTML = '<p style="text-align:center;width:100%;color:#666;font-style:italic;grid-column:1/-1;">Mọi món quà trong mức giá này đã có người chọn rồi.</p>';
        return;
    }

    grid.innerHTML = '';
    visible.forEach(item => {
        const isMine = firebaseClaimedData[item.id] === getSessionKey();
        const card = document.createElement('div');
        card.className = `gift-card ${isMine ? 'my-claim' : ''}`;
        card.innerHTML = `
            <div>
                <div class="gift-title">${item.title}</div>
                ${item.variant ? `<div class="gift-variant">${item.variant}</div>` : ''}
                <div class="gift-price">${item.priceDisplay}</div>
                ${item.link ? `<a href="${item.link}" target="_blank" rel="noopener" class="gift-link">Xem sản phẩm</a>` : ''}
            </div>
            <button class="claim-btn"
                data-id="${item.id}"
                data-title="${item.title}"
                data-action="${isMine ? 'unclaim' : 'claim'}"
            >${isMine ? 'Hủy chọn món này' : 'Tặng món này'}</button>
        `;
        grid.appendChild(card);
    });

    document.querySelectorAll('.claim-btn').forEach(btn => {
        btn.addEventListener('click', handleClaimBtnClick);
    });
}

// Session key: anonymous but persistent per browser tab session
function getSessionKey() {
    let key = sessionStorage.getItem('hongbday_session');
    if (!key) {
        key = 'user_' + Math.random().toString(36).slice(2, 10);
        sessionStorage.setItem('hongbday_session', key);
    }
    return key;
}

// ─── Gift Claim ───────────────────────────────────────────────────────────────

let selectedGiftId = null;

function handleClaimBtnClick(e) {
    const action = e.target.dataset.action;
    const id = e.target.dataset.id;
    const title = e.target.dataset.title;

    if (action === 'unclaim') {
        if (firebaseReady && claimedRef) {
            claimedRef.child(id).remove();
        } else {
            const d = JSON.parse(localStorage.getItem('hongbday_claimed')) || {};
            delete d[id];
            localStorage.setItem('hongbday_claimed', JSON.stringify(d));
            firebaseClaimedData = d;
            renderWishlist(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
        }
        return;
    }

    selectedGiftId = id;
    document.getElementById('modalGiftName').innerText = title;
    document.getElementById('claimModal').classList.add('active');
}

function confirmClaim() {
    if (!selectedGiftId) return;
    const key = getSessionKey();

    if (firebaseReady && claimedRef) {
        claimedRef.child(selectedGiftId).set(key);
    } else {
        const d = JSON.parse(localStorage.getItem('hongbday_claimed')) || {};
        d[selectedGiftId] = key;
        localStorage.setItem('hongbday_claimed', JSON.stringify(d));
        firebaseClaimedData = d;
        renderWishlist(document.querySelector('.filter-btn.active')?.dataset.filter || 'all');
    }

    document.getElementById('claimModal').classList.remove('active');
    selectedGiftId = null;
}

// ─── RSVP ────────────────────────────────────────────────────────────────────

async function submitRSVP() {
    const email = document.getElementById('rsvpEmail').value.trim();
    const note = document.getElementById('rsvpNote').value.trim();
    const statusEl = document.getElementById('rsvpStatus');

    if (!email || !email.includes('@')) {
        statusEl.innerText = 'Vui lòng nhập email hợp lệ nhé!';
        statusEl.className = 'rsvp-status error';
        return;
    }

    const submitBtn = document.getElementById('rsvpSubmitBtn');
    submitBtn.disabled = true;
    submitBtn.innerText = 'Đang gửi...';
    statusEl.innerText = '';

    try {
        const guestId = currentGuest?.ID || '';
        const guestName = currentGuest ? `${currentGuest.Xungho} ${currentGuest.Ten}` : '';
        const time = currentGuest?.Thoigian || '';
        const place = currentGuest?.Diadiem || '';

        // Save to Firebase
        if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
            await firebase.database().ref(`tracking/${guestId}/rsvp`).set({
                name: guestName,
                email,
                note,
                time,
                place,
                timestamp: new Date().toISOString()
            });
        }

        // Send to Apps Script if configured
        if (APPS_SCRIPT_URL !== "REPLACE_ME") {
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'rsvp', guestId, guestName, email, note, time, place })
            });
        }

        statusEl.innerText = 'Hồng nhận được rồi! Hẹn gặp bạn nhenn 🎉';
        statusEl.className = 'rsvp-status success';
        submitBtn.innerText = 'Đã gửi ✓';
    } catch (err) {
        statusEl.innerText = 'Có lỗi xảy ra, bạn thử lại sau nhé.';
        statusEl.className = 'rsvp-status error';
        submitBtn.disabled = false;
        submitBtn.innerText = 'Xác nhận tham dự';
    }
}

// ─── Modals ───────────────────────────────────────────────────────────────────

function initModals() {
    // Claim modal
    document.getElementById('cancelClaim').onclick = () =>
        document.getElementById('claimModal').classList.remove('active');
    document.getElementById('confirmClaim').onclick = confirmClaim;

    // RSVP modal
    document.getElementById('cancelRSVP').onclick = () =>
        document.getElementById('rsvpModal').classList.remove('active');
    document.getElementById('rsvpSubmitBtn').onclick = submitRSVP;

    // Guest list modal
    const closeGuestModalBtn = document.getElementById('closeGuestListModal');
    if (closeGuestModalBtn) {
        closeGuestModalBtn.onclick = () => document.getElementById('guestListModal').classList.remove('active');
    }

    // Vote modal
    const closeVoteModalBtn = document.getElementById('closeVoteModal');
    if (closeVoteModalBtn) {
        closeVoteModalBtn.onclick = () => document.getElementById('voteModal').classList.remove('active');
    }

    window.onclick = e => {
        ['claimModal', 'rsvpModal', 'guestListModal', 'voteModal'].forEach(id => {
            const m = document.getElementById(id);
            if (m && e.target === m) m.classList.remove('active');
        });
    };
}
