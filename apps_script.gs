/**
 * Google Apps Script — Hồng's B-Day 2026
 * 
 * HƯỚNG DẪN DEPLOY:
 * 1. Mở Google Sheet → Extensions → Apps Script
 * 2. Paste toàn bộ file này vào
 * 3. Điền các hằng số ở phần CONFIG bên dưới
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy Deployment URL → paste vào script.js (APPS_SCRIPT_URL)
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // Lấy từ URL của Google Sheet
const GUEST_SHEET    = 'List of Guests';       // Tên tab khách mời
const HONG_EMAIL     = 'YOUR_GMAIL@gmail.com'; // Gmail của Hồng (để gửi thông báo)
const SITE_URL       = 'https://YOUR-SITE.netlify.app'; // URL sau khi deploy Netlify

// ─── RSVP Handler (POST from website) ─────────────────────────────────────────
function doPost(e) {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'rsvp') {
        handleRSVP(data);
    }

    return ContentService
        .createTextOutput(JSON.stringify({ status: 'ok' }))
        .setMimeType(ContentService.MimeType.JSON);
}

function handleRSVP(data) {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(GUEST_SHEET);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];

    const idCol     = headers.indexOf('ID');
    const emailCol  = headers.indexOf('Email');
    const rsvpCol   = headers.indexOf('RSVP');

    // Find guest row and update Email + RSVP
    for (let i = 1; i < rows.length; i++) {
        if (rows[i][idCol] === data.guestId) {
            sheet.getRange(i + 1, emailCol + 1).setValue(data.email);
            sheet.getRange(i + 1, rsvpCol + 1).setValue('Có');
            break;
        }
    }

    // Send Google Calendar invite to guest
    sendCalendarInvite(data);

    // Notify Hồng
    notifyHong(data);
}

function sendCalendarInvite(data) {
    if (!data.email || !data.time || data.time.includes('thông báo')) return;

    try {
        // Parse event time from "Thứ 3, ngày 3/3" format
        // Adjust logic below based on actual time format in your Sheet
        const eventDate = parseEventDate(data.time);
        if (!eventDate) return;

        const startTime = new Date(eventDate);
        startTime.setHours(18, 0, 0); // Default 18:00 — adjust as needed
        const endTime   = new Date(eventDate);
        endTime.setHours(21, 0, 0);

        CalendarApp.getDefaultCalendar().createEvent(
            `🎂 Sinh nhật Hồng — Đặng 2 Hồng 2`,
            startTime,
            endTime,
            {
                location: data.place || '',
                description: `Thiệp mời cá nhân của ${data.guestName}:\n${SITE_URL}/?id=${data.guestId}`,
                guests: data.email,
                sendInvites: true
            }
        );
    } catch (err) {
        Logger.log('Calendar invite error: ' + err.message);
    }
}

function parseEventDate(timeStr) {
    // Handles "Thứ 3, ngày 3/3" → date in 2026
    const match = timeStr.match(/(\d+)\/(\d+)/);
    if (!match) return null;
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1; // JS months 0-indexed
    return new Date(2026, month, day);
}

function notifyHong(data) {
    GmailApp.sendEmail(
        HONG_EMAIL,
        `✅ RSVP mới: ${data.guestName}`,
        `${data.guestName} (${data.guestId}) vừa xác nhận tham dự!\n\nEmail: ${data.email}\nLời nhắn: ${data.note || '(không có)'}`
    );
}

// ─── BATCH: Gửi email mời đến tất cả khách ────────────────────────────────────
// Chạy thủ công từ Apps Script Editor: Run → sendInviteEmails
function sendInviteEmails() {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(GUEST_SHEET);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0];

    const idCol       = headers.indexOf('ID');
    const tenCol      = headers.indexOf('Ten');
    const xunghoCol   = headers.indexOf('Xungho');
    const emailCol    = headers.indexOf('Email');
    const sentCol     = headers.indexOf('DaGui'); // Thêm cột "DaGui" để tránh gửi trùng

    let sent = 0;

    for (let i = 1; i < rows.length; i++) {
        const row     = rows[i];
        const id      = row[idCol];
        const ten     = row[tenCol];
        const xungho  = row[xunghoCol];
        const email   = row[emailCol];
        const daGui   = sentCol >= 0 ? row[sentCol] : '';

        if (!email || !id || daGui === 'Đã gửi') continue;

        const link = `${SITE_URL}/?id=${id}`;

        GmailApp.sendEmail(
            email,
            `🎂 ${xungho} ${ten} ơi — Thiệp mời sinh nhật Hồng`,
            '', // plain text (empty — use HTML below)
            {
                htmlBody: buildEmailHTML(xungho, ten, link),
                name: 'Đặng Tuyết Hồng'
            }
        );

        // Mark as sent
        if (sentCol >= 0) sheet.getRange(i + 1, sentCol + 1).setValue('Đã gửi');

        sent++;
        Utilities.sleep(500); // Tránh rate limit
    }

    Logger.log(`Đã gửi ${sent} email mời.`);
    Browser.msgBox(`✅ Đã gửi ${sent} email mời thành công!`);
}

function buildEmailHTML(xungho, ten, link) {
    return `
    <div style="font-family:'Be Vietnam Pro',Arial,sans-serif;max-width:560px;margin:auto;background:#fdf8ff;border-radius:16px;overflow:hidden;border:2px solid #d0b8ff;">
        <div style="background:linear-gradient(135deg,#6a5acd,#ff8da1);padding:30px;text-align:center;">
            <h1 style="color:white;font-size:1.6rem;margin:0;">🎂 Thiệp mời sinh nhật</h1>
            <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Đặng 2 Hồng 2 — 2026</p>
        </div>
        <div style="padding:28px 32px;">
            <p style="font-size:1rem;color:#333;">Thân gửi <strong>${xungho} ${ten}</strong>,</p>
            <p style="color:#555;line-height:1.7;">Hồng gửi đến ${xungho} một thiệp mời nhỏ, được cá nhân hóa riêng cho ${xungho} — bao gồm thời gian, địa điểm và Wishlist quà tặng.</p>
            <div style="text-align:center;margin:28px 0;">
                <a href="${link}" style="background:#ff8da1;color:white;padding:14px 32px;border-radius:30px;text-decoration:none;font-weight:700;font-size:1rem;display:inline-block;">
                    Mở thiệp mời của ${xungho} 💌
                </a>
            </div>
            <p style="color:#888;font-size:0.85rem;text-align:center;">Hoặc copy link: ${link}</p>
        </div>
        <div style="background:#f5eeff;padding:14px;text-align:center;font-size:0.82rem;color:#888;">
            Thân quý, Hồng 💜
        </div>
    </div>`;
}
