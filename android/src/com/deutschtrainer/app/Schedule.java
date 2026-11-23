package com.deutschtrainer.app;

import android.content.Context;
import android.content.SharedPreferences;

import java.util.Calendar;
import java.util.Locale;

/**
 * Розклад охоронця.
 *
 * День ділиться на дві «зміни»:
 *   ранок — з 4:00 до 18:00,
 *   вечір — з 18:00 до 4:00 наступного дня.
 * На початку кожної зміни TikTok і YouTube закриті. Щойно в цю зміну здано
 * новий урок на 1 (від 92%), вони відкриті до кінця зміни.
 */
final class Schedule {
    static final int DAY_START = 4; // о 4:00 починається новий день (щоб уночі не будило о 0:00)
    static final int EVENING = 18;  // з 18:00 потрібен вечірній урок
    static final int PASS = 92;     // відсоток для оцінки 1 (як NOTE_1 у js/views/exercises.js)

    /** Застосунки, які закриваємо (TikTok у різних країнах, TikTok Lite, YouTube). */
    static final String[] BLOCKED_APPS = {
            "com.zhiliaoapp.musically",
            "com.zhiliaoapp.musically.go",
            "com.ss.android.ugc.trill",
            "com.ss.android.ugc.aweme",
            "com.google.android.youtube",
            "app.revanced.android.youtube",
    };

    /** Браузери: пакет → id поля з адресою. Через них теж не можна дивитися TikTok і YouTube. */
    static final String[][] BROWSERS = {
            {"com.android.chrome", "com.android.chrome:id/url_bar"},
            {"com.chrome.beta", "com.chrome.beta:id/url_bar"},
            {"com.sec.android.app.sbrowser", "com.sec.android.app.sbrowser:id/location_bar_edit_text"},
            {"org.mozilla.firefox", "org.mozilla.firefox:id/mozac_browser_toolbar_url_view"},
            {"com.microsoft.emmx", "com.microsoft.emmx:id/url_bar"},
            {"com.opera.browser", "com.opera.browser:id/url_field"},
            {"com.opera.mini.native", "com.opera.mini.native:id/url_field"},
            {"com.brave.browser", "com.brave.browser:id/url_bar"},
            {"com.yandex.browser", "com.yandex.browser:id/bro_omnibar_address_title_text"},
            {"com.mi.globalbrowser", "com.mi.globalbrowser:id/url"},
            {"com.android.browser", "com.android.browser:id/url"},
    };

    /** Адреса, яку не можна відкривати в браузері під час блокування. */
    static boolean isBlockedUrl(CharSequence text) {
        if (text == null) return false;
        String s = text.toString().toLowerCase(Locale.ROOT);
        // tiktok.com, m.youtube.com, youtu.be/… — але не «google.com/search?q=youtube.com»
        return s.matches("(?s)^(https?://)?([a-z0-9-]+\\.)*(tiktok\\.com|youtube\\.com|youtu\\.be)([/?#:].*)?$");
    }

    private Schedule() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("guard", Context.MODE_PRIVATE);
    }

    static boolean isEvening(Calendar now) {
        int h = now.get(Calendar.HOUR_OF_DAY);
        return h >= EVENING || h < DAY_START;
    }

    /** «2026-11-21» — до якого дня належить момент (ніч до 4:00 — ще вчорашній день). */
    static String dayKey(Calendar now) {
        Calendar c = (Calendar) now.clone();
        c.add(Calendar.HOUR_OF_DAY, -DAY_START);
        return String.format(Locale.ROOT, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    /** Ключ поточної зміни, напр. «2026-11-21/evening». */
    static String slotKey(Calendar now) {
        return dayKey(now) + (isEvening(now) ? "/evening" : "/morning");
    }

    static boolean isLocked(Context c) {
        return isLocked(c, Calendar.getInstance());
    }

    static boolean isLocked(Context c, Calendar now) {
        String key = slotKey(now);
        return !key.equals(prefs(c).getString(isEvening(now) ? "eveningDone" : "morningDone", ""));
    }

    /** До котрої години вільний після зарахованого уроку. */
    static String freeUntil(Calendar now) {
        return isEvening(now) ? "до " + DAY_START + ":00 ранку" : "до " + EVENING + ":00";
    }

    /** Чому зараз закрито — коротко, для смуги вгорі. */
    static String lockedReason(Calendar now) {
        return isEvening(now) ? "Вечірній урок ще не здано" : "Ранковий урок ще не здано";
    }

    /**
     * Сайт повідомив результат вправ. Повертає JSON для сайту:
     * {"counted": true/false, "title": "…", "text": "…"} — або text порожній, якщо казати нічого.
     */
    static String lessonPassed(Context c, String lessonId, int pct, boolean isNew) {
        Calendar now = Calendar.getInstance();
        if (!isLocked(c, now)) {
            return json(false, "", "");
        }
        if (pct < PASS) {
            return json(false, "TikTok і YouTube ще закриті",
                    "Потрібна оцінка 1, тобто від " + PASS + "%. Перечитайте помилки й спробуйте ще раз.");
        }
        if (!isNew) {
            return json(false, "Цей урок уже був зданий на 1",
                    "Щоб відкрити TikTok і YouTube, здайте на 1 новий урок.");
        }
        prefs(c).edit()
                .putString(isEvening(now) ? "eveningDone" : "morningDone", slotKey(now))
                .putString("lastLesson", lessonId)
                .apply();
        return json(true, "Зараховано! TikTok і YouTube відкриті",
                isEvening(now) ? "Вільні аж до 4:00 ранку." : "Вільні аж до 18:00. Після 18:00 знадобиться ще один, вечірній урок.");
    }

    private static String json(boolean counted, String title, String text) {
        return "{\"counted\":" + counted + ",\"title\":" + quote(title) + ",\"text\":" + quote(text) + "}";
    }

    private static String quote(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            if (ch == '"' || ch == '\\') b.append('\\');
            b.append(ch);
        }
        return b.append('"').toString();
    }
}
